import { getEffectiveMembershipStatus } from "../../../utils/membershipStatus.js";
import {
  calculateSavingsWithdrawalSnapshot,
  isWithdrawalRequestOpen,
} from "../domain/withdrawalPolicy.js";

export class SavingsWithdrawalError extends Error {
  constructor(message, statusCode = 400, code = "SAVINGS_WITHDRAWAL_ERROR") {
    super(message);
    this.name = "SavingsWithdrawalError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const normalizeText = (value) => String(value ?? "").trim();

const validateWithdrawalInput = (input = {}, earlyWithdrawal = false) => {
  const withdrawalMonth = Number(input.withdrawalMonth);
  const withdrawalYear = Number(input.withdrawalYear);
  const reason = normalizeText(input.reason);
  const bankName = normalizeText(input.bankName);
  const accountNumber = normalizeText(input.accountNumber);
  const accountHolder = normalizeText(input.accountHolder);

  if (!Number.isInteger(withdrawalMonth) || withdrawalMonth < 1 || withdrawalMonth > 12) {
    throw new SavingsWithdrawalError("Bulan pencairan tidak valid.", 422, "INVALID_WITHDRAWAL_MONTH");
  }
  if (!Number.isInteger(withdrawalYear) || withdrawalYear < 2000 || withdrawalYear > 2200) {
    throw new SavingsWithdrawalError("Tahun pencairan tidak valid.", 422, "INVALID_WITHDRAWAL_YEAR");
  }
  if (reason.length < 5 || reason.length > 2000) {
    throw new SavingsWithdrawalError("Alasan penarikan wajib diisi (5-2.000 karakter).", 422, "INVALID_REASON");
  }
  if (!bankName || !accountNumber || !accountHolder) {
    throw new SavingsWithdrawalError("Data rekening tujuan belum lengkap. Hubungi Finance.", 422, "BANK_ACCOUNT_REQUIRED");
  }
  if (earlyWithdrawal && input.policyAccepted !== true) {
    throw new SavingsWithdrawalError("Persetujuan ketentuan penarikan awal wajib dikonfirmasi.", 422, "EARLY_WITHDRAWAL_POLICY_REQUIRED");
  }

  return { withdrawalMonth, withdrawalYear, reason, bankName, accountNumber, accountHolder };
};

const createRequestNumber = (now, random = Math.random) => {
  const suffix = random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  return `TTP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${suffix}`;
};

function buildExpenseDescription(request) {
  return [
    `Pengajuan tutup tabungan ${request.memberNameSnapshot} (${request.memberUuidSnapshot})`,
    `Simpanan bruto: Rp ${request.grossAmount}`,
    `Penalti: Rp ${request.penaltyAmount}`,
    `Biaya transfer antarbank: Rp ${request.bankFeeAmount} (perlu dikonfirmasi Finance bila non-BCA)`,
    `Estimasi transfer: Rp ${request.netAmount}`,
    `Rekening tujuan: ${request.bankNameSnapshot} ${request.accountNumberSnapshot} a.n. ${request.accountHolderSnapshot}`,
    `Jadwal permintaan: ${String(request.withdrawalMonth).padStart(2, "0")}/${request.withdrawalYear}`,
    `Alasan: ${request.reason}`,
  ].join("\n");
}

export function createSubmitSavingsWithdrawal({
  settingsRepository,
  memberRepository,
  savingsRepository,
  withdrawalRepository,
  expenseRepository,
  clock = () => new Date(),
  random = Math.random,
}) {
  return {
    async execute({ memberId, input = {} }) {
      const setting = await settingsRepository.getStudentRequestSetting();
      if (!setting?.studentRequestEnabled) {
        throw new SavingsWithdrawalError("Fitur tutup tabungan belum dibuka oleh Koperasi.", 403, "WITHDRAWAL_DISABLED");
      }

      const member = await memberRepository.findForWithdrawal(memberId);
      if (!member) throw new SavingsWithdrawalError("Anggota tidak ditemukan.", 404, "MEMBER_NOT_FOUND");
      if (getEffectiveMembershipStatus(member) !== "active") {
        throw new SavingsWithdrawalError("Tabungan anggota tidak aktif.", 409, "MEMBERSHIP_INACTIVE");
      }

      const existingOpenRequest = await withdrawalRepository.findOpenByMember(member._id);
      if (existingOpenRequest && isWithdrawalRequestOpen(existingOpenRequest.status)) {
        throw new SavingsWithdrawalError("Pengajuan tutup tabungan Anda masih diproses.", 409, "WITHDRAWAL_ALREADY_OPEN");
      }

      if (await withdrawalRepository.hasUnsettledSavingsPayment?.({ memberId: member._id, memberUuid: member.uuid })) {
        throw new SavingsWithdrawalError(
          "Masih ada setoran atau pembayaran online yang menunggu konfirmasi Finance. Selesaikan atau tolak setoran tersebut sebelum mengajukan penutupan tabungan.",
          409,
          "SAVINGS_PAYMENT_UNSETTLED",
        );
      }

      const product = member.productId;
      if (!product || typeof product !== "object") {
        throw new SavingsWithdrawalError("Produk simpanan anggota belum tersedia.", 409, "SAVINGS_PRODUCT_REQUIRED");
      }

      const savings = await savingsRepository.findForMember(member._id);
      const snapshot = calculateSavingsWithdrawalSnapshot({
        product,
        upgrade: member.currentUpgradeId,
        savings,
      });
      if (!snapshot.canRequest) {
        throw new SavingsWithdrawalError(
          `Pengajuan dapat dilakukan setelah minimal 12 periode lunas disetujui Finance. Saat ini ${snapshot.paidPeriodCount} periode sudah lunas.`,
          409,
          "WITHDRAWAL_NOT_ELIGIBLE",
        );
      }

      const earlyWithdrawal = snapshot.withdrawalType === "early";
      const account = {
        bankName: member.bankName,
        accountNumber: member.accountNumber,
        accountHolder: member.accountHolderName,
      };
      const details = validateWithdrawalInput({ ...input, ...account }, earlyWithdrawal);
      const now = clock();
      const requestData = {
        requestNumber: createRequestNumber(now, random),
        memberId: member._id,
        memberUuidSnapshot: member.uuid,
        memberNameSnapshot: member.name,
        productId: product._id,
        productNameSnapshot: product.title || "",
        openMemberId: member._id,
        source: "student",
        status: "submitted",
        grossAmount: snapshot.grossBalance,
        paidPeriodCount: snapshot.paidPeriodCount,
        contractPeriodCount: snapshot.totalContractPeriods,
        withdrawalType: snapshot.withdrawalType,
        penaltyRate: snapshot.penaltyRate,
        penaltyAmount: snapshot.penaltyAmount,
        bankFeeAmount: 0,
        netAmount: snapshot.netAmount,
        bankNameSnapshot: details.bankName,
        accountNumberSnapshot: details.accountNumber,
        accountHolderSnapshot: details.accountHolder,
        withdrawalMonth: details.withdrawalMonth,
        withdrawalYear: details.withdrawalYear,
        reason: details.reason,
        policyAcceptedAt: earlyWithdrawal ? now : null,
        transitions: [{
          fromStatus: "",
          toStatus: "submitted",
          actorType: "member",
          actorId: member._id,
          actorName: member.name,
          reason: "Pengajuan diajukan melalui Student Dashboard.",
          createdAt: now,
        }],
      };

      let request;
      let expense;
      try {
        request = await withdrawalRepository.create(requestData);
        expense = await expenseRepository.create({
          applicantType: "member",
          applicantMemberId: member._id,
          applicantName: member.name,
          applicantUuidSnapshot: member.uuid,
          title: `Penarikan Tabungan ${member.name}`,
          dateStart: new Date(details.withdrawalYear, details.withdrawalMonth - 1, 1),
          dateEnd: new Date(details.withdrawalYear, details.withdrawalMonth, 0),
          seller: details.accountHolder,
          amount: snapshot.netAmount,
          description: buildExpenseDescription(requestData),
          accountId: null,
          status: "uncategorized",
          expenseSource: "savings_withdrawal",
          savingsWithdrawalId: request._id,
          createdBy: null,
          updatedBy: null,
        });
        const attachedRequest = await withdrawalRepository.attachExpense(request._id, expense._id);
        if (!attachedRequest) {
          throw new Error("Expense penutupan gagal ditautkan ke pengajuan.");
        }
        request = attachedRequest;
      } catch (error) {
        if (expense?._id) await expenseRepository.deleteById(expense._id);
        if (request?._id) await withdrawalRepository.deleteById(request._id);
        if (error?.code === 11000) {
          throw new SavingsWithdrawalError("Sudah ada pengajuan tutup tabungan yang sedang diproses.", 409, "WITHDRAWAL_ALREADY_OPEN");
        }
        throw error;
      }

      return { request, expense };
    },
  };
}

export { validateWithdrawalInput };
