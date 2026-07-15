import { Member } from "../../models/member.model.js";
import { User } from "../../models/user.model.js";
import { Savings } from "../../models/savings.model.js";
import { Loan } from "../../models/loan.model.js";
import { LoanPayment } from "../../models/loanPayment.model.js";
import { ProductUpgrade } from "../../models/productUpgrade.model.js";
import mongoose from "mongoose";
import fs from "fs/promises";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get all members
const getAllMembers = asyncHandler(async (req, res) => {
  // Filter by verification status
  const { verified, addressUpdateStatus } = req.query;
  let filter = {};
  if (verified === "true") filter.isVerified = true;
  else if (verified === "false") filter.isVerified = false;
  if (addressUpdateStatus) {
    filter.addressUpdateStatus = addressUpdateStatus;
  }

  const members = await Member.find(filter)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description")
    .populate({
      path: "currentUpgradeId",
      populate: [
        { path: "oldProductId", select: "title depositAmount" },
        { path: "newProductId", select: "title depositAmount" }
      ]
    })
    .sort({ createdAt: -1 });

  // Calculate total savings for each member
  const membersWithSavings = await Promise.all(
    members.map(async (member) => {
      // Method 1: Try to find by current member._id
      let approvedSavings = await Savings.find({
        memberId: member._id,
        type: "Setoran",
        status: "Approved",
      });

      // Method 2: If no savings found, try to find by populating member and matching UUID
      if (approvedSavings.length === 0) {
        const allSavings = await Savings.find({
          type: "Setoran",
          status: "Approved"
        }).populate('memberId', 'uuid name');
        
        approvedSavings = allSavings.filter(saving => 
          saving.memberId && saving.memberId.uuid === member.uuid
        );
      }

      // Calculate total using simple reduce
      const totalSavings = approvedSavings.reduce(
        (sum, saving) => sum + saving.amount,
        0
      );

      return {
        ...member.toObject(),
        totalSavings: totalSavings,
      };
    })
  );

  res.status(200).json({
    success: true,
    data: membersWithSavings,
  });
});

// Get member by UUID
const getMemberByUuid = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid })
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description")
    .populate({
      path: "currentUpgradeId",
      populate: [
        { path: "oldProductId", select: "title depositAmount" },
        { path: "newProductId", select: "title depositAmount" }
      ]
    });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  // Add upgrade info if member has upgraded
  const memberData = member.toObject();
  if (member.hasUpgraded && member.currentUpgradeId) {
    memberData.upgradeInfo = member.currentUpgradeId;
  }

  res.status(200).json({
    success: true,
    data: memberData,
  });
});

// Create new member
const createMember = asyncHandler(async (req, res) => {
  const {
    uuid,
    name,
    gender,
    phone,
    city,
    completeAddress,
    accountNumber,
    productId,
    savingsStartDate, // Tanggal mulai tabungan (opsional)
    email,
    birthPlace,
    birthDate,
    nik,
    bankName,
    accountHolderName,
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
  if (!name || !gender) {
    return res.status(400).json({
      success: false,
      message: "Nama dan jenis kelamin harus diisi",
    });
  }

  // Check if UUID already exists if provided
  if (uuid) {
    const existingMember = await Member.findOne({ uuid });
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: "UUID sudah digunakan",
      });
    }
  }

  // Generate UUID for user
  const generateUserUUID = () => {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `USER_${timestamp}_${random}`;
  };

  // Generate username based on name
  const generateUsername = (name) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const timestamp = Date.now().toString().slice(-6);
    return `${cleanName}_${timestamp}`;
  };

  // Create user account for the member
  const username = generateUsername(name);
  const user = new User({
    username,
    password: "member123", // Default password for all members
    name,
    role: "staff",
    uuid: generateUserUUID(),
  });

  await user.save();

  // Use provided UUID or generate new one
  const memberUUID =
    uuid ||
    (() => {
      const timestamp = Date.now().toString();
      const random = Math.random().toString(36).substring(2, 8);
      return `MEMBER_${timestamp}_${random}`;
    })();

  // Create member — admin-created members are auto-verified
  const member = new Member({
    name,
    gender,
    phone,
    city,
    completeAddress,
    accountNumber: accountNumber || "",
    user: user._id,
    uuid: memberUUID,
    productId: productId || null,
    savingsStartDate: savingsStartDate ? new Date(savingsStartDate) : null,
    email: email || "",
    birthPlace: birthPlace || "",
    birthDate: birthDate ? new Date(birthDate) : null,
    nik: nik || "",
    bankName: bankName || "",
    accountHolderName: accountHolderName || "",
    signatureImage: signatureImage || "",
    ktpImage: ktpImage || "",
    selfieImage: selfieImage || "",
    livenessLeftImage: livenessLeftImage || "",
    livenessRightImage: livenessRightImage || "",
    faceMatchScore: faceMatchScore ?? null,
    riplText: riplText || "",
    riplVersion: riplVersion || "",
    riplAgreedAt: riplAgreedAt ? new Date(riplAgreedAt) : null,
    isVerified: true,
    registrationSource: "admin",
  });

  await member.save();

  // Populate user data
  const populatedMember = await Member.findById(member._id)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description");

  res.status(201).json({
    success: true,
    data: populatedMember,
    message: "Member berhasil dibuat",
  });
});

