const APPROVED_STATUSES = new Set(["Approved", "Partial"]);
const OVERPAYMENT_THRESHOLD = 30_000;

const toId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const getProduct = (member, productsById) => {
  if (member?.product && typeof member.product === "object") return member.product;
  return productsById.get(toId(member?.productId)) || null;
};

const activityDate = (saving) => saving?.savingsDate || saving?.paymentDate || saving?.createdAt;

const getStartDate = (member, memberSavings) => {
  if (member?.savingsStartDate) return new Date(member.savingsStartDate);

  const inferred = memberSavings
    .filter((saving) => saving.type === "Setoran" && Number(saving.installmentPeriod) > 0)
    .map((saving) => {
      const date = new Date(activityDate(saving));
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      date.setDate(1);
      date.setMonth(date.getMonth() - (Number(saving.installmentPeriod) - 1));
      return date;
    })
    .filter(Boolean);

  return inferred.length
    ? new Date(Math.min(...inferred.map((date) => date.getTime())))
    : new Date(member?.createdAt || Date.now());
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date) =>
  new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(date);

const getMemberSavings = (member, savingsByMember) => {
  const keys = [toId(member?._id), member?.uuid].filter(Boolean);
  return keys.flatMap((key) => savingsByMember.get(key) || []);
};

export const buildProjectionPeriods = (startYear, endYear) => {
  const periods = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(year, month, 1);
      periods.push({ key: monthKey(date), year, month, label: monthLabel(date) });
    }
  }
  return periods;
};

export const buildPaymentProjectionReport = ({
  members = [],
  products = [],
  savings = [],
  startYear,
  endYear,
}) => {
  const productsById = new Map(products.map((product) => [toId(product?._id), product]));
  const savingsByMember = new Map();
  savings.forEach((saving) => {
    [toId(saving.memberId), saving.memberId?.uuid].filter(Boolean).forEach((key) => {
      const existing = savingsByMember.get(key) || [];
      existing.push(saving);
      savingsByMember.set(key, existing);
    });
  });

  const periods = buildProjectionPeriods(startYear, endYear);
  const totals = Object.fromEntries(periods.map((period) => [period.key, 0]));
  const rows = [];

  members
    .filter((member) => member?.isVerified === true && (member.membershipStatus || "active") === "active")
    .forEach((member) => {
      const product = getProduct(member, productsById);
      if (!product) return;
      const memberSavings = getMemberSavings(member, savingsByMember);
      const startDate = getStartDate(member, memberSavings);
      const months = Object.fromEntries(periods.map((period) => [period.key, 0]));
      let carriedOverpay = 0;
      const termDuration = Number(product.termDuration) || 0;

      for (let installment = 1; installment <= termDuration; installment += 1) {
        const dueDate = new Date(startDate);
        dueDate.setHours(0, 0, 0, 0);
        dueDate.setDate(1);
        dueDate.setMonth(dueDate.getMonth() + installment - 1);
        const key = monthKey(dueDate);
        const target = Number(product.depositAmount) || 0;
        const creditApplied = Math.min(carriedOverpay, target);
        const effectiveTarget = Math.max(0, target - creditApplied);
        const paid = memberSavings
          .filter(
            (saving) =>
              saving.type === "Setoran" &&
              Number(saving.installmentPeriod) === installment &&
              APPROVED_STATUSES.has(saving.status),
          )
          .reduce((sum, saving) => sum + (Number(saving.amount) || 0), 0);
        const remaining = Math.max(0, effectiveTarget - paid);
        const overpayment = Math.max(0, paid - effectiveTarget);
        if (overpayment >= OVERPAYMENT_THRESHOLD) carriedOverpay += overpayment;
        carriedOverpay -= creditApplied;
        if (Object.prototype.hasOwnProperty.call(months, key)) {
          months[key] += remaining;
          totals[key] += remaining;
        }
      }

      const totalOutstanding = Object.values(months).reduce((sum, amount) => sum + amount, 0);
      if (totalOutstanding > 0) {
        rows.push({
          id: toId(member._id) || member.uuid,
          customerName: member.name || "-",
          customerCode: member.uuid || "-",
          productTitle: product.title || "-",
          months,
          totalOutstanding,
        });
      }
    });

  return {
    periods,
    totals,
    rows: rows.sort((left, right) => right.totalOutstanding - left.totalOutstanding),
    totalOutstanding: Object.values(totals).reduce((sum, amount) => sum + amount, 0),
  };
};
