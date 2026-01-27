import { LoanPayment } from "../../models/loanPayment.model.js";
import { Loan } from "../../models/loan.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import fs from "fs/promises";
import path from "path";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";

// Create loan payment
const createPayment = asyncHandler(async (req, res) => {
  const {
    loanId,
    memberId,
    amount,
    paymentDate,
    description,
    notes,
  } = req.body;

  // Check if loan exists
  const loan = await Loan.findById(loanId);
  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  // Check if loan is active
  if (!["Active", "Overdue"].includes(loan.status)) {
    return res.status(400).json({
      success: false,
      message: "Pinjaman tidak aktif",
    });
  }

  // Check if member matches
  if (loan.memberId.toString() !== memberId) {
    return res.status(400).json({
      success: false,
      message: "Anggota tidak sesuai dengan pinjaman",
    });
  }

  // Calculate next period to pay
  const nextPeriod = loan.paidPeriods + 1;
  
  // Check if all periods are paid
  if (nextPeriod > loan.totalPeriods) {
    return res.status(400).json({
      success: false,
      message: "Semua periode sudah dibayar",
    });
  }

  // Check for duplicate payment for same period
  const existingPayment = await LoanPayment.findOne({
    loanId,
    period: nextPeriod,
    status: { $in: ["Pending", "Approved"] },
  });

  if (existingPayment) {
    return res.status(400).json({
      success: false,
      message: `Pembayaran periode ${nextPeriod} sudah ada`,
    });
  }

  // Determine payment type
  let paymentType = "Full";
  if (amount < loan.monthlyInstallment) {
    paymentType = "Partial";
  }
  
  const payDate = new Date(paymentDate);
  const dueDate = loan.nextDueDate;
  
  if (payDate > dueDate) {
    paymentType = "Late";
  }

  // Handle file upload if exists
  let proofFile = null;
  if (req.file) {
    proofFile = `/uploads/pinjaman/${req.file.filename}`;
  }

  // Create payment
  const payment = new LoanPayment({
    loanId,
    memberId,
    period: nextPeriod,
    amount,
    paymentDate: payDate,
    dueDate: dueDate,
    status: "Pending",
    paymentType,
    proofFile,
    description: description || `Pembayaran cicilan periode ${nextPeriod}`,
    notes,
  });

  await payment.save();

  // Populate data
  await payment.populate("memberId");
  await payment.populate("loanId");

  res.status(201).json({
    success: true,
    data: payment,
    message: "Pembayaran cicilan berhasil dibuat",
  });
});

// Approve loan payment
const approvePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const payment = await LoanPayment.findById(id)
    .populate("loanId");

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Pembayaran tidak ditemukan",
    });
  }

  if (payment.status !== "Pending") {
    return res.status(400).json({
      success: false,
      message: "Pembayaran sudah diproses",
    });
  }

  // Update payment status
  payment.status = "Approved";
  payment.approvedBy = userId;
  payment.approvedAt = new Date();
  await payment.save();

  // Update loan payment progress
  const loan = await Loan.findById(payment.loanId);
  if (loan) {
    await loan.updatePaymentProgress(payment.amount);
  }

  // Populate data
  await payment.populate("memberId");

  res.status(200).json({
    success: true,
    data: payment,
    message: "Pembayaran berhasil disetujui",
  });
});

// Reject loan payment
const rejectPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const userId = req.user._id;

  const payment = await LoanPayment.findById(id);
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Pembayaran tidak ditemukan",
    });
  }

  if (payment.status !== "Pending") {
    return res.status(400).json({
      success: false,
      message: "Pembayaran sudah diproses",
    });
  }

  payment.status = "Rejected";
  payment.rejectionReason = rejectionReason;
  payment.approvedBy = userId;
  payment.approvedAt = new Date();
  await payment.save();

  // Delete proof file if exists
  if (payment.proofFile) {
    const filePath = resolveUploadedFilePath(payment.proofFile);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Don't fail the request if file is already gone
        console.error("Error deleting proof file:", error);
      }
    }
  }

  // Populate data
  await payment.populate("memberId");
  await payment.populate("loanId");

  res.status(200).json({
    success: true,
    data: payment,
    message: "Pembayaran berhasil ditolak",
  });
});