// Update member
const updateMember = asyncHandler(async (req, res) => {
  const { uuid } = req.params;
  const {
    uuid: newUuid,
    name,
    gender,
    phone,
    city,
    completeAddress,
    accountNumber,
    productId,
    savingsStartDate, // Tanggal mulai tabungan (opsional)
    email,
    birthPlace,
    birthDate,
    nik,
    bankName,
    accountHolderName,
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

  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  // Check if new UUID is already used by another member
  if (newUuid && newUuid !== uuid) {
    const existingMember = await Member.findOne({ uuid: newUuid });
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: "UUID sudah digunakan oleh member lain",
      });
    }
  }

  // Update member data
  member.uuid = newUuid || member.uuid;
  member.name = name || member.name;
  member.gender = gender || member.gender;
  member.phone = phone || member.phone;
  member.city = city || member.city;
  member.completeAddress = completeAddress || member.completeAddress;
  member.accountNumber = accountNumber !== undefined ? accountNumber : member.accountNumber;
  if (productId !== undefined) {
    member.productId = productId || null;
  }
  if (savingsStartDate !== undefined) {
    member.savingsStartDate = savingsStartDate ? new Date(savingsStartDate) : null;
  }
  if (email !== undefined) member.email = email;
  if (birthPlace !== undefined) member.birthPlace = birthPlace;
  if (birthDate !== undefined) member.birthDate = birthDate ? new Date(birthDate) : null;
  if (nik !== undefined) member.nik = nik;
  if (bankName !== undefined) member.bankName = bankName;
  if (accountHolderName !== undefined) member.accountHolderName = accountHolderName;
  if (signatureImage !== undefined) member.signatureImage = signatureImage || "";
  if (ktpImage !== undefined) member.ktpImage = ktpImage || "";
  if (selfieImage !== undefined) member.selfieImage = selfieImage || "";
  if (livenessLeftImage !== undefined) member.livenessLeftImage = livenessLeftImage || "";
  if (livenessRightImage !== undefined) member.livenessRightImage = livenessRightImage || "";
  if (faceMatchScore !== undefined) member.faceMatchScore = faceMatchScore ?? null;
  if (riplText !== undefined) member.riplText = riplText || "";
  if (riplVersion !== undefined) member.riplVersion = riplVersion || "";
  if (riplAgreedAt !== undefined) member.riplAgreedAt = riplAgreedAt ? new Date(riplAgreedAt) : null;

  await member.save();

  // Populate user data
  const populatedMember = await Member.findById(member._id)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description");

  res.status(200).json({
    success: true,
    data: populatedMember,
    message: "Member berhasil diperbarui",
  });
});

