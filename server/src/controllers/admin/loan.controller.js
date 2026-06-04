import { Loan } from "../../models/loan.model.js";
import { LoanProduct } from "../../models/loanProduct.model.js";
import { LoanPayment } from "../../models/loanPayment.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import mongoose from "mongoose";

// Create loan application
const createLoanApplication = asyncHandler(async (req, res) => {
  const {
    memberId,
    loanProductId,
    downPayment,
    description,
  } = req.body;

  // Check if member exists
  const member = await Member.findById(memberId);
  if (!member) {
    return res.status(404).json({
      success: false,
      message: "Anggota tidak ditemukan",
    });
  }

  // Check if loan product exists
  const loanProduct = await LoanProduct.findById(loanProductId);
  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  // Check if member has any overdue loans
  const overdueLoan = await Loan.findOne({
    memberId,
    status: "Overdue",
  });

  if (overdueLoan) {
    return res.status(400).json({
      success: false,
      message: "Anggota memiliki pinjaman yang jatuh tempo. Harap selesaikan terlebih dahulu.",
    });
  }

  // Calculate loan details
  const loanAmount = loanProduct.maxLoanAmount - downPayment;
  const interestAmount = (loanAmount * loanProduct.interestRate) / 100;
  const totalPayment = loanAmount + interestAmount;
  const monthlyInstallment = Math.round(totalPayment / loanProduct.loanTerm);

  // Create loan application
  const loan = new Loan({
    memberId,
    loanProductId,
    loanAmount,
    downPayment,
    tenor: loanProduct.loanTerm,
    monthlyInstallment,
    interestRate: loanProduct.interestRate,
    totalPayment,
    totalPeriods: loanProduct.loanTerm,
    description,
    status: "Pending",
    applicationDate: new Date(),
    documents: req.body.documents || [],
  });

  await loan.save();

  // Populate member and product data
  await loan.populate("memberId");
  await loan.populate("loanProductId");

  res.status(201).json({
    success: true,
    data: loan,
    message: "Pengajuan pinjaman berhasil dibuat",
  });
});

// Calculate loan installment
const calculateInstallment = asyncHandler(async (req, res) => {
  const { loanProductId, downPayment } = req.body;

  // Check if loan product exists
  const loanProduct = await LoanProduct.findById(loanProductId);
  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  // Validate down payment
  if (downPayment < loanProduct.downPayment) {
    return res.status(400).json({
      success: false,
      message: `Uang muka minimal ${loanProduct.downPayment}`,
    });
  }

  // Calculate loan details
  const loanAmount = loanProduct.maxLoanAmount - downPayment;
  const interestAmount = (loanAmount * loanProduct.interestRate) / 100;
  const totalPayment = loanAmount + interestAmount;
  const monthlyInstallment = Math.round(totalPayment / loanProduct.loanTerm);

  // Generate payment schedule
  const paymentSchedule = [];
  const currentDate = new Date();
  
  for (let i = 1; i <= loanProduct.loanTerm; i++) {
    const dueDate = new Date(currentDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    
    paymentSchedule.push({
      period: i,
      amount: monthlyInstallment,
      dueDate: dueDate,
      remainingBalance: totalPayment - (monthlyInstallment * i),
    });
  }

  res.status(200).json({
    success: true,
    data: {
      productName: loanProduct.title,
      productPrice: loanProduct.maxLoanAmount,
      downPayment,
      loanAmount,
      interestRate: loanProduct.interestRate,
      interestAmount,
      totalPayment,
      tenor: loanProduct.loanTerm,
      monthlyInstallment,
      paymentSchedule,
    },
  });
});

// Approve loan application
const approveLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const loan = await Loan.findById(id);
  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  if (loan.status !== "Pending") {
    return res.status(400).json({
      success: false,
      message: "Pinjaman sudah diproses",
    });
  }

  // Set loan as approved and active
  loan.status = "Active";
  loan.approvedBy = userId;
  loan.approvalDate = new Date();
  loan.startDate = new Date();
  
  // Set end date
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + loan.tenor);
  loan.endDate = endDate;

  // Set first due date
  const nextDueDate = new Date();
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  loan.nextDueDate = nextDueDate;

  await loan.save();

  // Populate data
  await loan.populate("memberId");
  await loan.populate("loanProductId");

  res.status(200).json({
    success: true,
    data: loan,
    message: "Pinjaman berhasil disetujui",
  });
});

// Reject loan application
const rejectLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const userId = req.user._id;

  const loan = await Loan.findById(id);
  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  if (loan.status !== "Pending") {
    return res.status(400).json({
      success: false,
      message: "Pinjaman sudah diproses",
    });
  }

  loan.status = "Rejected";
  loan.rejectionReason = rejectionReason;
  loan.approvedBy = userId;
  loan.approvalDate = new Date();

  await loan.save();

  // Populate data
  await loan.populate("memberId");
  await loan.populate("loanProductId");

  res.status(200).json({
    success: true,
    data: loan,
    message: "Pinjaman berhasil ditolak",
  });
});

