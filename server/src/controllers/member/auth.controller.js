import { Member } from "../../models/member.model.js";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Generate JWT Token for Member
const generateToken = (memberId) => {
  return jwt.sign({ memberId }, process.env.JWT_SECRET || "your-secret-key", {
    expiresIn: "7d",
  });
};

const isBlankAddress = (value) => !String(value || "").trim();

const hasIdentityDocs = (member) => {
  const fields = [
    member?.ktpImage,
    member?.selfieImage,
    member?.livenessLeftImage,
    member?.livenessRightImage,
  ];
  return fields.every((v) => String(v || "").trim().length > 10);
};

const getAddressState = (member) => ({
  completeAddress: member.completeAddress || "",
  addressUpdateStatus: member.addressUpdateStatus || "none",
  addressUpdateRequestedAt: member.addressUpdateRequestedAt || null,
  addressUpdateVerifiedAt: member.addressUpdateVerifiedAt || null,
  addressUpdateRejectionReason: member.addressUpdateRejectionReason || null,
  requiresAddressCompletion:
    member.isVerified &&
    (isBlankAddress(member.completeAddress) ||
      ["pending", "rejected"].includes(member.addressUpdateStatus || "none")),
});

const getIdentityState = (member) => {
  const status = member.identityVerifyStatus || "none";
  const docsOk = hasIdentityDocs(member);
  return {
    hasIdentityDocs: docsOk,
    identityVerifyStatus: status,
    identityVerifyRequestedAt: member.identityVerifyRequestedAt || null,
    identityVerifyVerifiedAt: member.identityVerifyVerifiedAt || null,
    identityVerifyRejectionReason: member.identityVerifyRejectionReason || null,
    // Gate pay when docs missing or update waiting/rejected (mirror address)
    requiresIdentityVerification:
      Boolean(member.isVerified) &&
      (!docsOk || ["pending", "rejected"].includes(status)),
  };
};

// Member Login - UUID based authentication
export const loginMember = asyncHandler(async (req, res) => {
  const { uuid, password } = req.body;

  // Validasi input
  if (!uuid || !password) {
    return res.status(400).json({
      success: false,
      message: "UUID dan password harus diisi",
    });
  }

  try {
    // Cari member berdasarkan UUID dan populate productId
    const member = await Member.findOne({ uuid })
      .populate('user')
      .populate('productId') // Populate product info
      .populate({
        path: 'currentUpgradeId',
        populate: [
          { path: 'oldProductId', select: 'title depositAmount' },
          { path: 'newProductId', select: 'title depositAmount' }
        ]
      }); // Populate upgrade info with product details

    if (!member) {
      return res.status(401).json({
        success: false,
        message: "UUID atau password salah",
      });
    }

    // Cek status verifikasi - member dari student_dashboard harus diverifikasi dulu
    if (!member.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Akun belum diverifikasi oleh admin. Silakan tunggu proses verifikasi.",
        isVerified: false,
      });
    }

    // Verifikasi password format: UUID-1234
    const expectedPassword = `${uuid}-1234`;
    
    if (password !== expectedPassword) {
      return res.status(401).json({
        success: false,
        message: "UUID atau password salah",
      });
    }

    // Generate JWT token
    const token = generateToken(member._id);

    // Return success response with complete member data including productId
    res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: {
        member: {
          _id: member._id,
          uuid: member.uuid,
          name: member.name,
          gender: member.gender,
          phone: member.phone,
          city: member.city,
          ...getAddressState(member),
          ...getIdentityState(member),
          productId: member.productId, // Include productId in response
          hasUpgraded: member.hasUpgraded || false,
          currentUpgradeId: member.currentUpgradeId || null,
          savingsStartDate: member.savingsStartDate || null,
          createdAt: member.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Member login error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});

// Get Current Member
export const getCurrentMember = asyncHandler(async (req, res) => {
  try {
    const member = await Member.findById(req.member.memberId)
      .populate('user')
      .populate('productId') // Populate product info
      .populate({
        path: 'currentUpgradeId',
        populate: [
          { path: 'oldProductId', select: 'title depositAmount' },
          { path: 'newProductId', select: 'title depositAmount' }
        ]
      }); // Populate upgrade info with product details

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        member: {
          _id: member._id,
          uuid: member.uuid,
          name: member.name,
          gender: member.gender,
          phone: member.phone,
          city: member.city,
          ...getAddressState(member),
          ...getIdentityState(member),
          productId: member.productId, // Include productId
          hasUpgraded: member.hasUpgraded || false,
          currentUpgradeId: member.currentUpgradeId || null,
          savingsStartDate: member.savingsStartDate || null,
          createdAt: member.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Get current member error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: error.message,
    });
  }
});

// Submit address completion/update from student dashboard.
export const updateMemberAddress = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.member.memberId);

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  const completeAddress = String(req.body?.completeAddress || "").trim();

  if (!completeAddress) {
    return res.status(400).json({
      success: false,
      code: "ADDRESS_REQUIRED",
      message: "Alamat lengkap wajib diisi",
    });
  }

  member.completeAddress = completeAddress;
  member.addressUpdateStatus = "pending";
  member.addressUpdateRequestedAt = new Date();
  member.addressUpdateVerifiedAt = null;
  member.addressUpdateVerifiedBy = null;

  await member.save();

  res.status(200).json({
    success: true,
    message: "Alamat berhasil dikirim. Mohon tunggu verifikasi admin.",
    data: {
      member: {
        _id: member._id,
        uuid: member.uuid,
        name: member.name,
        ...getAddressState(member),
      },
    },
  });
});

// Submit KTP + selfie + liveness for legacy members (before savings pay)
export const updateMemberIdentity = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.member.memberId);

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  const ktpImage = String(req.body?.ktpImage || "").trim();
  const selfieImage = String(req.body?.selfieImage || "").trim();
  const livenessLeftImage = String(req.body?.livenessLeftImage || "").trim();
  const livenessRightImage = String(req.body?.livenessRightImage || "").trim();
  const signatureImage = String(req.body?.signatureImage || "").trim();
  const faceMatchScore = req.body?.faceMatchScore;

  if (!ktpImage || !selfieImage || !livenessLeftImage || !livenessRightImage) {
    return res.status(400).json({
      success: false,
      code: "IDENTITY_DOCS_REQUIRED",
      message:
        "Foto KTP, selfie memegang KTP, dan verifikasi wajah kiri/kanan wajib diisi.",
    });
  }

  member.ktpImage = ktpImage;
  member.selfieImage = selfieImage;
  member.livenessLeftImage = livenessLeftImage;
  member.livenessRightImage = livenessRightImage;
  if (signatureImage) member.signatureImage = signatureImage;
  if (faceMatchScore !== undefined && faceMatchScore !== null && faceMatchScore !== "") {
    const score = Number(faceMatchScore);
    member.faceMatchScore = Number.isFinite(score) ? score : member.faceMatchScore;
  }

  member.identityVerifyStatus = "pending";
  member.identityVerifyRequestedAt = new Date();
  member.identityVerifyVerifiedAt = null;
  member.identityVerifyVerifiedBy = null;
  member.identityVerifyRejectionReason = null;

  await member.save();

  res.status(200).json({
    success: true,
    message:
      "Dokumen verifikasi wajah berhasil dikirim. Mohon tunggu verifikasi admin sebelum upload pembayaran.",
    data: {
      member: {
        _id: member._id,
        uuid: member.uuid,
        name: member.name,
        ...getAddressState(member),
        ...getIdentityState(member),
      },
    },
  });
});

// Logout Member
export const logoutMember = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logout berhasil",
  });
});
