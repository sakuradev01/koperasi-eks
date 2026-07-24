import express from "express";
const router = express.Router();
import { Member } from "../models/member.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Savings } from "../models/savings.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import multer from "multer";
import path from "path";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";
import {
  getDonationOverview,
  createDonation,
  createCheckoutIntent,
} from "../controllers/public/donation.controller.js";
import {
  getPublicInvoiceByNumber,
  getPublicMemberInvoicesByUuid,
} from "../controllers/admin/invoice.controller.js";

const { donasi: donasiDir } = ensureUploadsSubdirs();

const donationStorage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    cb(null, donasiDir + path.sep);
  },
  filename: function filename(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "donasi-" + uniqueSuffix + "-" + file.originalname);
  },
});

const donationUpload = multer({
  storage: donationStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get("/invoices/:invoiceNumber", getPublicInvoiceByNumber);
router.get("/member-invoices/:uuid", getPublicMemberInvoicesByUuid);

const isBlankAddress = (value) => !String(value || "").trim();

const getPublicAddressState = (member) => ({
  completeAddress: member.completeAddress || "",
  addressUpdateStatus: member.addressUpdateStatus || "none",
  addressUpdateRequestedAt: member.addressUpdateRequestedAt || null,
  addressUpdateVerifiedAt: member.addressUpdateVerifiedAt || null,
  requiresAddressCompletion:
    member.isVerified &&
    (isBlankAddress(member.completeAddress) ||
      (member.addressUpdateStatus || "none") === "pending"),
});

// Public API untuk integrasi eksternal (tanpa auth)
// GET /api/public/savings - Ambil semua data savings dengan detail lengkap
const getPublicSavings = asyncHandler(async (req, res) => {
  try {
    const savings = await Savings.find({ status: "Approved" })
      .populate({
        path: "memberId",
        select: "uuid name gender phone city",
        populate: {
          path: "user",
          select: "username"
        }
      })
      .populate({
        path: "productId",
        select: "title depositAmount returnProfit termDuration description"
      })
      .sort({ createdAt: -1 });

    // Format data untuk konsumsi eksternal
    const formattedSavings = savings.map(saving => ({
      id: saving._id,
      uuid: saving.uuid,
      member: {
        uuid: saving.memberId?.uuid,
        name: saving.memberId?.name,
        gender: saving.memberId?.gender,
        phone: saving.memberId?.phone,
        city: saving.memberId?.city,
        username: saving.memberId?.user?.username
      },
      product: {
        title: saving.productId?.title,
        depositAmount: saving.productId?.depositAmount,
        returnProfit: saving.productId?.returnProfit,
        termDuration: saving.productId?.termDuration,
        description: saving.productId?.description
      },
      amount: saving.amount,
      installmentPeriod: saving.installmentPeriod,
      savingsDate: saving.savingsDate,
      type: saving.type,
      status: saving.status,
      description: saving.description,
      createdAt: saving.createdAt,
      updatedAt: saving.updatedAt
    }));

    res.status(200).json({
      success: true,
      message: "Data savings berhasil diambil",
      data: formattedSavings,
      total: formattedSavings.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data savings",
      error: error.message
    });
  }
});

// GET /api/public/members - Ambil semua data anggota
const getPublicMembers = asyncHandler(async (req, res) => {
  try {
    const members = await Member.find()
      .populate("user", "username")
      .populate("product", "title depositAmount returnProfit termDuration")
      .sort({ createdAt: -1 });

    // Calculate total savings for each member
    const membersWithSavings = await Promise.all(
      members.map(async (member) => {
        const approvedSavings = await Savings.find({
          memberId: member._id,
          type: "Setoran",
          status: "Approved",
        });

        const totalSavings = approvedSavings.reduce(
          (sum, saving) => sum + saving.amount,
          0
        );

        return {
          id: member._id,
          uuid: member.uuid,
          name: member.name,
          gender: member.gender,
          phone: member.phone,
          city: member.city,
          completeAddress: member.completeAddress,
          username: member.user?.username,
          product: member.product ? {
            title: member.product.title,
            depositAmount: member.product.depositAmount,
            returnProfit: member.product.returnProfit,
            termDuration: member.product.termDuration
          } : null,
          totalSavings: totalSavings,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Data anggota berhasil diambil",
      data: membersWithSavings,
      total: membersWithSavings.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data anggota",
      error: error.message
    });
  }
});

// GET /api/public/products - Ambil semua data produk
const getPublicProducts = asyncHandler(async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 });

    const formattedProducts = products.map(product => ({
      id: product._id,
      title: product.title,
      depositAmount: product.depositAmount,
      returnProfit: product.returnProfit,
      termDuration: product.termDuration,
      description: product.description,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));

    res.status(200).json({
      success: true,
      message: "Data produk berhasil diambil",
      data: formattedProducts,
      total: formattedProducts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data produk",
      error: error.message
    });
  }
});

// GET /api/public/summary - Ambil ringkasan data
const getPublicSummary = asyncHandler(async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments();
    const totalProducts = await Product.countDocuments({ isActive: true });
    
    const approvedSavings = await Savings.find({
      type: "Setoran",
      status: "Approved"
    });
    
    const approvedWithdrawals = await Savings.find({
      type: "Penarikan", 
      status: "Approved"
    });

    const totalSavings = approvedSavings.reduce((sum, s) => sum + s.amount, 0);
    const totalWithdrawals = approvedWithdrawals.reduce((sum, s) => sum + s.amount, 0);
    const balance = totalSavings - totalWithdrawals;

    res.status(200).json({
      success: true,
      message: "Ringkasan data berhasil diambil",
      data: {
        totalMembers,
        totalProducts,
        totalSavings,
        totalWithdrawals,
        balance,
        totalTransactions: approvedSavings.length + approvedWithdrawals.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil ringkasan data",
      error: error.message
    });
  }
});

