import { Member } from "../../models/member.model.js";
import { User } from "../../models/user.model.js";
import { Savings } from "../../models/savings.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get all members
const getAllMembers = asyncHandler(async (req, res) => {
  const members = await Member.find()
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

  // Create member
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

// Delete member
const deleteMember = asyncHandler(async (req, res) => {
  const { uuid } = req.params;

  const member = await Member.findOne({ uuid });

  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Member tidak ditemukan",
    });
  }

  // Delete associated user
  await User.findByIdAndDelete(member.user);

  // Delete member
  await Member.findByIdAndDelete(member._id);

  res.status(200).json({
    success: true,
    message: "Member berhasil dihapus",
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

export {
  getAllMembers,
  getMemberByUuid,
  createMember,
  updateMember,
  deleteMember,
  validateMemberUuid,
  markAsCompleted,
  unmarkAsCompleted,
};
