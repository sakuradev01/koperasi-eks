import { Loan } from "../../models/loan.model.js";
import { LoanProduct } from "../../models/loanProduct.model.js";
import { LoanPayment } from "../../models/loanPayment.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get available loan products for member
const getAvailableLoanProducts = asyncHandler(async (req, res) => {
  const loanProducts = await LoanProduct.find({ isActive: true }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: loanProducts,
  });
});

// Get member's loans
const getMemberLoans = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;

  const loans = await Loan.find({ memberId })
    .populate("loanProductId")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: loans,
  });
});

// Apply for loan
const applyForLoan = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const {
    loanProductId,
    downPayment,
    description,
    emergencyContacts,
    faceScanUrl,
    ktpUrl,
  } = req.body;

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
      message: "Anda memiliki pinjaman yang jatuh tempo. Harap selesaikan terlebih dahulu.",
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
    emergencyContacts: emergencyContacts || [],
    faceScanUrl: faceScanUrl || "",
    ktpUrl: ktpUrl || "",
  });

  await loan.save();
  await loan.populate("loanProductId");

  res.status(201).json({
    success: true,
    data: loan,
    message: "Pengajuan pinjaman berhasil dibuat",
  });
});

// Make loan payment
const makeLoanPayment = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const {
    loanId,
    amount,
    paymentDate,
    description,
    notes,
  } = req.body;

  // Check if loan exists and belongs to member
  const loan = await Loan.findOne({ _id: loanId, memberId });
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
  
  const payDate = new Date(paymentDate || Date.now());
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
  await payment.populate("loanId");

  res.status(201).json({
    success: true,
    data: payment,
    message: "Pembayaran cicilan berhasil dibuat",
  });
});

// Get member's loan payments
const getMemberLoanPayments = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const { loanId } = req.query;

  const query = { memberId };
  if (loanId) {
    query.loanId = loanId;
  }

  const payments = await LoanPayment.find(query)
    .populate({
      path: "loanId",
      populate: {
        path: "loanProductId",
      },
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: payments,
  });
});

// Get loan payment schedule
const getLoanPaymentSchedule = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const { loanId } = req.params;

  // Check if loan exists and belongs to member
  const loan = await Loan.findOne({ _id: loanId, memberId })
    .populate("loanProductId");

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Pinjaman tidak ditemukan",
    });
  }

  const payments = await LoanPayment.find({ loanId }).sort({ period: 1 });

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

// Calculate loan simulation
const calculateLoanSimulation = asyncHandler(async (req, res) => {
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

export {
  getAvailableLoanProducts,
  getMemberLoans,
  applyForLoan,
  makeLoanPayment,
  getMemberLoanPayments,
  getLoanPaymentSchedule,
  calculateLoanSimulation,
};
