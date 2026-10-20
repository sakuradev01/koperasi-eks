import { calculateSavingsSchedule } from "../../../shared/savingsSchedule.js";

const getSavingsTerm = (member, savings) => {
  const configuredTerm = Number(member?.product?.termDuration);
  if (configuredTerm > 0) return configuredTerm;

  const latestPeriod = Math.max(
    0,
    ...savings.map((saving) => Number(saving?.installmentPeriod) || 0),
  );

  return latestPeriod > 0 ? Math.max(latestPeriod, 12) : 36;
};

const isMemberDeposit = (saving) => !saving?.type || saving.type === "Setoran";

const getDisplayStatus = (period, transactions) => {
  if (period.isFullyPaid) return "paid";
  if (transactions.some((transaction) => transaction.status === "Pending")) {
    return "pending";
  }
  if (period.paid > 0) return "partial";
  if (transactions.some((transaction) => transaction.status === "Rejected")) {
    return "rejected";
  }

  return "belum_bayar";
};

export function buildMemberSavingsPeriodRows({ member, savings = [] } = {}) {
  if (!member?.product) return [];

  const memberSavings = Array.isArray(savings) ? savings : [];
  const upgrade = member.hasUpgraded
    ? member.upgradeInfo || member.currentUpgradeId || null
    : null;
  const schedule = calculateSavingsSchedule({
    termDuration: getSavingsTerm(member, memberSavings),
    baseDeposit: member.product.depositAmount,
    upgrade,
    savings: memberSavings,
  });

  const startDate = new Date(member.savingsStartDate || member.createdAt);

  return schedule.periods.map((period) => {
    const periodTransactions = memberSavings
      .filter(
        (saving) =>
          isMemberDeposit(saving) &&
          Number(saving.installmentPeriod) === period.period,
      )
      .sort(
        (left, right) =>
          new Date(right.savingsDate) - new Date(left.savingsDate),
      )
      .map((transaction) => ({
        ...transaction,
        rejectionReason: transaction.rejectionReason || null,
      }));

    const periodDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + period.period - 1,
      1,
    );

    return {
      period: period.period,
      monthName: periodDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      }),
      status: getDisplayStatus(period, periodTransactions),
      totalPaid: period.paid,
      requiredAmount: period.effectiveTarget,
      remainingAmount: period.remaining,
      creditApplied: period.creditApplied,
      transactions: periodTransactions,
      percentage: period.paidPercentage,
      overpaymentAmount: period.overpayment,
    };
  });
}