// Get all payments with filtering
const getPaymentHistory = asyncHandler(async (req, res) => {
  const {
    status,
    loanId,
    memberId,
    page = 1,
    limit = 10,
    startDate,
    endDate,
  } = req.query;

  const query = {};

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by loan
  if (loanId) {
    query.loanId = loanId;
  }

  // Filter by member
  if (memberId) {
    query.memberId = memberId;
  }

  // Filter by date range
  if (startDate || endDate) {
    query.paymentDate = {};
    if (startDate) {
      query.paymentDate.$gte = new Date(startDate);
    }
    if (endDate) {
      query.paymentDate.$lte = new Date(endDate);
    }
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count
  const totalItems = await LoanPayment.countDocuments(query);
  const totalPages = Math.ceil(totalItems / limit);

  // Get payments with population
  const payments = await LoanPayment.find(query)
    .populate("memberId")
    .populate({
      path: "loanId",
      populate: {
        path: "loanProductId",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Calculate summary
  const summary = await LoanPayment.aggregate([
    { $match: query },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summaryData = {
    totalPending: 0,
    totalApproved: 0,
    totalRejected: 0,
    countPending: 0,
    countApproved: 0,
    countRejected: 0,
  };

  summary.forEach((item) => {
    if (item._id === "Pending") {
      summaryData.totalPending = item.total;
      summaryData.countPending = item.count;
    } else if (item._id === "Approved") {
      summaryData.totalApproved = item.total;
      summaryData.countApproved = item.count;
    } else if (item._id === "Rejected") {
      summaryData.totalRejected = item.total;
      summaryData.countRejected = item.count;
    }
  });

  res.status(200).json({
    success: true,
    data: {
      payments,
      summary: summaryData,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Get payments by loan
const getPaymentsByLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  const loan = await Loan.findById(loanId)
    .populate("memberId")
    .populate("loanProductId");

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  const payments = await LoanPayment.find({ loanId })
    .sort({ period: 1 });

  // Generate payment schedule with actual payments
  const paymentSchedule = [];
  const startDate = loan.startDate || loan.approvalDate;
  
  for (let i = 1; i <= loan.totalPeriods; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    
    const actualPayment = payments.find(p => p.period === i);
    
    paymentSchedule.push({
      period: i,
      dueDate,
      expectedAmount: loan.monthlyInstallment,
      actualPayment: actualPayment ? {
        amount: actualPayment.amount,
        paymentDate: actualPayment.paymentDate,
        status: actualPayment.status,
        proofFile: actualPayment.proofFile,
      } : null,
      status: actualPayment ? actualPayment.status : "Belum Bayar",
    });
  }

  res.status(200).json({
    success: true,
    data: {
      loan,
      paymentSchedule,
      payments,
    },
  });
});

// Bulk approve payments
const bulkApprovePayments = asyncHandler(async (req, res) => {
  const { paymentIds } = req.body;
  const userId = req.user._id;

  if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "ID pembayaran tidak valid",
    });
  }

  const results = {
    approved: [],
    failed: [],
  };

  for (const paymentId of paymentIds) {
    try {
      const payment = await LoanPayment.findById(paymentId);
      
      if (!payment) {
        results.failed.push({
          id: paymentId,
          reason: "Pembayaran tidak ditemukan",
        });
        continue;
      }

      if (payment.status !== "Pending") {
        results.failed.push({
          id: paymentId,
          reason: "Pembayaran sudah diproses",
        });
        continue;
      }

      // Approve payment
      payment.status = "Approved";
      payment.approvedBy = userId;
      payment.approvedAt = new Date();
      await payment.save();

      // Update loan progress
      const loan = await Loan.findById(payment.loanId);
      if (loan) {
        await loan.updatePaymentProgress(payment.amount);
      }

      results.approved.push(paymentId);
    } catch (error) {
      results.failed.push({
        id: paymentId,
        reason: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    data: results,
    message: `${results.approved.length} pembayaran berhasil disetujui`,
  });
});

// Get overdue payments
const getOverduePayments = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find active loans with overdue payments
  const overdueLoans = await Loan.find({
    status: { $in: ["Active", "Overdue"] },
    nextDueDate: { $lt: today },
  }).populate("memberId")
    .populate("loanProductId");

  const overdueData = [];

  for (const loan of overdueLoans) {
    const nextPeriod = loan.paidPeriods + 1;
    
    // Check if payment exists for this period
    const payment = await LoanPayment.findOne({
      loanId: loan._id,
      period: nextPeriod,
    });

    if (!payment || payment.status === "Rejected") {
      const daysLate = Math.ceil((today - loan.nextDueDate) / (1000 * 60 * 60 * 24));
      
      overdueData.push({
        loan,
        period: nextPeriod,
        dueDate: loan.nextDueDate,
        daysLate,
        amountDue: loan.monthlyInstallment,
        lateFee: Math.round(loan.monthlyInstallment * Math.min(daysLate * 0.01, 0.10)),
      });
    }
  }

  res.status(200).json({
    success: true,
    data: overdueData,
  });
});

// Delete loan payment
const deletePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find payment
  const payment = await LoanPayment.findById(id);
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Pembayaran tidak ditemukan",
    });
  }

  // Delete proof file if exists
  if (payment.proofFile) {
    const filePath = resolveUploadedFilePath(payment.proofFile);
    if (filePath) {
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log("Proof file deleted:", filePath);
      } catch (accessErr) {
        console.log("Proof file not found or already deleted:", filePath);
      }
    }
  }

  // If payment was approved, need to update loan
  if (payment.status === "Approved") {
    const loan = await Loan.findById(payment.loanId);
    if (loan) {
      // Ensure all values are numbers before calculation
      const loanAmount = Number(loan.loanAmount) || 0;
      const interestAmount = Number(loan.interestAmount) || 0;
      const paymentAmount = Number(payment.amount) || 0;
      const currentTotalPaid = Number(loan.totalPaid) || 0;
      
      // Recalculate loan values
      loan.totalPaid = Math.max(0, currentTotalPaid - paymentAmount);
      loan.outstandingAmount = loanAmount + interestAmount - loan.totalPaid;
      loan.paidPeriods = Math.max(0, (loan.paidPeriods || 0) - 1);
      
      // Update loan status if needed
      if (loan.paidPeriods === 0) {
        loan.status = "Active";
      }
      
      await loan.save();
    }
  }

  // Delete payment
  await payment.deleteOne();

  res.status(200).json({
    success: true,
    message: "Pembayaran berhasil dihapus",
  });
});