// Delete member (cascade delete related data)
const deleteMember = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  const session = await mongoose.startSession();

  // Collect proof files to delete after DB commit
  const savingsProofFiles = [];
  const loanPaymentProofFiles = [];

  const safeUnlink = async (filePath) => {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore missing files
      if (err && err.code !== "ENOENT") {
        console.warn("Failed to delete file:", filePath, err.message);
      }
    }
  };

  const collectProofFiles = async (qryOpts = {}) => {
    const savingsDocs = await Savings.find({ memberId: member._id }, "proofFile", qryOpts).lean();
    for (const s of savingsDocs) {
      if (s.proofFile) savingsProofFiles.push(s.proofFile);
    }

    const paymentDocs = await LoanPayment.find({ memberId: member._id }, "proofFile", qryOpts).lean();
    for (const p of paymentDocs) {
      if (p.proofFile) loanPaymentProofFiles.push(p.proofFile);
    }
  };

  try {
    // Prefer transaction when Mongo supports it (replica set / mongos)
    await session.withTransaction(async () => {
      await collectProofFiles({ session });

      await LoanPayment.deleteMany({ memberId: member._id }).session(session);
      await Loan.deleteMany({ memberId: member._id }).session(session);
      await Savings.deleteMany({ memberId: member._id }).session(session);
      await ProductUpgrade.deleteMany({ memberId: member._id }).session(session);

      await User.deleteOne({ _id: member.user }).session(session);
      await Member.deleteOne({ _id: member._id }).session(session);
    });
  } catch (err) {
    // Fallback: standalone MongoDB doesn't support transactions
    const msg = String(err?.message || "");
    const isTxnUnsupported = msg.includes("Transaction numbers are only allowed") || msg.includes("replica set") || msg.includes("mongos");

    if (!isTxnUnsupported) throw err;

    console.warn("Mongo transactions not supported; falling back to non-transaction delete:", msg);

    // Collect proof files first
    await collectProofFiles();

    // Best-effort deletes (order matters less without transaction)
    await LoanPayment.deleteMany({ memberId: member._id });
    await Loan.deleteMany({ memberId: member._id });
    await Savings.deleteMany({ memberId: member._id });
    await ProductUpgrade.deleteMany({ memberId: member._id });

    await User.deleteOne({ _id: member.user });
    await Member.deleteOne({ _id: member._id });
  } finally {
    session.endSession();
  }

  // Delete files outside transaction
  await Promise.all(
    savingsProofFiles.map((filename) => {
      // savings controller stores only filename
      const filePath = resolveUploadedFilePath(filename, { defaultSubdir: "simpanan" });
      return safeUnlink(filePath);
    }),
  );

  await Promise.all(
    loanPaymentProofFiles.map((proofPath) => {
      // loan payment stores a URL-like path: /uploads/pinjaman/{filename}
      const filePath = resolveUploadedFilePath(proofPath);
      return safeUnlink(filePath);
    })
  );

  res.status(200).json({
    success: true,
    message: "Member berhasil dihapus (termasuk transaksi terkait)",
  });
});

// Validate member UUID
const validateMemberUuid = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid });

  if (member) {
    return res.status(200).json({
      success: true,
      isValid: true,
      message: "UUID valid",
    });
  } else {
    return res.status(404).json({
      success: false,
      isValid: false,
      message: "UUID tidak valid",
    });
  }
});

// Mark member as completed (uang sudah di-TF ke student)
const markAsCompleted = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  if (member.isCompleted) {
    return res.status(400).json({
      success: false,
      message: "Member sudah ditandai lunas sebelumnya",
    });
  }

  member.isCompleted = true;
  member.completedAt = new Date();
  member.completedBy = req.user._id;

  await member.save();

  res.status(200).json({
    success: true,
    message: "Member berhasil ditandai sebagai LUNAS",
    data: {
      uuid: member.uuid,
      name: member.name,
      isCompleted: member.isCompleted,
      completedAt: member.completedAt,
    },
  });
});

// Unmark member as completed
const unmarkAsCompleted = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  member.isCompleted = false;
  member.completedAt = null;
  member.completedBy = null;

  await member.save();

  res.status(200).json({
    success: true,
    message: "Status lunas member berhasil dibatalkan",
  });
});

