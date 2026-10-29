import { calculateSavingsWithdrawalSnapshot } from "../domain/withdrawalPolicy.js";
import { SavingsWithdrawalError } from "./submitWithdrawal.js";

const normalizeMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(Math.max(0, amount)) : 0;
};
const normalizeText = (value) => String(value ?? "").trim();

function normalizeLines(lines, expectedAmount) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new SavingsWithdrawalError("Minimal satu kategori pembukuan wajib dipilih.", 422, "EXPENSE_CATEGORY_REQUIRED");
  }
  const normalized = lines
    .map((line) => ({
      categoryId: normalizeText(line.categoryId ?? line.category_id),
      description: normalizeText(line.description),
      amount: normalizeMoney(line.amount),
    }))
    .filter((line) => line.categoryId && line.amount > 0);
  const total = normalized.reduce((sum, line) => sum + line.amount, 0);
  if (!normalized.length || Math.abs(total - expectedAmount) > 0.01) {
    throw new SavingsWithdrawalError("Total kategori harus sama dengan jumlah transfer.", 422, "EXPENSE_CATEGORY_TOTAL_MISMATCH");
  }
  return normalized;
}

export function createRecordLegacySavingsWithdrawal({
  memberRepository,
  savingsRepository,
  withdrawalRepository,
  expenseRepository,
  accountingGateway,
  proofStorage = { discard: async () => {} },
  clock = () => new Date(),
  random = Math.random,
}) {
  return {
    async execute({ memberId, input = {}, proofFile, actor = {} }) {
      const member = await memberRepository.findForWithdrawalById(memberId);
      if (!member) throw new SavingsWithdrawalError("Anggota tidak ditemukan.", 404, "MEMBER_NOT_FOUND");

      const previousRequest = await withdrawalRepository.findAnyByMember(member._id);
      if (previousRequest && !["rejected", "cancelled"].includes(previousRequest.status)) {
        throw new SavingsWithdrawalError("Anggota sudah memiliki riwayat penutupan tabungan.", 409, "WITHDRAWAL_ALREADY_RECORDED");
      }

      const transferDate = new Date(input.transferDate);
      if (!input.transferDate || Number.isNaN(transferDate.getTime())) {
        throw new SavingsWithdrawalError("Tanggal transfer wajib diisi.", 422, "TRANSFER_DATE_REQUIRED");
      }
      const accountId = normalizeText(input.accountId);
      const paidBy = normalizeText(input.paidBy);
      const reason = normalizeText(input.reason) || "Pencatatan penutupan tabungan lama oleh Finance.";
      const grossAmount = normalizeMoney(input.grossAmount);
      const penaltyAmount = normalizeMoney(input.penaltyAmount);
      const bankFeeAmount = normalizeMoney(input.bankFeeAmount);
      if (!accountId || !paidBy || paidBy.length < 3 || !proofFile) {
        throw new SavingsWithdrawalError("Akun pembayaran, nama pengirim, dan bukti transfer wajib diisi.", 422, "LEGACY_PAYMENT_DETAILS_REQUIRED");
      }

      const savings = await savingsRepository.findForMember(member._id);
      const scheduleSnapshot = calculateSavingsWithdrawalSnapshot({
        product: member.productId || {},
        upgrade: member.currentUpgradeId,
        savings,
      });
      const resolvedGross = grossAmount || scheduleSnapshot.grossBalance;
      if (resolvedGross <= 0 || penaltyAmount + bankFeeAmount >= resolvedGross) {
        throw new SavingsWithdrawalError("Nominal saldo/biaya pencairan tidak valid.", 422, "INVALID_LEGACY_PAYOUT");
      }
      const netAmount = resolvedGross - penaltyAmount - bankFeeAmount;
      const lines = normalizeLines(input.lines, netAmount);
      await expenseRepository.assertAccountsExist(accountId, lines.map((line) => line.categoryId));

      const now = clock();
      const requestNumber = `TTP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0")}`;
      let request;
      let expense;
      try {
        request = await withdrawalRepository.create({
          requestNumber,
          memberId: member._id,
          paidMemberId: member._id,
          memberUuidSnapshot: member.uuid,
          memberNameSnapshot: member.name,
          productId: member.productId?._id || member.productId || null,
          productNameSnapshot: member.productId?.title || "",
          openMemberId: member._id,
          source: "admin_legacy",
          status: "waiting_payment",
          grossAmount: resolvedGross,
          paidPeriodCount: scheduleSnapshot.paidPeriodCount,
          contractPeriodCount: scheduleSnapshot.totalContractPeriods,
          withdrawalType: "admin_legacy",
          penaltyRate: resolvedGross ? penaltyAmount / resolvedGross : 0,
          penaltyAmount,
          bankFeeAmount,
          netAmount,
          bankFeeConfirmedAt: now,
          bankNameSnapshot: normalizeText(input.bankName || member.bankName) || "Tidak dicatat",
          accountNumberSnapshot: normalizeText(input.destinationAccountNumber || member.accountNumber) || "Tidak dicatat",
          accountHolderSnapshot: normalizeText(input.destinationAccountHolder || member.accountHolderName || member.name),
          withdrawalMonth: transferDate.getMonth() + 1,
          withdrawalYear: transferDate.getFullYear(),
          reason,
          reviewedBy: actor.id || null,
          reviewedAt: now,
          transitions: [{
            fromStatus: "",
            toStatus: "waiting_payment",
            actorType: "admin",
            actorId: actor.id || null,
            actorName: actor.name || "Finance",
            reason: "Finance mencatat pencairan tabungan lama.",
            createdAt: now,
          }],
        });

        expense = await expenseRepository.create({
          applicantType: "member",
          applicantMemberId: member._id,
          applicantName: member.name,
          applicantUuidSnapshot: member.uuid,
          title: `Tutup Tabungan ${member.name}`,
          dateStart: transferDate,
          dateEnd: transferDate,
          seller: normalizeText(input.destinationAccountHolder || member.accountHolderName || member.name),
          amount: netAmount,
          description: `Pencatatan pencairan tabungan lama. Bruto Rp${resolvedGross}; penalti Rp${penaltyAmount}; biaya antarbank Rp${bankFeeAmount}. Alasan: ${reason}`,
          accountId,
          status: "paid",
          expenseSource: "savings_withdrawal",
          savingsWithdrawalId: request._id,
          paymentProof: proofFile.filename,
          transferDate,
          paidBy,
          paidAt: now,
          createdBy: actor.id || null,
          updatedBy: actor.id || null,
        });
        request.expenseId = expense._id;
        request.paidAt = now;
        request.paidBy = actor.id || null;
        request.transferDate = transferDate;
        request.paymentProofFiles = [proofFile.filename];
        request.status = "paid";
        request.openMemberId = undefined;
        request.transitions.push({
          fromStatus: "waiting_payment",
          toStatus: "paid",
          actorType: "admin",
          actorId: actor.id || null,
          actorName: actor.name || "Finance",
          reason: "Pencatatan pembayaran lama berhasil dibukukan.",
          createdAt: now,
        });
        await withdrawalRepository.save(request);
        await expenseRepository.createLines(expense._id, lines);
        await expenseRepository.createPaymentProof(expense._id, proofFile.filename, paidBy);

        const transactionResult = await accountingGateway.createTransactionFromExpense(expense, {
          transferDate,
          transactional: true,
        });
        if (!transactionResult?.success) {
          throw new SavingsWithdrawalError(transactionResult?.message || "Transaksi pembukuan gagal dibuat.", 422, "LEGACY_TRANSACTION_FAILED");
        }
        await memberRepository.markWithdrawalPaid({ memberId: member._id, userId: actor.id, now });
        return { request, expense, transaction: transactionResult.data };
      } catch (error) {
        if (expense?._id) await accountingGateway.deleteLinkedTransaction(expense._id);
        if (expense?._id) await expenseRepository.deleteById(expense._id);
        if (request?._id) await withdrawalRepository.deleteById(request._id);
        await expenseRepository.deleteLines(expense?._id);
        await expenseRepository.deletePaymentProofs(expense?._id);
        await proofStorage.discard(proofFile);
        throw error;
      }
    },
  };
}