// Update loan payment
const updatePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, paymentDate, description, notes } = req.body;

  try {
    // Find payment with populate to get full data
    const payment = await LoanPayment.findById(id)
      .populate('loanId')
      .populate('memberId');
      
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Pembayaran tidak ditemukan",
      });
    }

    // Only allow update for pending payments
    if (payment.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Tidak dapat mengubah pembayaran dengan status ${payment.status}. Hanya pembayaran dengan status Pending yang dapat diubah`,
      });
    }
  } catch (err) {
    console.error("Error finding payment:", err);
    return res.status(500).json({
      success: false,
      message: "Error saat mencari data pembayaran",
    });
  }

  try {
    // Update payment fields
    if (amount !== undefined && amount !== '') {
      payment.amount = Number(amount);
    }
    if (paymentDate !== undefined && paymentDate !== '') {
      payment.paymentDate = new Date(paymentDate);
    }
    if (description !== undefined) {
      payment.description = description;
    }
    if (notes !== undefined) {
      payment.notes = notes;
    }

    // Recalculate payment type if amount or date changed
    if ((amount !== undefined && amount !== '') || (paymentDate !== undefined && paymentDate !== '')) {
      const loan = payment.loanId; // Already populated
      if (loan) {
        let paymentType = "Full";
        if (payment.amount < loan.monthlyInstallment) {
          paymentType = "Partial";
        }
        
        const payDate = new Date(payment.paymentDate);
        const dueDate = payment.dueDate;
        
        if (payDate > dueDate) {
          paymentType = "Late";
        }
        
        payment.paymentType = paymentType;
      }
    }

    await payment.save();
  } catch (saveErr) {
    console.error("Error saving payment:", saveErr);
    return res.status(500).json({
      success: false,
      message: "Error saat menyimpan perubahan pembayaran",
      error: saveErr.message
    });
  }

  // Populate for response
  await payment.populate([
    { path: "memberId", select: "name uuid" },
    { path: "loanId", select: "uuid loanProductId", populate: { path: "loanProductId", select: "title" } },
  ]);

  res.status(200).json({
    success: true,
    message: "Pembayaran berhasil diperbarui",
    data: payment,
  });
});

export {
  createPayment,
  approvePayment,
  rejectPayment,
  getPaymentHistory,
  getPaymentsByLoan,
  bulkApprovePayments,
  getOverduePayments,
  deletePayment,
  updatePayment,
};
