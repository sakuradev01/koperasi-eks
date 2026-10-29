import { isBcaBankName, isWithdrawalRequestOpen } from "../domain/withdrawalPolicy.js";

const EXPENSE_TO_WITHDRAWAL_STATUS = Object.freeze({
  uncategorized: "submitted",
  pending: "reviewing",
  waiting_approval: "reviewing",
  approved: "approved",
  waiting_payment: "waiting_payment",
  rejected: "rejected",
  paid: "paid",
});

export async function syncSavingsWithdrawalExpense({
  expense,
  withdrawalRepository,
  actor = {},
  now = new Date(),
  transactionCreated = false,
}) {
  if (!expense?.savingsWithdrawalId) return null;

  const request = await withdrawalRepository.findById(expense.savingsWithdrawalId);
  if (!request) return null;

  const nextStatus = EXPENSE_TO_WITHDRAWAL_STATUS[String(expense.status || "").toLowerCase()];
  if (!nextStatus) return request;
  if (nextStatus === "paid" && !transactionCreated) return request;
  if (request.status === nextStatus && nextStatus !== "reviewing") return request;

  const previousStatus = request.status;
  const previousPaidAt = request.paidAt;
  const previousPaidBy = request.paidBy;
  const previousTransferDate = request.transferDate;
  const previousPaymentProofFiles = request.paymentProofFiles;
  const previousPaidMemberId = request.paidMemberId;
  const previousClosureSnapshot = {
    membershipStatusBeforeClosure: request.membershipStatusBeforeClosure,
    membershipStatusWasSet: request.membershipStatusWasSet,
    wasCompletedBeforeClosure: request.wasCompletedBeforeClosure,
    completedAtBeforeClosure: request.completedAtBeforeClosure,
    completedByBeforeClosure: request.completedByBeforeClosure,
  };
  let memberStateBeforeClosure = null;
  request.status = nextStatus;
  request.transitions.push({
    fromStatus: previousStatus,
    toStatus: nextStatus,
    actorType: actor.type || "finance",
    actorId: actor.id || null,
    actorName: actor.name || "Finance",
    reason: nextStatus === "rejected" ? expense.rejectReason || "Pengajuan ditolak Finance." : "Status mengikuti proses Expense Koperasi.",
    createdAt: now,
  });

  if (nextStatus === "rejected") {
    request.rejectionReason = expense.rejectReason || "Pengajuan ditolak Finance.";
    request.reviewedBy = actor.id || null;
    request.reviewedAt = now;
    request.openMemberId = undefined;
  }
  if (nextStatus === "approved") {
    request.reviewedBy = actor.id || null;
    request.reviewedAt = now;
  }
  if (nextStatus === "paid") {
    memberStateBeforeClosure = await withdrawalRepository.getMemberClosureState?.(request.memberId);
    if (memberStateBeforeClosure) {
      request.membershipStatusBeforeClosure = memberStateBeforeClosure.membershipStatus;
      request.membershipStatusWasSet = memberStateBeforeClosure.membershipStatusWasSet;
      request.wasCompletedBeforeClosure = memberStateBeforeClosure.isCompleted;
      request.completedAtBeforeClosure = memberStateBeforeClosure.completedAt;
      request.completedByBeforeClosure = memberStateBeforeClosure.completedBy;
    }
    request.paidAt = expense.paidAt || now;
    request.paidBy = actor.id || null;
    request.transferDate = expense.transferDate || null;
    request.paymentProofFiles = Array.isArray(expense.paymentProofs)
      ? expense.paymentProofs.map((proof) => proof.fileName).filter(Boolean)
      : expense.paymentProof ? [expense.paymentProof] : [];
    request.openMemberId = undefined;
    request.paidMemberId = request.memberId;
  }

  if (!isWithdrawalRequestOpen(nextStatus)) request.openMemberId = undefined;
  await withdrawalRepository.save(request);

  if (nextStatus === "paid") {
    try {
      const memberUpdate = await withdrawalRepository.updateMemberPaid({
        memberId: request.memberId,
        userId: actor.id,
        now,
      });
      if (memberUpdate?.matchedCount === 0 || memberUpdate?.n === 0) {
        throw new Error("Data anggota tidak ditemukan saat menutup tabungan.");
      }
    } catch (error) {
      request.status = previousStatus;
      request.paidAt = previousPaidAt || null;
      request.paidBy = previousPaidBy || null;
      request.transferDate = previousTransferDate || null;
      request.paymentProofFiles = previousPaymentProofFiles || [];
      request.paidMemberId = previousPaidMemberId;
      request.openMemberId = request.memberId;
      Object.assign(request, previousClosureSnapshot);
      request.transitions.push({
        fromStatus: nextStatus,
        toStatus: previousStatus,
        actorType: "system",
        actorName: "System",
        reason: "Rollback otomatis karena status keanggotaan belum berhasil ditutup.",
        createdAt: now,
      });
      await withdrawalRepository.save(request);
      throw error;
    }
  }

  return request;
}

export async function updateSavingsWithdrawalBankFee({
  requestId,
  feeAmount,
  withdrawalRepository,
  userId = null,
  now = new Date(),
}) {
  const parsedFee = Number(feeAmount);
  if (!Number.isFinite(parsedFee) || parsedFee < 0) {
    const error = new Error("Biaya transfer harus berupa angka nol atau lebih.");
    error.statusCode = 422;
    throw error;
  }

  const request = await withdrawalRepository.findById(requestId);
  if (!request) {
    const error = new Error("Pengajuan penutupan tabungan tidak ditemukan.");
    error.statusCode = 404;
    throw error;
  }
  if (!["submitted", "reviewing"].includes(request.status)) {
    const error = new Error("Biaya transfer hanya dapat disesuaikan sebelum pengajuan disetujui.");
    error.statusCode = 409;
    throw error;
  }
  if (isBcaBankName(request.bankNameSnapshot) && parsedFee > 0) {
    const error = new Error("Biaya antarbank tidak berlaku untuk rekening tujuan BCA.");
    error.statusCode = 422;
    throw error;
  }

  return withdrawalRepository.updateBankFee({ request, feeAmount: Math.round(parsedFee), userId, now });
}

export function assertSavingsWithdrawalBankFeeConfirmed(request) {
  if (isBcaBankName(request?.bankNameSnapshot)) return true;
  if (!request?.bankFeeConfirmedAt || Number(request.bankFeeAmount || 0) <= 0) {
    const error = new Error("Konfirmasikan biaya transfer antarbank lebih dulu sebelum menyetujui pencairan.");
    error.statusCode = 409;
    throw error;
  }
  return true;
}
