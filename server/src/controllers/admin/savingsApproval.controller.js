import { Savings } from "../../models/savings.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  resolveSavingsCoaInput,
  syncSavingsAccountingTransaction,
  reverseSavingsAccountingTransaction,
} from "../../services/savingsAccounting.service.js";

// Approve Savings
export const approveSavings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const savings = await Savings.findById(id).populate("memberId", "name");
  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  if (savings.status === "Approved" && savings.transactionId) {
    throw new ApiError(400, "Simpanan sudah disetujui sebelumnya");
  }

  const coaSource = {
    accountId: req.body.accountId ?? req.body.account_id ?? savings.accountId,
    categoryId: req.body.categoryId ?? req.body.category_id ?? savings.categoryId,
    categoryType:
      req.body.categoryType ?? req.body.category_type ?? savings.categoryType,
    isSplit: req.body.isSplit ?? savings.isSplit,
    splits: req.body.splits ?? req.body.split_data,
    senderName: req.body.senderName ?? req.body.sender_name,
  };

  const coa = resolveSavingsCoaInput(coaSource, { requireAccount: true });

  const transaction = await syncSavingsAccountingTransaction(savings, coa);

  savings.status = "Approved";
  savings.approvedBy = userId;
  savings.approvedAt = new Date();
  savings.accountId = coa.accountId;
  savings.categoryId = coa.isSplit ? null : coa.categoryId;
  savings.categoryType = coa.isSplit ? null : coa.categoryType;
  savings.isSplit = Boolean(coa.isSplit);
  savings.transactionId = transaction._id;
  if (req.body.notes) savings.notes = req.body.notes;

  await savings.save();

  const populated = await Savings.findById(savings._id)
    .populate("memberId", "name email phone")
    .populate("productId", "title depositAmount returnProfit termDuration")
    .populate("accountId", "accountName accountCode currency balance")
    .populate("transactionId");

  res
    .status(200)
    .json(new ApiResponse(200, populated, "Simpanan berhasil disetujui"));
});

// Reject Savings
export const rejectSavings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason, notes } = req.body;
  const userId = req.user.userId;

  if (!rejectionReason) {
    throw new ApiError(400, "Alasan penolakan wajib diisi");
  }

  const savings = await Savings.findById(id);
  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  // If already approved with journal, reverse then reject
  if (savings.status === "Approved" || savings.transactionId) {
    await reverseSavingsAccountingTransaction(savings);
    savings.transactionId = null;
  }

  savings.status = "Rejected";
  savings.rejectionReason = rejectionReason;
  savings.approvedBy = userId;
  savings.approvedAt = new Date();
  if (notes) savings.notes = notes;

  await savings.save();

  res
    .status(200)
    .json(new ApiResponse(200, savings, "Simpanan berhasil ditolak"));
});

// Mark as Partial
export const markAsPartial = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const userId = req.user.userId;

  const savings = await Savings.findById(id);
  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  savings.status = "Partial";
  savings.paymentType = "Partial";
  savings.approvedBy = userId;
  savings.approvedAt = new Date();
  if (notes) savings.notes = notes;

  await savings.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, savings, "Simpanan ditandai sebagai pembayaran partial"),
    );
});

// Get Savings Summary for Period
export const getSavingsPeriodSummary = asyncHandler(async (req, res) => {
  const { memberId, productId, installmentPeriod } = req.params;

  const periodSavings = await Savings.find({
    memberId,
    productId,
    installmentPeriod: parseInt(installmentPeriod),
  }).sort({ createdAt: 1 });

  const totalPaid = periodSavings
    .filter((s) => s.status === "Approved")
    .reduce((sum, s) => sum + s.amount, 0);

  const pendingAmount = periodSavings
    .filter((s) => s.status === "Pending")
    .reduce((sum, s) => sum + s.amount, 0);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        periodSavings,
        totalPaid,
        pendingAmount,
        paymentCount: periodSavings.length,
        approvedCount: periodSavings.filter((s) => s.status === "Approved").length,
      },
      "Ringkasan periode simpanan berhasil diambil",
    ),
  );
});
