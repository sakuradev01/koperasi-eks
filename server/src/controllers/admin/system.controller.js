import { Member } from "../../models/member.model.js";
import { User } from "../../models/user.model.js";
import { Savings } from "../../models/savings.model.js";
import { Loan } from "../../models/loan.model.js";
import { LoanPayment } from "../../models/loanPayment.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import fs from "fs";
import path from "path";
import { getUploadsDir } from "../../utils/uploadsDir.js";

// Clear all data (members, savings, loans, uploaded files)
const clearAllData = asyncHandler(async (req, res) => {
  const { confirmCode } = req.body;

  // Require confirmation code for safety
  if (confirmCode !== "HAPUS-SEMUA-DATA") {
    return res.status(400).json({
      success: false,
      message: "Kode konfirmasi salah. Ketik 'HAPUS-SEMUA-DATA' untuk melanjutkan.",
    });
  }

  try {
    // 1. Delete all loan payments
    const deletedLoanPayments = await LoanPayment.deleteMany({});

    // 2. Delete all loans
    const deletedLoans = await Loan.deleteMany({});

    // 3. Delete all savings
    const deletedSavings = await Savings.deleteMany({});

    // 4. Get all member user IDs before deleting
    const members = await Member.find({}).select("user");
    const userIds = members.map((m) => m.user);

    // 5. Delete all members
    const deletedMembers = await Member.deleteMany({});

    // 6. Delete associated users (staff role only, keep admin)
    const deletedUsers = await User.deleteMany({
      _id: { $in: userIds },
      role: "staff",
    });

    // 7. Clear uploaded files
    const uploadsDir = getUploadsDir();
    let deletedFiles = 0;

    const clearDirectory = (dirPath) => {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            clearDirectory(filePath);
          } else if (file !== ".gitkeep") {
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        }
      }
    };

    clearDirectory(path.join(uploadsDir, "simpanan"));
    clearDirectory(path.join(uploadsDir, "pinjaman"));

    res.status(200).json({
      success: true,
      message: "Semua data berhasil dihapus",
      data: {
        deletedMembers: deletedMembers.deletedCount,
        deletedUsers: deletedUsers.deletedCount,
        deletedSavings: deletedSavings.deletedCount,
        deletedLoans: deletedLoans.deletedCount,
        deletedLoanPayments: deletedLoanPayments.deletedCount,
        deletedFiles: deletedFiles,
      },
    });
  } catch (error) {
    console.error("Clear all data error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus data",
      error: error.message,
    });
  }
});

export { clearAllData };