// GET /api/public/member/:uuid - Ambil data member berdasarkan UUID dengan detail lengkap
const getMemberByUuid = asyncHandler(async (req, res) => {
  try {
    const { uuid } = req.params;
    
    // Cari member berdasarkan UUID
    const member = await Member.findOne({ uuid })
      .populate("user", "username")
      .populate("product", "title depositAmount returnProfit termDuration description");
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member dengan UUID tersebut tidak ditemukan"
      });
    }

    // Ambil semua savings untuk member ini
    const savings = await Savings.find({ 
      memberId: member._id,
      status: "Approved" 
    })
    .populate("productId", "title depositAmount returnProfit termDuration")
    .sort({ createdAt: -1 });

    // Hitung total setoran dan penarikan
    const totalSetoran = savings
      .filter(s => s.type === "Setoran")
      .reduce((sum, s) => sum + s.amount, 0);
    
    const totalPenarikan = savings
      .filter(s => s.type === "Penarikan")
      .reduce((sum, s) => sum + s.amount, 0);

    const saldo = totalSetoran - totalPenarikan;

    // Format response
    const response = {
      member: {
        uuid: member.uuid,
        name: member.name,
        gender: member.gender,
        phone: member.phone,
        city: member.city,
        completeAddress: member.completeAddress,
        username: member.user?.username
      },
      product: member.product ? {
        title: member.product.title,
        depositAmount: member.product.depositAmount,
        returnProfit: member.product.returnProfit,
        termDuration: member.product.termDuration,
        description: member.product.description
      } : null,
      savings: {
        totalSetoran: totalSetoran,
        totalPenarikan: totalPenarikan,
        saldo: saldo,
        totalTransaksi: savings.length,
        riwayat: savings.map(s => ({
          uuid: s.uuid,
          amount: s.amount,
          installmentPeriod: s.installmentPeriod,
          savingsDate: s.savingsDate,
          type: s.type,
          status: s.status,
          description: s.description,
          product: s.productId ? {
            title: s.productId.title,
            depositAmount: s.productId.depositAmount,
            returnProfit: s.productId.returnProfit,
            termDuration: s.productId.termDuration
          } : null,
          createdAt: s.createdAt
        }))
      }
    };

    res.status(200).json({
      success: true,
      message: "Data member berhasil diambil",
      data: response
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data member",
      error: error.message
    });
  }
});