// Verify member (admin approves registration)
const verifyMember = asyncHandler(async (req, res) => {
  const { uuid } = req.params;
  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({ success: false, message: "Member tidak ditemukan" });
  }

  if (member.isVerified) {
    return res.status(400).json({ success: false, message: "Member sudah diverifikasi" });
  }

  member.isVerified = true;
  member.verifiedBy = req.user._id;
  member.verifiedAt = new Date();
  if (member.completeAddress && member.completeAddress.trim()) {
    member.addressUpdateStatus = "approved";
    member.addressUpdateVerifiedBy = req.user._id;
    member.addressUpdateVerifiedAt = new Date();
  }
  await member.save();

  const populatedMember = await Member.findById(member._id)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description");

  res.status(200).json({
    success: true,
    data: populatedMember,
    message: "Member berhasil diverifikasi",
  });
});

// Unverify member
const unverifyMember = asyncHandler(async (req, res) => {
  const { uuid } = req.params;
  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({ success: false, message: "Member tidak ditemukan" });
  }

  member.isVerified = false;
  member.verifiedBy = null;
  member.verifiedAt = null;
  await member.save();

  res.status(200).json({
    success: true,
    message: "Status verifikasi member berhasil dibatalkan",
  });
});

// Approve member address update without changing main member verification.
const approveMemberAddress = asyncHandler(async (req, res) => {
  const { uuid } = req.params;
  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({ success: false, message: "Member tidak ditemukan" });
  }

  if (!member.completeAddress || !member.completeAddress.trim()) {
    return res.status(400).json({
      success: false,
      message: "Alamat masih kosong. Lengkapi alamat sebelum verifikasi.",
    });
  }

  if ((member.addressUpdateStatus || "none") !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Tidak ada perubahan alamat yang menunggu verifikasi",
    });
  }

  member.addressUpdateStatus = "approved";
  member.addressUpdateVerifiedAt = new Date();
  member.addressUpdateVerifiedBy = req.user._id;
  await member.save();

  const populatedMember = await Member.findById(member._id)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description");

  res.status(200).json({
    success: true,
    data: populatedMember,
    message: "Alamat member berhasil diverifikasi",
  });
});

// Reject member address update with reason.
const rejectMemberAddress = asyncHandler(async (req, res) => {
  const { uuid } = req.params;
  const { rejectionReason } = req.body;
  const member = await Member.findOne({ uuid });

  if (!member) return res.status(404).json({ success: false, message: "Member tidak ditemukan" });

  if ((member.addressUpdateStatus || "none") !== "pending") {
    return res.status(400).json({ success: false, message: "Tidak ada perubahan alamat yang menunggu verifikasi" });
  }

  if (!rejectionReason || !rejectionReason.trim()) {
    return res.status(400).json({ success: false, message: "Alasan penolakan wajib diisi" });
  }

  member.addressUpdateStatus = "rejected";
  member.addressUpdateRejectionReason = rejectionReason.trim();
  member.addressUpdateVerifiedAt = new Date();
  member.addressUpdateVerifiedBy = req.user._id;
  await member.save();

  const populatedMember = await Member.findById(member._id)
    .populate("user", "username email isActive")
    .populate("product", "title depositAmount termDuration returnProfit description");

  res.status(200).json({ success: true, data: populatedMember, message: "Perubahan alamat berhasil ditolak" });
});
// Get pending verification count
const getPendingCount = asyncHandler(async (req, res) => {
  const registrationPending = await Member.countDocuments({ isVerified: false });
  const addressPending = await Member.countDocuments({ addressUpdateStatus: "pending" });
  res.status(200).json({
    success: true,
    data: {
      count: registrationPending + addressPending,
      registrationPending,
      addressPending,
    },
  });
});

