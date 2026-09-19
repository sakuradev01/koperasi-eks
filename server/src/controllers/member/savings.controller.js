import { Savings } from "../../models/savings.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { Product } from "../../models/product.model.js";
import {
  calculateSavingsSchedule,
  getFirstIncompletePeriod,
  PAID_SAVINGS_STATUSES,
} from "../../services/savingsSchedule.service.js";
import fs from "fs/promises";
import {
  getEffectiveMembershipStatus,
  getMembershipStatusMessage,
} from "../../utils/membershipStatus.js";

const isBlankAddress = (value) => !String(value || "").trim();

const discardUploadedProof = async (file) => {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to discard rejected savings proof:", error.message);
    }
  }
};

// Get Member's Savings
export const getMemberSavings = asyncHandler(async (req, res) => {
  try {
    const memberId = req.member.memberId;
    
    // Cari member berdasarkan ID dari token
    const member = await Member.findById(memberId);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan",
      });
    }

    // Cari savings berdasarkan member ID
    const savings = await Savings.find({ memberId: member._id })
      .populate('productId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Data savings berhasil diambil",
      data: {
        member: {
          uuid: member.uuid,
          name: member.name,
          membershipStatus: getEffectiveMembershipStatus(member),
        },
        savings: savings,
        total: savings.length,
        totalAmount: savings.reduce((sum, saving) => sum + saving.amount, 0),
      },
    });
  } catch (error) {
    console.error("Get member savings error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});

// Create New Saving for Member
export const createMemberSaving = asyncHandler(async (req, res) => {
  try {
    const memberId = req.member.memberId;
    const { amount, productId, description, installmentPeriod, paymentDate } = req.body;

    // Parse amount to number if it's a string
    const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    console.log('[Member Savings] Received data:', {
      amount: amount,
      parsedAmount: parsedAmount,
      typeOfAmount: typeof amount,
      productId: productId,
      installmentPeriod: installmentPeriod,
      memberId: memberId
    });

    // Validasi input
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      console.log('[Member Savings] Amount validation failed:', parsedAmount);
      return res.status(400).json({
        success: false,
        message: "Jumlah saving harus lebih dari 0",
      });
    }

    // Cari member berdasarkan ID dari token
    const member = await Member.findById(memberId).populate("currentUpgradeId");
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan",
      });
    }

    const membershipStatus = getEffectiveMembershipStatus(member);
    if (membershipStatus !== "active") {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: membershipStatus === "draft" ? "MEMBERSHIP_DRAFT" : "MEMBERSHIP_INACTIVE",
        membershipStatus,
        message: getMembershipStatusMessage(membershipStatus),
      });
    }

    if (isBlankAddress(member.completeAddress)) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: "ADDRESS_REQUIRED",
        message: "Mohon lengkapi alamat anda sebelum upload pembayaran.",
      });
    }

    if (["pending", "rejected"].includes(member.addressUpdateStatus || "none")) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: member.addressUpdateStatus === "rejected" ? "ADDRESS_REJECTED" : "ADDRESS_PENDING_VERIFICATION",
        message: member.addressUpdateStatus === "rejected"
          ? `Alamat ditolak: ${member.addressUpdateRejectionReason || "Silakan perbaiki dan kirim ulang."}`
          : "Alamat terbaru sedang menunggu verifikasi admin. Upload pembayaran aktif kembali setelah disetujui.",
      });
    }

    // Legacy members without KTP/liveness — must complete identity verification before pay
    const identityStatus = member.identityVerifyStatus || "none";
    const hasIdentityDocs = [
      member.ktpImage,
      member.selfieImage,
      member.livenessLeftImage,
      member.livenessRightImage,
    ].every((v) => String(v || "").trim().length > 10);

    if (!hasIdentityDocs || ["pending", "rejected"].includes(identityStatus)) {
      await discardUploadedProof(req.file);
      if (identityStatus === "pending") {
        return res.status(409).json({
          success: false,
          code: "IDENTITY_PENDING_VERIFICATION",
          message:
            "Dokumen verifikasi wajah sedang menunggu verifikasi admin. Upload pembayaran aktif kembali setelah disetujui.",
        });
      }
      if (identityStatus === "rejected") {
        return res.status(409).json({
          success: false,
          code: "IDENTITY_REJECTED",
          message: `Verifikasi wajah ditolak: ${
            member.identityVerifyRejectionReason || "Silakan kirim ulang dokumen."
          }`,
        });
      }
      return res.status(409).json({
        success: false,
        code: "IDENTITY_DOCS_REQUIRED",
        message:
          "Akun lama wajib melengkapi verifikasi wajah (KTP, selfie, liveness kiri/kanan) sebelum upload pembayaran.",
      });
    }

    if (!member.productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID diperlukan untuk membuat saving. Silakan hubungi admin untuk mengatur produk member.",
      });
    }

    // Product dan schedule harus berasal dari member yang sedang login. Jangan
    // percaya productId dari browser karena dapat menunjuk ke paket anggota lain.
    const requestedProductId = String(productId || member.productId);
    if (requestedProductId !== String(member.productId)) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: "PRODUCT_MISMATCH",
        message: "Produk pembayaran tidak sesuai dengan produk simpanan Anda.",
      });
    }

    const product = await Product.findById(member.productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product tidak ditemukan",
      });
    }

    const paidSavings = await Savings.find({
      memberId: member._id,
      type: "Setoran",
      status: { $in: PAID_SAVINGS_STATUSES },
    }).lean();
    const schedule = calculateSavingsSchedule({
      termDuration: product.termDuration,
      baseDeposit: product.depositAmount,
      upgrade: member.currentUpgradeId,
      savings: paidSavings,
    });
    const firstIncompletePeriod = getFirstIncompletePeriod(schedule);

    if (!firstIncompletePeriod) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: "SAVINGS_COMPLETE",
        message: "Seluruh periode simpanan sudah lunas.",
      });
    }

    // Use installmentPeriod from request or the first period that is still
    // incomplete. Periods cannot be skipped through a forged direct request.
    const parsedPeriod = installmentPeriod === undefined || installmentPeriod === ""
      ? firstIncompletePeriod.period
      : Number(installmentPeriod);
    const finalPeriod = Math.trunc(parsedPeriod);
    if (!Number.isInteger(finalPeriod) || finalPeriod < 1 || finalPeriod > schedule.termDuration) {
      await discardUploadedProof(req.file);
      return res.status(400).json({
        success: false,
        code: "INVALID_INSTALLMENT_PERIOD",
        message: `Periode simpanan harus berada di antara 1 dan ${schedule.termDuration}.`,
      });
    }
    if (finalPeriod !== firstIncompletePeriod.period) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: "INSTALLMENT_SEQUENCE",
        message: `Pembayaran berikutnya adalah periode ${firstIncompletePeriod.period}.`,
        data: { nextPeriod: firstIncompletePeriod.period },
      });
    }

    const pendingForPeriod = await Savings.exists({
      memberId: member._id,
      installmentPeriod: finalPeriod,
      type: "Setoran",
      status: "Pending",
    });
    if (pendingForPeriod) {
      await discardUploadedProof(req.file);
      return res.status(409).json({
        success: false,
        code: "PAYMENT_PENDING",
        message: "Pembayaran pada periode ini masih menunggu verifikasi admin.",
      });
    }

    console.log('[Member Savings] Using installmentPeriod:', finalPeriod);

    // Calculate partial sequence for this period
    const existingSavingsCount = await Savings.countDocuments({
      memberId: member._id,
      productId: product._id,
      installmentPeriod: finalPeriod,
    });

    const partialSequence = existingSavingsCount + 1;

    // Auto-detect payment type
    const calculatedPaymentType =
      parsedAmount < firstIncompletePeriod.remaining ? "Partial" : "Full";

    // Handle file upload if present
    const proofFilePath = req.file ? req.file.filename : null;
    
    // Buat saving baru
    const newSaving = new Savings({
      memberId: member._id,
      productId: product._id,
      amount: parsedAmount,
      savingsDate: new Date(),
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      installmentPeriod: finalPeriod,
      description: description || `Pembayaran Simpanan Periode - ${finalPeriod} ${partialSequence > 1 ? `(#${partialSequence})` : ''}`,
      type: "Setoran",
      status: "Pending", // Member API creates pending, needs admin approval
      paymentType: calculatedPaymentType,
      partialSequence: partialSequence,
      notes: "",
      proofFile: proofFilePath,
    });

    await newSaving.save();

    // Populate product data
    await newSaving.populate('product');

    res.status(201).json({
      success: true,
      message: "Saving berhasil dibuat",
      data: {
        saving: newSaving,
        member: {
          uuid: member.uuid,
          name: member.name,
        },
      },
    });
  } catch (error) {
    console.error("Create member saving error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});

// Get Specific Saving by ID
export const getMemberSavingById = asyncHandler(async (req, res) => {
  try {
    const memberId = req.member.memberId;
    const { id } = req.params;

    // Cari member berdasarkan ID dari token
    const member = await Member.findById(memberId);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan",
      });
    }

    // Cari saving berdasarkan ID dan pastikan milik member yang login
    const saving = await Savings.findOne({ 
      _id: id, 
      memberId: member._id 
    }).populate('productId');

    if (!saving) {
      return res.status(404).json({
        success: false,
        message: "Data saving tidak ditemukan atau bukan milik Anda",
      });
    }

    res.status(200).json({
      success: true,
      message: "Data saving berhasil diambil",
      data: {
        saving: saving,
        member: {
          uuid: member.uuid,
          name: member.name,
        },
      },
    });
  } catch (error) {
    console.error("Get member saving by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});

// Get Member Savings Summary
export const getMemberSavingsSummary = asyncHandler(async (req, res) => {
  try {
    const memberId = req.member.memberId;
    
    // Cari member berdasarkan ID dari token
    const member = await Member.findById(memberId);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan",
      });
    }

    // Agregasi data savings
    const savingsData = await Savings.aggregate([
      { $match: { memberId: member._id } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          lastTransaction: { $max: "$createdAt" },
          firstTransaction: { $min: "$createdAt" },
        }
      }
    ]);

    const summary = savingsData[0] || {
      totalAmount: 0,
      totalTransactions: 0,
      lastTransaction: null,
      firstTransaction: null,
    };

    res.status(200).json({
      success: true,
      message: "Summary savings berhasil diambil",
      data: {
        member: {
          uuid: member.uuid,
          name: member.name,
        },
        summary: summary,
      },
    });
  } catch (error) {
    console.error("Get member savings summary error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});
