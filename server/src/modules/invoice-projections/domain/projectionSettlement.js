const EPSILON = 0.000001;

const toId = (value) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : 0;
};

export function paymentMatchesProjection(payment, projection, projectionIndex) {
  if (!payment || !projection) return false;

  const coveredIds = parseArray(payment.coveredProjectionIds)
    .map(toId)
    .filter(Boolean);
  if (coveredIds.length > 0) {
    return coveredIds.includes(toId(projection._id));
  }

  if (payment.projectionId) {
    return toId(payment.projectionId) === toId(projection._id);
  }

  return Number(payment.projectionIndex || 0) === Number(projectionIndex);
}

export function paymentContributionToProjection(payment, projection, projectionIndex) {
  if (!paymentMatchesProjection(payment, projection, projectionIndex)) return 0;

  const breakdown = Array.isArray(payment.coveredProjectionBreakdown)
    ? payment.coveredProjectionBreakdown
    : [];
  if (breakdown.length > 0) {
    const row = breakdown.find(
      (item) =>
        toId(item?.projectionId) === toId(projection._id) ||
        (Number(item?.projectionIndex || 0) > 0 &&
          Number(item.projectionIndex) === Number(projectionIndex)),
    );
    return money(row?.amount);
  }

  const coveredIds = parseArray(payment.coveredProjectionIds)
    .map(toId)
    .filter(Boolean);
  if (coveredIds.length > 1) return 0;

  return money(payment.amount);
}

export function allocateInvoicePaymentsToProjections(projections = [], payments = []) {
  const allocations = new Map();
  const projectionEntries = projections.map((projection, index) => {
    const projectionIndex = index + 1;
    const projectionId = toId(projection?._id) || `index:${projectionIndex}`;
    const allocation = {
      projectionId,
      projectionIndex,
      paidAmount: 0,
      contributions: [],
    };
    allocations.set(projectionId, allocation);
    return { projection, projectionIndex, allocation };
  });

  const unallocatedPayments = [];
  payments.forEach((payment, paymentIndex) => {
    let allocatedAmount = 0;

    projectionEntries.forEach(({ projection, projectionIndex, allocation }) => {
      const amount = paymentContributionToProjection(payment, projection, projectionIndex);
      if (amount <= EPSILON) return;

      allocation.paidAmount = money(allocation.paidAmount + amount);
      allocation.contributions.push({
        paymentId: toId(payment?._id) || `payment:${paymentIndex + 1}`,
        paymentDate: payment?.paymentDate || null,
        amount,
      });
      allocatedAmount = money(allocatedAmount + amount);
    });

    const unallocatedAmount = money(Math.max(money(payment?.amount) - allocatedAmount, 0));
    if (unallocatedAmount > EPSILON) {
      unallocatedPayments.push({
        paymentId: toId(payment?._id) || `payment:${paymentIndex + 1}`,
        paymentDate: payment?.paymentDate || null,
        amount: unallocatedAmount,
      });
    }
  });

  return { allocations, unallocatedPayments };
}