// Export members to Excel (TSV-as-XLS, batched savings aggregation)
const exportMembersExcel = asyncHandler(async (req, res) => {
  const { verified, addressUpdateStatus, isCompleted, productId, search } = req.query;
  let filter = {};
  if (verified === "true") filter.isVerified = true;
  else if (verified === "false") filter.isVerified = false;
  if (addressUpdateStatus) filter.addressUpdateStatus = addressUpdateStatus;
  if (isCompleted === "true") filter.isCompleted = true;
  else if (isCompleted === "false") filter.isCompleted = false;
  if (productId) filter.productId = productId;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { uuid: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { nik: { $regex: search, $options: "i" } },
    ];
  }

  const members = await Member.find(filter)
    .populate("user", "username email")
    .populate("product", "title depositAmount")
    .populate({
      path: "currentUpgradeId",
      populate: [{ path: "newProductId", select: "title" }],
    })
    .sort({ createdAt: -1 });

  const memberIds = members.map((m) => m._id);
  const savingsAgg = memberIds.length
    ? await Savings.aggregate([
        {
          $match: {
            memberId: { $in: memberIds },
            type: "Setoran",
            status: "Approved",
          },
        },
        { $group: { _id: "$memberId", total: { $sum: "$amount" } } },
      ])
    : [];
  const savingsMap = new Map(savingsAgg.map((s) => [String(s._id), s.total]));

  const esc = (v) => String(v ?? "").replace(/[\t\n\r]+/g, " ").trim();
  const fmt = (d) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(d);
    }
  };
  const fmtDateOnly = (d) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("id-ID");
    } catch {
      return String(d);
    }
  };

  const headers = [
    "No",
    "UUID",
    "Nama Lengkap",
    "Gender",
    "Phone",
    "Email",
    "Tempat Lahir",
    "Tanggal Lahir",
    "NIK",
    "Kota",
    "Alamat Lengkap",
    "No Rekening",
    "Nama Bank",
    "Atas Nama",
    "Username",
    "Sumber Registrasi",
    "Produk",
    "Upgrade Produk",
    "Total Tabungan (IDR)",
    "Status Verifikasi",
    "Status Alamat",
    "Alasan Tolak Alamat",
    "Status Lunas",
    "Tanggal Daftar",
    "Mulai Tabungan",
    "Tanggal Verifikasi",
    "Tanggal Lunas",
    "Tgl Update Alamat Diminta",
    "Tgl Update Alamat Verifikasi",
  ];

  const rows = members.map((m, idx) => {
    const total = savingsMap.get(String(m._id)) || 0;
    return [
      idx + 1,
      m.uuid,
      m.name,
      m.gender,
      m.phone,
      m.email,
      m.birthPlace,
      fmtDateOnly(m.birthDate),
      m.nik,
      m.city,
      m.completeAddress,
      m.accountNumber,
      m.bankName,
      m.accountHolderName,
      m.user?.username || "",
      m.registrationSource,
      m.product?.title || "",
      m.currentUpgradeId?.newProductId?.title || (m.hasUpgraded ? "Ya" : ""),
      total,
      m.isVerified ? "Terverifikasi" : "Belum",
      m.addressUpdateStatus,
      m.addressUpdateRejectionReason || "",
      m.isCompleted ? "Lunas" : "Belum Lunas",
      fmt(m.createdAt),
      fmt(m.savingsStartDate),
      fmt(m.verifiedAt),
      fmt(m.completedAt),
      fmt(m.addressUpdateRequestedAt),
      fmt(m.addressUpdateVerifiedAt),
    ]
      .map(esc)
      .join("\t");
  });

  const tsv = "\uFEFF" + [headers.map(esc).join("\t"), ...rows].join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `anggota_export_${dateStr}.xls`;

  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  return res.status(200).send(tsv);
});

// Migration: set all existing members as verified
const migrateExistingMembers = asyncHandler(async (req, res) => {
  const result = await Member.updateMany(
    { isVerified: { $exists: false } },
    {
      $set: {
        isVerified: true,
        registrationSource: "admin",
      },
    }
  );

  // Also set any members that have isVerified = false but were created before this feature
  const result2 = await Member.updateMany(
    {
      isVerified: false,
      registrationSource: { $exists: false },
    },
    {
      $set: {
        isVerified: true,
        registrationSource: "admin",
      },
    }
  );

  res.status(200).json({
    success: true,
    message: `Migration selesai. ${result.modifiedCount + result2.modifiedCount} member diperbarui.`,
    data: {
      batch1: result.modifiedCount,
      batch2: result2.modifiedCount,
    },
  });
});

export {
  getAllMembers,
  getMemberByUuid,
  createMember,
  updateMember,
  deleteMember,
  validateMemberUuid,
  markAsCompleted,
  unmarkAsCompleted,
  verifyMember,
  unverifyMember,
  approveMemberAddress,
  rejectMemberAddress,
  getPendingCount,
  exportMembersExcel,
  migrateExistingMembers,
};
