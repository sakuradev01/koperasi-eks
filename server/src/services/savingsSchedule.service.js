/**
 * Single source of truth for period-level savings calculations.
 *
 * The admin UI, upgrade flow, and student-facing APIs must all agree on these
 * rules. Only Approved and Partial Setoran rows contribute to paid amount.
 * Overpayment at or above the threshold is carried to the next period.
 */

export const OVERPAY_THRESHOLD = 30_000;
export const PAID_SAVINGS_STATUSES = Object.freeze(["Approved", "Partial"]);

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Math.trunc(toFiniteNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
};

const getBaseTarget = (period, baseDeposit, upgrade) => {
  const defaultTarget = Math.max(0, toFiniteNumber(baseDeposit));
  if (!upgrade || typeof upgrade !== "object") return defaultTarget;

  const completedAtUpgrade = toPositiveInteger(upgrade.completedPeriodsAtUpgrade);
  const oldTarget = Math.max(0, toFiniteNumber(upgrade.oldMonthlyDeposit));
  const newTarget = Math.max(
    0,
    toFiniteNumber(upgrade.newPaymentWithCompensation, defaultTarget),
  );

  if (completedAtUpgrade > 0 && period <= completedAtUpgrade && oldTarget > 0) {
    return oldTarget;
  }

  return newTarget || defaultTarget;
};

const addPayment = (paymentsByPeriod, period, amount) => {
  paymentsByPeriod.set(period, (paymentsByPeriod.get(period) || 0) + amount);
};

/**
 * Calculate the effective target and status for every period.
 *
 * @param {object} options
 * @param {number} options.termDuration Number of periods in the product.
 * @param {number} options.baseDeposit Product deposit amount.
 * @param {object|null} [options.upgrade] ProductUpgrade-like fields.
 * @param {Array<object>} [options.savings] Savings rows for the member.
 * @returns {{termDuration:number, periods:Array<object>, totalPaid:number,
 *   totalEffectiveTarget:number, remainingCredit:number}}
 */
export function calculateSavingsSchedule({
  termDuration,
  baseDeposit,
  upgrade = null,
  savings = [],
} = {}) {
  const term = toPositiveInteger(termDuration);
  const paymentsByPeriod = new Map();

  for (const saving of Array.isArray(savings) ? savings : []) {
    if (saving?.type && saving.type !== "Setoran") continue;
    if (!PAID_SAVINGS_STATUSES.includes(String(saving?.status || ""))) continue;

    const period = toPositiveInteger(saving?.installmentPeriod);
    const amount = Math.max(0, toFiniteNumber(saving?.amount));
    if (period < 1 || amount <= 0) continue;
    addPayment(paymentsByPeriod, period, amount);
  }

  const periods = [];
  let carriedOverpay = 0;
  let totalPaid = 0;
  let totalEffectiveTarget = 0;

  for (let period = 1; period <= term; period += 1) {
    const baseTarget = getBaseTarget(period, baseDeposit, upgrade);
    const creditApplied = Math.min(carriedOverpay, baseTarget);
    const effectiveTarget = Math.max(0, baseTarget - creditApplied);
    const paid = Math.max(0, paymentsByPeriod.get(period) || 0);
    const remaining = Math.max(0, effectiveTarget - paid);
    const isFullyPaid =
      (effectiveTarget > 0 && paid >= effectiveTarget) ||
      (effectiveTarget === 0 && creditApplied > 0);
    const overpayment = Math.max(0, paid - effectiveTarget);

    carriedOverpay -= creditApplied;
    if (overpayment >= OVERPAY_THRESHOLD) {
      carriedOverpay += overpayment;
    }

    const status = isFullyPaid ? "Lunas" : paid > 0 ? "Sebagian" : "Belum Bayar";

    periods.push({
      period,
      baseTarget,
      effectiveTarget,
      paid,
      creditApplied,
      remaining,
      overpayment,
      isOverpaid: overpayment > 0,
      isFullyPaid,
      paidPercentage:
        effectiveTarget > 0
          ? Math.min(100, Math.round((paid / effectiveTarget) * 1000) / 10)
          : creditApplied > 0
            ? 100
            : 0,
      status,
    });

    totalPaid += paid;
    totalEffectiveTarget += effectiveTarget;
  }

  return {
    termDuration: term,
    periods,
    totalPaid,
    totalEffectiveTarget,
    remainingCredit: carriedOverpay,
  };
}

export function getFirstIncompletePeriod(schedule) {
  return (
    schedule?.periods?.find((period) => !period.isFullyPaid) || null
  );
}

export function getNextPayablePeriod(schedule) {
  const incomplete = getFirstIncompletePeriod(schedule);
  return incomplete?.period || null;
}
