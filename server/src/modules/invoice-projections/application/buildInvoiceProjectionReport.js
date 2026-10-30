import {
  allocateInvoicePaymentsToProjections,
} from "../domain/projectionSettlement.js";

const EPSILON = 0.000001;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : 0;
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

const monthKey = (value) => dateKey(value).slice(0, 7);

const monthLabel = (value) => {
  const date = toDate(value);
  return date ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : "";
};

const invoiceName = (invoice) =>
  String(invoice?.customerSnapshot?.name || invoice?.customerName || "-").trim() || "-";

const invoiceKey = (invoice) => String(invoice?._id || invoice?.invoiceNumber || "");

const projectionId = (projection, index) =>
  String(projection?._id || `index:${index + 1}`);

const monthPeriods = (startYear, endYear) => {
  const periods = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(Date.UTC(year, month, 1));
      periods.push({
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        year,
        month: month + 1,
        label: monthLabel(date),
      });
    }
  }
  return periods;
};

const addCurrencyTotals = (totals, currency) => {
  const key = String(currency || "IDR").toUpperCase();
  if (!totals.has(key)) {
    totals.set(key, {
      currency: key,
      totalProjection: 0,
      totalRealized: 0,
      difference: 0,
      totalOutstanding: 0,
      totalUnallocated: 0,
    });
  }
  return totals.get(key);
};

const sortedCurrencyTotals = (totals, fields) =>
  [...totals.values()]
    .map((total) => Object.fromEntries(fields.map((field) => [field, total[field]])))
    .sort((left, right) => left.currency.localeCompare(right.currency));

const isInRange = (value, startDate, endDate) => {
  const key = dateKey(value);
  return Boolean(key && key >= startDate && key <= endDate);
};

const isBeforeCutoff = (value, cutoff) => {
  const date = toDate(value);
  const cutoffDate = toDate(cutoff);
  return Boolean(date && cutoffDate && date.getTime() <= cutoffDate.getTime());
};

const projectionStatus = (projection, paidToDate, asOfDate) => {
  const amount = money(projection?.amount);
  const paid = money(paidToDate);
  if (amount > 0 && paid + EPSILON >= amount) return "Paid";
  if (paid > EPSILON) return "Partial";

  const projectionDate = toDate(projection?.estimateDate);
  const cutoff = toDate(asOfDate);
  if (projectionDate && cutoff && dateKey(projectionDate) < dateKey(cutoff)) {
    return "Overdue";
  }
  return "Sent";
};

function buildMonthlyReport(invoices, filters) {
  const rows = [];
  const totals = new Map();
  const startDate = filters.startDate;
  const endDate = filters.endDate;
  const asOfDate = filters.asOfDate;
  const statusFilter = String(filters.status || "all").toLowerCase();

  invoices
    .filter((invoice) => String(invoice?.status || "").toLowerCase() !== "draft")
    .forEach((invoice) => {
      const projections = Array.isArray(invoice.projections) ? invoice.projections : [];
      const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
      const { allocations, unallocatedPayments } =
        allocateInvoicePaymentsToProjections(projections, payments);
      const currency = String(invoice.currency || "IDR").toUpperCase();
      const invoiceId = invoiceKey(invoice);

      projections.forEach((projection, index) => {
        const id = projectionId(projection, index);
        const allocation = allocations.get(id);
        const projectionDate = dateKey(projection.estimateDate);
        const projectedAmount = isInRange(projectionDate, startDate, endDate)
          ? money(projection.amount)
          : 0;
        const relevantPayments = (allocation?.contributions || []).filter((item) =>
          isInRange(item.paymentDate, startDate, endDate),
        );
        const realizedAmount = money(
          relevantPayments.reduce((sum, item) => sum + item.amount, 0),
        );
        if (projectedAmount <= EPSILON && realizedAmount <= EPSILON) return;

        const paidToDate = money(
          (allocation?.contributions || [])
            .filter((item) => isBeforeCutoff(item.paymentDate, asOfDate))
            .reduce((sum, item) => sum + item.amount, 0),
        );
        const status = projectionStatus(projection, paidToDate, asOfDate);
        if (statusFilter !== "all" && status.toLowerCase() !== statusFilter) return;
        const difference = money(projectedAmount - realizedAmount);
        const totalsForCurrency = addCurrencyTotals(totals, currency);
        totalsForCurrency.totalProjection = money(
          totalsForCurrency.totalProjection + projectedAmount,
        );
        totalsForCurrency.totalRealized = money(
          totalsForCurrency.totalRealized + realizedAmount,
        );
        totalsForCurrency.difference = money(
          totalsForCurrency.difference + difference,
        );
        totalsForCurrency.totalOutstanding = money(
          totalsForCurrency.totalOutstanding +
            (projectedAmount > 0 ? Math.max(money(projection.amount) - paidToDate, 0) : 0),
        );

        rows.push({
          id: `${invoiceId}:${id}`,
          rowType: "projection",
          invoiceId,
          invoiceNumber: invoice.invoiceNumber || "-",
          customerName: invoiceName(invoice),
          currency,
          projectionId: id,
          projectionIndex: index + 1,
          projectionDate,
          paymentDates: [...new Set(relevantPayments.map((item) => dateKey(item.paymentDate)).filter(Boolean))],
          description: projection.description || `Cicilan ${index + 1}`,
          status,
          projectedAmount,
          realizedAmount,
          difference,
          remainingAmount: Math.max(money(projection.amount) - paidToDate, 0),
        });
      });

      unallocatedPayments.forEach((payment) => {
        if (statusFilter !== "all" && statusFilter !== "unallocated") return;
        const paymentDate = dateKey(payment.paymentDate);
        if (!isInRange(paymentDate, startDate, endDate)) return;
        const totalsForCurrency = addCurrencyTotals(totals, currency);
        totalsForCurrency.totalRealized = money(
          totalsForCurrency.totalRealized + payment.amount,
        );
        totalsForCurrency.difference = money(
          totalsForCurrency.difference - payment.amount,
        );
        totalsForCurrency.totalUnallocated = money(
          totalsForCurrency.totalUnallocated + payment.amount,
        );
        rows.push({
          id: `${invoiceId}:${payment.paymentId}:unallocated`,
          rowType: "unallocated",
          invoiceId,
          invoiceNumber: invoice.invoiceNumber || "-",
          customerName: invoiceName(invoice),
          currency,
          projectionId: null,
          projectionIndex: null,
          projectionDate: null,
          paymentDates: paymentDate ? [paymentDate] : [],
          description: "Pembayaran belum dialokasikan ke proyeksi",
          status: "Unallocated",
          projectedAmount: 0,
          realizedAmount: payment.amount,
          difference: null,
          remainingAmount: null,
        });
      });
    });

  rows.sort((left, right) =>
    (left.projectionDate || left.paymentDates[0] || "").localeCompare(
      right.projectionDate || right.paymentDates[0] || "",
    ) || left.invoiceNumber.localeCompare(right.invoiceNumber),
  );

  return {
    mode: "monthly",
    filters: { startDate, endDate, asOfDate },
    rows,
    summary: {
      rowCount: rows.length,
      invoiceCount: new Set(rows.map((row) => row.invoiceId)).size,
      byCurrency: sortedCurrencyTotals(totals, [
        "currency", "totalProjection", "totalRealized", "difference", "totalUnallocated",
      ]),
    },
  };
}

