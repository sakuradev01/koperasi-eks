import { calculateSavingsSchedule } from "../../../services/savingsSchedule.service.js";

export const MINIMUM_WITHDRAWAL_PAID_PERIODS = 12;
export const EARLY_WITHDRAWAL_PAID_PERIODS = 36;
export const EARLY_WITHDRAWAL_PENALTY_RATE = 0.06;

export function isBcaBankName(bankName) {
  const normalized = String(bankName || "").toUpperCase().replace(/[^A-Z]/g, "");
  return normalized === "BCA" || normalized.includes("BANKCENTRALASIA") || normalized.includes("CENTRALASIA");
}

const toMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const getApprovedDepositBalance = (savings = []) =>
  savings.reduce((balance, saving) => {
    if (!saving || !["Approved", "Partial"].includes(String(saving.status || ""))) {
      return balance;
    }

    const amount = toMoney(saving.amount);
    if (saving.type === "Penarikan") return balance - amount;
    if (!saving.type || saving.type === "Setoran") return balance + amount;
    return balance;
  }, 0);

export function calculateSavingsWithdrawalSnapshot({
  product = {},
  upgrade = null,
  savings = [],
  bankFeeAmount = 0,
} = {}) {
  const schedule = calculateSavingsSchedule({
    termDuration: product.termDuration,
    baseDeposit: product.depositAmount,
    upgrade,
    savings,
  });
  const paidPeriodCount = schedule.periods.filter((period) => period.isFullyPaid).length;
  const grossBalance = Math.max(0, getApprovedDepositBalance(savings));
  const canRequest =
    paidPeriodCount >= MINIMUM_WITHDRAWAL_PAID_PERIODS && grossBalance > 0;
  const withdrawalType =
    paidPeriodCount >= EARLY_WITHDRAWAL_PAID_PERIODS ? "completed" : "early";
  const penaltyAmount = canRequest && withdrawalType === "early"
    ? Math.round(grossBalance * EARLY_WITHDRAWAL_PENALTY_RATE)
    : 0;
  const normalizedBankFee = toMoney(bankFeeAmount);

  return {
    paidPeriodCount,
    totalContractPeriods: schedule.termDuration,
    grossBalance,
    penaltyRate: withdrawalType === "early" ? EARLY_WITHDRAWAL_PENALTY_RATE : 0,
    penaltyAmount,
    bankFeeAmount: normalizedBankFee,
    netAmount: Math.max(0, grossBalance - penaltyAmount - normalizedBankFee),
    withdrawalType,
    canRequest,
    remainingCredit: schedule.remainingCredit,
  };
}

export function isWithdrawalRequestOpen(status) {
  return ["submitted", "reviewing", "approved", "waiting_payment"].includes(
    String(status || "").toLowerCase(),
  );
}
