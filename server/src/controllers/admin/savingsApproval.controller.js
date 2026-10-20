import { Savings } from "../../models/savings.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { PAID_SAVINGS_STATUSES } from "../../services/savingsSchedule.service.js";

export function createSavingsApprovalHandlers(workflow) {
  return {
    approveSavings: asyncHandler(async (req, res) => {
      const populated = await workflow.approve({
        id: req.params.id,
        userId: req.user.userId,
        input: req.body,
      });
      return res
        .status(200)
        .json(new ApiResponse(200, populated, "Simpanan berhasil disetujui"));
    }),

    rejectSavings: asyncHandler(async (req, res) => {
      const savings = await workflow.reject({
        id: req.params.id,
        userId: req.user.userId,
        input: req.body,
      });
      return res
        .status(200)
        .json(new ApiResponse(200, savings, "Simpanan berhasil ditolak"));
    }),

    markAsPartial: asyncHandler(async (req, res) => {
      const savings = await workflow.markAsPartial({
        id: req.params.id,
        userId: req.user.userId,
        input: req.body,
      });
      return res.status(200).json(
        new ApiResponse(
          200,
          savings,
          "Simpanan ditandai sebagai pembayaran partial",
        ),
      );
    }),
  };
}

// Get Savings Summary for Period
// Get Savings Summary for Period
export const getSavingsPeriodSummary = asyncHandler(async (req, res) => {
  const { memberId, productId, installmentPeriod } = req.params;

  const periodSavings = await Savings.find({
    memberId,
    productId,
    installmentPeriod: parseInt(installmentPeriod),
  }).sort({ createdAt: 1 });

  const totalPaid = periodSavings
    .filter((s) => PAID_SAVINGS_STATUSES.includes(s.status))
    .reduce((sum, s) => sum + s.amount, 0);

  const partialAmount = periodSavings
    .filter((s) => s.status === "Partial")
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
        partialAmount,
        pendingAmount,
        paymentCount: periodSavings.length,
        approvedCount: periodSavings.filter((s) => s.status === "Approved").length,
        partialCount: periodSavings.filter((s) => s.status === "Partial").length,
      },
      "Ringkasan periode simpanan berhasil diambil",
    ),
  );
});