// Get all loans with filtering
const getAllLoans = asyncHandler(async (req, res) => {
  const { 
    status, 
    memberId, 
    page = 1, 
    limit = 10,
    search,
    startDate,
    endDate
  } = req.query;

  const query = {};

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by member
  if (memberId) {
    query.memberId = memberId;
  }

  // Filter by date range
  if (startDate || endDate) {
    query.applicationDate = {};
    if (startDate) {
      query.applicationDate.$gte = new Date(startDate);
    }
    if (endDate) {
      query.applicationDate.$lte = new Date(endDate);
    }
  }

  // Search functionality
  if (search) {
    const members = await Member.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { uuid: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    if (members.length > 0) {
      query.memberId = { $in: members.map(m => m._id) };
    }
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count
  const totalItems = await Loan.countDocuments(query);
  const totalPages = Math.ceil(totalItems / limit);

  // Get loans with population
  const loans = await Loan.find(query)
    .populate("memberId")
    .populate("loanProductId")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.status(200).json({
    success: true,
    data: {
      loans,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Get loans by member
const getLoansByMember = asyncHandler(async (req, res) => {
  const { memberId } = req.params;

  const loans = await Loan.find({ memberId })
    .populate("loanProductId")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: loans,
  });
});

// Get loan detail with payment history
const getLoanDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const loan = await Loan.findById(id)
    .populate("memberId")
    .populate("loanProductId");

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  // Get payment history
  const payments = await LoanPayment.find({ loanId: id })
    .sort({ period: 1 });

  res.status(200).json({
    success: true,
    data: {
      loan,
      payments,
    },
  });
});

// Update loan status (for admin actions)
const updateLoanStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const loan = await Loan.findById(id);
  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  // Validate status transition
  const validTransitions = {
    "Active": ["Completed", "Overdue"],
    "Overdue": ["Active", "Completed"],
  };

  if (!validTransitions[loan.status]?.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Tidak bisa mengubah status dari ${loan.status} ke ${status}`,
    });
  }

  loan.status = status;
  await loan.save();

  res.status(200).json({
    success: true,
    data: loan,
    message: `Status pinjaman berhasil diubah menjadi ${status}`,
  });
});

// Check overdue loans
const checkOverdueLoans = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find active loans with due date passed
  const overdueLoans = await Loan.updateMany(
    {
      status: "Active",
      nextDueDate: { $lt: today },
    },
    {
      status: "Overdue",
    }
  );

  res.status(200).json({
    success: true,
    data: {
      updated: overdueLoans.modifiedCount,
    },
    message: `${overdueLoans.modifiedCount} pinjaman ditandai sebagai jatuh tempo`,
  });
});

// Update loan
const updateLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    monthlyInstallment,
    tenor,
    interestRate,
    description,
  } = req.body;

  const loan = await Loan.findById(id);

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  // Update fields
  if (monthlyInstallment !== undefined) loan.monthlyInstallment = monthlyInstallment;
  if (tenor !== undefined) {
    loan.tenor = tenor;
    loan.totalPeriods = tenor;
    
    // Recalculate total payment
    loan.totalPayment = monthlyInstallment * tenor;
    
    // Update end date
    if (loan.startDate) {
      const endDate = new Date(loan.startDate);
      endDate.setMonth(endDate.getMonth() + tenor);
      loan.endDate = endDate;
    }
  }
  if (interestRate !== undefined) loan.interestRate = interestRate;
  if (description !== undefined) loan.description = description;
  
  // Recalculate outstanding amount
  loan.outstandingAmount = loan.totalPayment - (loan.paidPeriods * loan.monthlyInstallment);

  await loan.save();
  await loan.populate(["memberId", "loanProductId"]);

  res.status(200).json({
    success: true,
    data: loan,
    message: "Pinjaman berhasil diperbarui",
  });
});

// Delete loan
const deleteLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const loan = await Loan.findById(id);

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  // Check if loan has payments
  const paymentCount = await LoanPayment.countDocuments({ loanId: id });
  if (paymentCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Tidak dapat menghapus pinjaman karena sudah memiliki ${paymentCount} pembayaran. Hapus pembayaran terlebih dahulu.`,
    });
  }

  await Loan.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Pinjaman berhasil dihapus",
  });
});

// Upload loan document (from student dashboard)
const uploadLoanDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "File wajib diupload" });
  }
  const docType = req.body?.docType || 'loan-doc';
  res.status(200).json({
    success: true,
    data: {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      docType,
      url: `/uploads/pinjaman/${req.file.filename}`,
    },
    message: "Dokumen berhasil diupload",
  });
});

export {
  createLoanApplication,
  calculateInstallment,
  approveLoan,
  rejectLoan,
  getAllLoans,
  getLoansByMember,
  getLoanDetail,
  updateLoanStatus,
  checkOverdueLoans,
  updateLoan,
  deleteLoan,
  uploadLoanDocument,
};