// GET /api/public/student-dashboard/:uuid - Student Dashboard Savings by UUID (Public)
const getStudentDashboardSavings = asyncHandler(async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid) {
      return res.status(400).json({
        success: false,
        message: "Member UUID wajib diisi"
      });
    }

    // Find member by UUID
    const member = await Member.findOne({ uuid }).populate('productId');
    
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Kamu belum menjadi bagian dari anggota koperasi"
      });
    }

    if (!member.productId) {
      return res.status(404).json({
        success: false,
        message: "Member belum memiliki produk simpanan yang dipilih"
      });
    }

    // Get product details (tenor/term duration)
    const product = member.productId;

    // Get deposit history for this member (only approved deposits)
    const depositHistory = await Savings.find({ 
      memberId: member._id,
      type: "Setoran",
      status: "Approved"
    }).select('installmentPeriod amount proofFile');

    // Map deposit history by installment period
    const realizationAmountMap = {};
    const realizationProofFileMap = {};
    
    depositHistory.forEach(deposit => {
      realizationAmountMap[deposit.installmentPeriod] = deposit.amount;
      realizationProofFileMap[deposit.installmentPeriod] = deposit.proofFile || 0;
    });

    // Generate projection data for all periods
    const delivered = [];
    const currentDate = new Date();
    
    for (let i = 1; i <= product.termDuration; i++) {
      // Calculate date projection (adding i months to current date)
      const projectionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const dateProjection = projectionDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });

      delivered.push({
        installment_period: i,
        projection: product.depositAmount.toString(),
        dateProjection: dateProjection,
        realization: realizationAmountMap[i] ? realizationAmountMap[i].toString() : 0,
        payment_proof: realizationProofFileMap[i] || 0
      });
    }

    res.status(200).json(delivered);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard student",
      error: error.message
    });
  }
});

// POST /api/public/register-koperasi - Student dashboard registration
const registerKoperasi = asyncHandler(async (req, res) => {
  try {
    const {
      uuid,
      name,
      gender,
      email,
      phone,
      birthPlace,
      birthDate,
      nik,
      completeAddress,
      accountNumber,
      bankName,
      accountHolderName,
      productId,
      signatureImage,
      ktpImage,
      selfieImage,
      livenessLeftImage,
      livenessRightImage,
      faceMatchScore,
      riplText,
      riplVersion,
      riplAgreedAt,
    } = req.body;

    // Validate required fields
    if (!uuid || !name || !gender) {
      return res.status(400).json({
        success: false,
        message: "UUID, nama, dan jenis kelamin wajib diisi",
      });
    }

    // Check if UUID already registered
    const existingMember = await Member.findOne({ uuid });
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: "UUID sudah terdaftar sebagai anggota koperasi",
        isAlreadyRegistered: true,
        isVerified: existingMember.isVerified,
      });
    }

    // Validate productId if provided
    if (productId) {
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(400).json({
          success: false,
          message: "Produk simpanan tidak valid atau tidak aktif",
        });
      }
    }

    // Generate UUID for user account
    const generateUserUUID = () => {
      const timestamp = Date.now().toString();
      const random = Math.random().toString(36).substring(2, 8);
      return `USER_${timestamp}_${random}`;
    };

    // Generate username based on name
    const generateUsername = (name) => {
      const cleanName = name.toLowerCase().replace(/\s+/g, "");
      const timestamp = Date.now().toString().slice(-6);
      return `${cleanName}_${timestamp}`;
    };

    // Create user account
    const username = generateUsername(name);
    const user = new User({
      username,
      password: "member123",
      name,
      role: "staff",
      uuid: generateUserUUID(),
    });
    await user.save();

    // Create member with isVerified: false
    const member = new Member({
      uuid,
      name,
      gender,
      email: email || "",
      phone: phone || "",
      birthPlace: birthPlace || "",
      birthDate: birthDate ? new Date(birthDate) : null,
      nik: nik || "",
      completeAddress: completeAddress || "",
      accountNumber: accountNumber || "",
      bankName: bankName || "",
      accountHolderName: accountHolderName || "",
      signatureImage: signatureImage || "",
      ktpImage: ktpImage || "",
      selfieImage: selfieImage || "",
      livenessLeftImage: livenessLeftImage || "",
      livenessRightImage: livenessRightImage || "",
      faceMatchScore: faceMatchScore || null,
      riplText: riplText || "",
      riplVersion: riplVersion || "",
      riplAgreedAt: riplAgreedAt ? new Date(riplAgreedAt) : null,
      productId: productId || null,
      user: user._id,
      isVerified: false,
      registrationSource: "student_dashboard",
      // New registrations with full face docs skip legacy identity gate after admin verifies membership
      identityVerifyStatus: [
        ktpImage,
        selfieImage,
        livenessLeftImage,
        livenessRightImage,
      ].every((v) => String(v || "").trim().length > 10)
        ? "approved"
        : "none",
      identityVerifyVerifiedAt: [
        ktpImage,
        selfieImage,
        livenessLeftImage,
        livenessRightImage,
      ].every((v) => String(v || "").trim().length > 10)
        ? new Date()
        : null,
    });
    await member.save();

    res.status(201).json({
      success: true,
      message: "Pendaftaran berhasil! Menunggu verifikasi admin.",
      data: {
        uuid: member.uuid,
        name: member.name,
        isVerified: member.isVerified,
        ...getPublicAddressState(member),
      },
    });
  } catch (error) {
    console.error("Register koperasi error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mendaftar koperasi",
      error: error.message,
    });
  }
});