function buildYearlyReport(invoices, filters) {
  const { startYear, endYear, asOfDate } = filters;
  const periods = monthPeriods(startYear, endYear);
  const periodKeys = new Set(periods.map((period) => period.key));
  const totals = new Map();
  const rows = [];
  const rangeStart = `${startYear}-01-01`;
  const rangeEnd = `${endYear}-12-31`;

  invoices
    .filter((invoice) => String(invoice?.status || "").toLowerCase() !== "draft")
    .forEach((invoice) => {
      const projections = Array.isArray(invoice.projections) ? invoice.projections : [];
      const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
      const inRangeProjections = projections
        .map((projection, index) => ({ projection, index }))
        .filter(({ projection }) => isInRange(projection.estimateDate, rangeStart, rangeEnd));
      if (!inRangeProjections.length) return;

      const { allocations, unallocatedPayments } =
        allocateInvoicePaymentsToProjections(projections, payments);
      const currency = String(invoice.currency || "IDR").toUpperCase();
      const invoiceId = invoiceKey(invoice);
      const months = Object.fromEntries(periods.map((period) => [period.key, 0]));
      let totalProjection = 0;
      let totalOutstanding = 0;

      inRangeProjections.forEach(({ projection, index }) => {
        const id = projectionId(projection, index);
        const allocation = allocations.get(id);
        const paidToDate = money(
          (allocation?.contributions || [])
            .filter((item) => isBeforeCutoff(item.paymentDate, asOfDate))
            .reduce((sum, item) => sum + item.amount, 0),
        );
        const projectionAmount = money(projection.amount);
        const outstanding = money(Math.max(projectionAmount - paidToDate, 0));
        const key = monthKey(projection.estimateDate);
        totalProjection = money(totalProjection + projectionAmount);
        if (periodKeys.has(key)) months[key] = money(months[key] + outstanding);
        totalOutstanding = money(totalOutstanding + outstanding);
      });

      const totalsForCurrency = addCurrencyTotals(totals, currency);
      totalsForCurrency.totalProjection = money(
        totalsForCurrency.totalProjection + totalProjection,
      );
      totalsForCurrency.totalOutstanding = money(
        totalsForCurrency.totalOutstanding + totalOutstanding,
      );
      totalsForCurrency.totalUnallocated = money(
        totalsForCurrency.totalUnallocated +
          unallocatedPayments
            .filter((payment) => isBeforeCutoff(payment.paymentDate, asOfDate))
            .reduce((sum, payment) => sum + payment.amount, 0),
      );

      if (totalOutstanding > EPSILON) {
        rows.push({
          id: invoiceId,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber || "-",
          customerName: invoiceName(invoice),
          currency,
          status: String(invoice.status || "sent").toLowerCase(),
          months,
          totalProjection,
          totalOutstanding,
        });
      }
    });

  rows.sort((left, right) =>
    left.customerName.localeCompare(right.customerName) ||
    left.invoiceNumber.localeCompare(right.invoiceNumber),
  );

  return {
    mode: "yearly",
    filters: { startYear, endYear, asOfDate },
    periods,
    rows,
    summary: {
      invoiceCount: rows.length,
      byCurrency: sortedCurrencyTotals(totals, [
        "currency", "totalProjection", "totalOutstanding", "totalUnallocated",
      ]),
    },
  };
}

export function buildInvoiceProjectionReport(invoices = [], filters = {}) {
  if (filters.mode === "monthly") return buildMonthlyReport(invoices, filters);
  if (filters.mode === "yearly") return buildYearlyReport(invoices, filters);
  throw new RangeError("Mode laporan invoice projection tidak valid.");
}