// GET /api/public/check-member/:uuid - Check member registration & verification status
const checkMemberStatus = asyncHandler(async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid) {
      return res.status(400).json({
        success: false,
        message: "UUID wajib diisi",
      });
    }

    const member = await Member.findOne({ uuid })
      .populate("productId", "title depositAmount termDuration");

    if (!member) {
      return res.status(200).json({
        success: true,
        status: "not_registered",
        message: "Belum terdaftar sebagai anggota koperasi",
      });
    }

    if (!member.isVerified) {
      return res.status(200).json({
        success: true,
        status: "pending_verification",
        message: "Pendaftaran sedang menunggu verifikasi admin",
        data: {
          uuid: member.uuid,
          name: member.name,
          registeredAt: member.createdAt,
          ...getPublicAddressState(member),
          product: member.productId ? {
            title: member.productId.title,
            depositAmount: member.productId.depositAmount,
          } : null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      status: "verified",
      message: "Anggota koperasi terverifikasi",
      data: {
        uuid: member.uuid,
        name: member.name,
        isVerified: member.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal memeriksa status member",
      error: error.message,
    });
  }
});

// Routes
router.get("/savings", getPublicSavings);
router.get("/members", getPublicMembers);
router.get("/products", getPublicProducts);
router.get("/summary", getPublicSummary);
router.get("/member/:uuid", getMemberByUuid);
router.get("/student-dashboard/:uuid", getStudentDashboardSavings);
router.post("/register-koperasi", registerKoperasi);
router.get("/check-member/:uuid", checkMemberStatus);
router.get("/donations/overview/:studentUuid", getDonationOverview);
router.post("/donations", donationUpload.single("proofFile"), createDonation);
router.post("/donations/checkout-intents", createCheckoutIntent);

// One-time migration route (accessible via browser)
// Usage: GET /api/public/migrate-members?key=samit-migrate-2026
router.get("/migrate-members", asyncHandler(async (req, res) => {
  const { key } = req.query;
  if (key !== "samit-migrate-2026") {
    return res.status(403).json({ success: false, message: "Invalid key" });
  }

  const result = await Member.updateMany(
    { isVerified: { $exists: false } },
    { $set: { isVerified: true, registrationSource: "admin" } }
  );

  const result2 = await Member.updateMany(
    { isVerified: false, registrationSource: { $exists: false } },
    { $set: { isVerified: true, registrationSource: "admin" } }
  );

  res.status(200).json({
    success: true,
    message: `Migration selesai. ${result.modifiedCount + result2.modifiedCount} member diperbarui.`,
    batch1: result.modifiedCount,
    batch2: result2.modifiedCount,
  });
}));

export default router;
