import { AccountingTransaction } from "../../models/accountingTransaction.model.js";
import { TransactionSplit } from "../../models/transactionSplit.model.js";
import { CoaMaster } from "../../models/coaMaster.model.js";
import { CoaSubmenu } from "../../models/coaSubmenu.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";
import { Member } from "../../models/member.model.js";
import { Invoice } from "../../models/invoice.model.js";
import {
  categoryBalanceMovement,
  cashFlowMovement,
  hasSplitAmountMismatch,
  maxReportDate,
  profitLossMovement,
  resolveBalanceSheetAsOfDate,
  resolveProfitLossPeriod,
  roundReportMoney,
} from "../../utils/accountingReportMath.js";

const COGS_SUBMENUS = new Set(["Cost of Goods Sold", "COGS", "Direct Costs", "Cost of Sales"]);
const CASH_ASSET_SUBMENUS = new Set(["Cash and Bank", "Cash on Hand", "Bank Accounts", "Money in Transit"]);
const LIABILITY_LONG_TERM_SUBMENUS = new Set([
  "Loan and Line of Credit",
  "Long Term Liabilities",
  "Long-term Liabilities",
  "Notes Payable",
  "Loans Payable",
  "Other Long-Term Liability",
]);
const AGED_RECEIVABLE_BUCKETS = [
  {
    key: "notYetDue",
    label: "Belum Jatuh Tempo",
    shortLabel: "Not Yet Due",
    from: null,
    to: 0,
  },
  {
    key: "days1to5",
    label: "1 - 5 Hari",
    shortLabel: "1-5",
    from: 1,
    to: 5,
  },
  {
    key: "days6to89",
    label: "6 - 89 Hari",
    shortLabel: "6-89",
    from: 6,
    to: 89,
  },
  {
    key: "days90to119",
    label: "90 - 119 Hari",
    shortLabel: "90-119",
    from: 90,
    to: 119,
  },
  {
    key: "days120to179",
    label: "120 - 179 Hari",
    shortLabel: "120-179",
    from: 120,
    to: 179,
  },
  {
    key: "days180plus",
    label: "180+ Hari (Red Debt)",
    shortLabel: "180+",
    from: 180,
    to: null,
    danger: true,
  },
];

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  return String(value);
}

function normalizeMoney(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function parseDateInput(value, fallbackDate) {
  if (!value) return new Date(fallbackDate);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(fallbackDate);
  return parsed;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatYmd(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sendCsv(res, filename, rows) {
  const csvContent = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
}

function respondReportError(res, error) {
  const status = error instanceof RangeError ? 400 : 500;
  return res.status(status).json({ success: false, message: error.message });
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function dateDiffDays(left, right) {
  const leftDate = startOfDay(left);
  const rightDate = startOfDay(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return 0;
  }
  return Math.round((leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

function isSameObjectId(left, right) {
  const leftId = toIdString(left);
  const rightId = toIdString(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

function paymentMatchesProjection(payment, projection, projectionIndex) {
  if (!payment || !projection) return false;

  const coveredIds = Array.isArray(payment.coveredProjectionIds)
    ? payment.coveredProjectionIds
    : [];
  if (coveredIds.length > 0) {
    return coveredIds.some((id) => isSameObjectId(id, projection._id));
  }

  if (payment.projectionId && isSameObjectId(payment.projectionId, projection._id)) {
    return true;
  }
  return (
    Number(payment.projectionIndex || 0) > 0 &&
    Number(payment.projectionIndex) === Number(projectionIndex)
  );
}

/** Amount of a payment attributed to one cicilan (multi-cover uses breakdown). */
function paymentContributionToProjection(payment, projection, projectionIndex) {
  if (!paymentMatchesProjection(payment, projection, projectionIndex)) return 0;

  const breakdown = Array.isArray(payment.coveredProjectionBreakdown)
    ? payment.coveredProjectionBreakdown
    : [];
  if (breakdown.length > 0) {
    const row = breakdown.find(
      (item) =>
        isSameObjectId(item?.projectionId, projection._id) ||
        (Number(item?.projectionIndex || 0) > 0 &&
          Number(item.projectionIndex) === Number(projectionIndex)),
    );
    return roundMoney(row?.amount || 0);
  }

  const coveredIds = Array.isArray(payment.coveredProjectionIds)
    ? payment.coveredProjectionIds
    : [];
  if (coveredIds.length > 1) return 0;

  return roundMoney(payment.amount || 0);
}

function getAgedReceivableBucket(daysOverdue) {
  if (daysOverdue <= 0) return AGED_RECEIVABLE_BUCKETS[0];
  return (
    AGED_RECEIVABLE_BUCKETS.find((bucket) => {
      if (bucket.key === "notYetDue") return false;
      const afterStart = bucket.from === null || daysOverdue >= bucket.from;
      const beforeEnd = bucket.to === null || daysOverdue <= bucket.to;
      return afterStart && beforeEnd;
    }) || AGED_RECEIVABLE_BUCKETS[AGED_RECEIVABLE_BUCKETS.length - 1]
  );
}

function createEmptyAgedBucket() {
  return {
    amount: 0,
    invoiceCount: 0,
    projectionCount: 0,
    details: [],
    invoiceNumbers: new Set(),
  };
}

function createAgedBucketMap() {
  return AGED_RECEIVABLE_BUCKETS.reduce((acc, bucket) => {
    acc[bucket.key] = createEmptyAgedBucket();
    return acc;
  }, {});
}

function serializeAgedBucket(bucket) {
  return {
    amount: roundMoney(bucket.amount),
    invoiceCount: bucket.invoiceNumbers.size,
    projectionCount: bucket.projectionCount,
    details: bucket.details,
  };
}

function createAgedReceivableCustomerRow(invoice) {
  const customerSnapshot = invoice.customerSnapshot || {};
  const memberId = toIdString(invoice.memberId);
  return {
    customerId: memberId || customerSnapshot.uuid || customerSnapshot.name || "unknown",
    customerName: customerSnapshot.name || "-",
    customerCode: customerSnapshot.uuid || "",
    customerEmail: customerSnapshot.email || "",
    customerPhone: customerSnapshot.phone || "",
    buckets: createAgedBucketMap(),
    invoiceNumbers: new Set(),
    projectionCount: 0,
    totalUnpaid: 0,
    paymentReputation: { earlyCount: 0, onTimeCount: 0, lateCount: 0, totalPaid: 0 },
  };
}

function addAgedReceivableDetail(row, bucketKey, detail) {
  const bucket = row.buckets[bucketKey];
  bucket.amount += detail.remainingAmount;
  bucket.projectionCount += 1;
  bucket.invoiceNumbers.add(detail.invoiceNumber);
  bucket.details.push(detail);

  row.invoiceNumbers.add(detail.invoiceNumber);
  row.projectionCount += 1;
  row.totalUnpaid += detail.remainingAmount;
}

function buildProjectionReceivableDetails(invoice, asOfDate) {
  const payments = invoice.payments || [];
  const paymentsUntilAsOf = payments.filter((payment) => {
    const paymentDate = new Date(payment.paymentDate);
    return !Number.isNaN(paymentDate.getTime()) && paymentDate <= asOfDate;
  });
  const projections = (invoice.projections || []).length
    ? invoice.projections
    : [
        {
          _id: `invoice-${invoice._id}`,
          description: "Invoice Due",
          estimateDate: invoice.dueDate,
          amount: invoice.total || invoice.amountDue || 0,
          synthetic: true,
        },
      ];

  return projections
    .map((projection, index) => {
      const projectionIndex = index + 1;
      const dueDate = projection.estimateDate || invoice.dueDate;
      const due = new Date(dueDate);
      const projectionAmount = roundMoney(projection.amount);
      if (Number.isNaN(due.getTime()) || projectionAmount <= 0) return null;

      const paidAmount = roundMoney(
        paymentsUntilAsOf
          .filter((payment) =>
            projection.synthetic
              ? !payment.projectionId && !payment.projectionIndex
              : paymentMatchesProjection(payment, projection, projectionIndex),
          )
          .reduce(
            (sum, payment) =>
              sum +
              (projection.synthetic
                ? roundMoney(payment.amount || 0)
                : paymentContributionToProjection(payment, projection, projectionIndex)),
            0,
          ),
      );
      const remainingAmount = roundMoney(Math.max(projectionAmount - paidAmount, 0));
      if (remainingAmount <= 0.009) return null;

      const daysOverdue = dateDiffDays(asOfDate, due);
      const bucket = getAgedReceivableBucket(daysOverdue);

      return {
        invoiceId: toIdString(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        projectionId: toIdString(projection._id),
        projectionIndex,
        projectionDescription: projection.description || `Cicilan ${projectionIndex}`,
        dueDate: formatYmd(due),
        daysOverdue,
        bucketKey: bucket.key,
        bucketLabel: bucket.label,
        amount: projectionAmount,
        paidAmount,
        remainingAmount,
        currency: invoice.currency || "IDR",
        customerName: invoice.customerSnapshot?.name || "-",
        customerCode: invoice.customerSnapshot?.uuid || "",
        status: daysOverdue > 0 ? "Overdue" : "Not Yet Due",
      };
    })
    .filter(Boolean);
}

function countUnassignedPaymentsUntilAsOf(invoice, asOfDate) {
  if (!(invoice.projections || []).length) return 0;
  return (invoice.payments || [])
    .filter((payment) => {
      if (payment.projectionId || payment.projectionIndex) return false;
      const paymentDate = new Date(payment.paymentDate);
      return !Number.isNaN(paymentDate.getTime()) && paymentDate <= asOfDate;
    })
    .reduce((sum, payment) => sum + roundMoney(payment.amount), 0);
}

function computePaymentReputation(invoice) {
  const payments = invoice.payments || [];
  const projections = invoice.projections || [];
  if (!projections.length || !payments.length) {
    return { earlyCount: 0, onTimeCount: 0, lateCount: 0, totalPaid: 0 };
  }

  let earlyCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let totalPaid = 0;

  for (const projection of projections) {
    const dueDate = new Date(projection.estimateDate);
    if (Number.isNaN(dueDate.getTime())) continue;

    const matchingPayments = payments.filter((payment) => {
      const coveredIds = Array.isArray(payment.coveredProjectionIds)
        ? payment.coveredProjectionIds
        : [];
      if (coveredIds.length > 0) {
        return coveredIds.some((id) => isSameObjectId(id, projection._id));
      }
      return payment.projectionId
        ? isSameObjectId(payment.projectionId, projection._id)
        : Number(payment.projectionIndex || 0) > 0 &&
          Number(payment.projectionIndex) ===
            (projections.indexOf(projection) + 1);
    });

    for (const payment of matchingPayments) {
      const payDate = new Date(payment.paymentDate);
      if (Number.isNaN(payDate.getTime())) continue;
      const contribution = paymentContributionToProjection(
        payment,
        projection,
        projections.indexOf(projection) + 1,
      );
      totalPaid += contribution;

      const diffDays = dateDiffDays(payDate, dueDate);
      if (diffDays < 0) earlyCount += 1;
      else if (diffDays === 0) onTimeCount += 1;
      else lateCount += 1;
    }
  }

  return { earlyCount, onTimeCount, lateCount, totalPaid: roundMoney(totalPaid) };
}

function getPaymentReputationLabel(reputation) {
  const total = reputation.earlyCount + reputation.onTimeCount + reputation.lateCount;
  if (total === 0) return "-";
  const earlyRatio = (reputation.earlyCount + reputation.onTimeCount) / total;
  if (earlyRatio >= 0.8) return "Pembayaran Cepat";
  if (earlyRatio >= 0.5) return "Tepat Waktu";
  return "Sering Terlambat";
}

async function buildAgedReceivablesPayload(options = {}) {
  const todayText = formatYmd(new Date());
  const asOfText = options.asOf || options.as_of || todayText;
  const asOfDate = endOfDay(parseDateInput(asOfText, todayText));
  const rowsByCustomer = new Map();
  let legacyUnassignedPaid = 0;

  const invoices = await Invoice.find({
    status: { $ne: "draft" },
  })
    .select("invoiceNumber memberId customerSnapshot issuedDate dueDate currency status total amountDue projections payments")
    .sort({ "customerSnapshot.name": 1, invoiceNumber: 1 })
    .lean();

  for (const invoice of invoices) {
    legacyUnassignedPaid += countUnassignedPaymentsUntilAsOf(invoice, asOfDate);
    const details = buildProjectionReceivableDetails(invoice, asOfDate);
    if (!details.length) continue;

    const rowKey =
      toIdString(invoice.memberId) ||
      invoice.customerSnapshot?.uuid ||
      invoice.customerSnapshot?.name ||
      invoice.invoiceNumber;
    if (!rowsByCustomer.has(rowKey)) {
      rowsByCustomer.set(rowKey, createAgedReceivableCustomerRow(invoice));
    }

    const row = rowsByCustomer.get(rowKey);
    for (const detail of details) {
      addAgedReceivableDetail(row, detail.bucketKey, detail);
    }
    const reputation = computePaymentReputation(invoice);
    row.paymentReputation.earlyCount += reputation.earlyCount;
    row.paymentReputation.onTimeCount += reputation.onTimeCount;
    row.paymentReputation.lateCount += reputation.lateCount;
    row.paymentReputation.totalPaid += reputation.totalPaid;
  }

  const totals = {
    totalUnpaid: 0,
    invoiceCount: 0,
    projectionCount: 0,
    buckets: createAgedBucketMap(),
    legacyUnassignedPaid: roundMoney(legacyUnassignedPaid),
  };

  const rows = Array.from(rowsByCustomer.values())
    .map((row) => {
      const buckets = {};
      for (const bucketConfig of AGED_RECEIVABLE_BUCKETS) {
        const sourceBucket = row.buckets[bucketConfig.key];
        buckets[bucketConfig.key] = serializeAgedBucket(sourceBucket);

        totals.buckets[bucketConfig.key].amount += sourceBucket.amount;
        totals.buckets[bucketConfig.key].projectionCount += sourceBucket.projectionCount;
        for (const invoiceNumber of sourceBucket.invoiceNumbers) {
          totals.buckets[bucketConfig.key].invoiceNumbers.add(invoiceNumber);
        }
      }

      totals.totalUnpaid += row.totalUnpaid;
      totals.projectionCount += row.projectionCount;

      return {
        customerId: row.customerId,
        customerName: row.customerName,
        customerCode: row.customerCode,
        customerEmail: row.customerEmail,
        customerPhone: row.customerPhone,
        buckets,
        invoiceCount: row.invoiceNumbers.size,
        projectionCount: row.projectionCount,
        totalUnpaid: roundMoney(row.totalUnpaid),
        overdueAmount: roundMoney(
          AGED_RECEIVABLE_BUCKETS
            .filter((bucket) => bucket.key !== "notYetDue")
            .reduce((sum, bucket) => sum + (row.buckets[bucket.key]?.amount || 0), 0),
        ),
        paymentReputation: {
          ...row.paymentReputation,
          totalPaid: roundMoney(row.paymentReputation.totalPaid),
          label: getPaymentReputationLabel(row.paymentReputation),
        },
      };
    })
    .sort((a, b) => {
      const delta = b.totalUnpaid - a.totalUnpaid;
      if (Math.abs(delta) > 0.01) return delta;
      return a.customerName.localeCompare(b.customerName);
    });

  const invoiceNumbers = new Set();
  for (const row of rows) {
    for (const bucketConfig of AGED_RECEIVABLE_BUCKETS) {
      for (const detail of row.buckets[bucketConfig.key].details) {
        invoiceNumbers.add(detail.invoiceNumber);
      }
    }
  }
  totals.invoiceCount = invoiceNumbers.size;

  const serializedTotals = {
    totalUnpaid: roundMoney(totals.totalUnpaid),
    invoiceCount: totals.invoiceCount,
    projectionCount: totals.projectionCount,
    legacyUnassignedPaid: totals.legacyUnassignedPaid,
    buckets: {},
  };
  for (const bucketConfig of AGED_RECEIVABLE_BUCKETS) {
    serializedTotals.buckets[bucketConfig.key] = serializeAgedBucket(
      totals.buckets[bucketConfig.key],
    );
  }

  return {
    title: "Aged Receivables",
    asOf: formatYmd(asOfDate),
    generatedAt: new Date().toISOString(),
    buckets: AGED_RECEIVABLE_BUCKETS,
    rows,
    totals: serializedTotals,
  };
}

function computeMasterReportSigned(masterName, transactionType, amount) {
  return profitLossMovement(masterName, transactionType, amount);
}

function inDateRange(date, start, end) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function decodeVendorFilter(contactFilter) {
  const raw = String(contactFilter || "");
  if (!raw.startsWith("vendor_")) return "";
  return decodeURIComponent(raw.slice("vendor_".length));
}

function getComparisonDates(startDate, endDate, comparePeriod) {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const period = String(comparePeriod || "").trim();

  if (period === "previous_year") {
    return {
      start: formatYmd(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())),
      end: formatYmd(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())),
    };
  }

  const diffMs = end.getTime() - start.getTime();
  const compareEnd = new Date(start.getTime() - 1);
  const compareStart = new Date(compareEnd.getTime() - diffMs);
  return {
    start: formatYmd(compareStart),
    end: formatYmd(compareEnd),
  };
}

function buildDatePresets() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const prevYear = currentYear - 1;
  const nextYear = currentYear + 1;
  const presets = [];

  for (const year of [nextYear, currentYear, prevYear]) {
    for (let q = 4; q >= 1; q -= 1) {
      const startMonth = (q - 1) * 3;
      const endMonth = q * 3 - 1;
      const startDate = new Date(year, startMonth, 1);
      const endDate = new Date(year, endMonth + 1, 0);
      presets.push({
        label: `Q${q} ${year}`,
        value: `q${q}_${year}`,
        start: formatYmd(startDate),
        end: formatYmd(endDate),
        group: "Quarters",
      });
    }
  }

  for (let i = 0; i < 12; i += 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    presets.push({
      label: monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      value: `month_${monthDate.getFullYear()}_${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
      start: formatYmd(monthDate),
      end: formatYmd(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)),
      group: "Months",
    });
  }

  const mondayThisWeek = new Date(now);
  mondayThisWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setDate(mondayThisWeek.getDate() - 7);
  const sundayLastWeek = new Date(sundayThisWeek);
  sundayLastWeek.setDate(sundayThisWeek.getDate() - 7);

  presets.push(
    {
      label: "This Week",
      value: "this_week",
      start: formatYmd(mondayThisWeek),
      end: formatYmd(sundayThisWeek),
      group: "Other",
    },
    {
      label: "Previous Week",
      value: "prev_week",
      start: formatYmd(mondayLastWeek),
      end: formatYmd(sundayLastWeek),
      group: "Other",
    },
    {
      label: "Last 30 Days",
      value: "last_30_days",
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
      end: formatYmd(now),
      group: "Other",
    },
    {
      label: "Last 60 Days",
      value: "last_60_days",
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59)),
      end: formatYmd(now),
      group: "Other",
    },
    {
      label: "Last 90 Days",
      value: "last_90_days",
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)),
      end: formatYmd(now),
      group: "Other",
    },
    {
      label: "Custom",
      value: "custom",
      start: "",
      end: "",
      group: "Custom",
    }
  );

  return presets;
}

async function getAvailableYears() {
  const currentYear = new Date().getFullYear();
  const rows = await AccountingTransaction.aggregate([
    {
      $group: {
        _id: { $year: "$transactionDate" },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);

  const years = rows.map((row) => row._id).filter((year) => Number.isFinite(year));
  for (const requiredYear of [currentYear - 1, currentYear, currentYear + 1]) {
    if (!years.includes(requiredYear)) years.push(requiredYear);
  }
  years.sort((a, b) => b - a);
  return years;
}

export async function loadCoaContext() {
  const masters = await CoaMaster.find({}).sort({ masterName: 1 }).lean();
  const masterMap = new Map();
  for (const master of masters) {
    masterMap.set(toIdString(master._id), { ...master, id: toIdString(master._id) });
  }

  const submenusRaw = await CoaSubmenu.find({}).sort({ submenuName: 1 }).lean();
  const submenus = [];
  const submenuMap = new Map();
  for (const submenu of submenusRaw) {
    const submenuId = toIdString(submenu._id);
    const master = masterMap.get(toIdString(submenu.masterId));
    if (!master) continue;
    const normalizedSubmenu = {
      ...submenu,
      id: submenuId,
      masterId: toIdString(submenu.masterId),
      masterName: master.masterName,
    };
    submenuMap.set(submenuId, normalizedSubmenu);
    submenus.push(normalizedSubmenu);
  }

  const accountsRaw = await CoaAccount.find({}).sort({ accountName: 1 }).lean();
  const accounts = [];
  const accountMap = new Map();
  const accountsBySubmenu = new Map();
  const accountsByMaster = new Map();

  for (const account of accountsRaw) {
    const accountId = toIdString(account._id);
    const submenu = submenuMap.get(toIdString(account.submenuId));
    if (!submenu) continue;
    const normalizedAccount = {
      ...account,
      id: accountId,
      submenuId: toIdString(account.submenuId),
      submenuName: submenu.submenuName,
      masterName: submenu.masterName,
      masterId: submenu.masterId,
    };
    accounts.push(normalizedAccount);
    accountMap.set(accountId, normalizedAccount);

    if (!accountsBySubmenu.has(normalizedAccount.submenuId)) {
      accountsBySubmenu.set(normalizedAccount.submenuId, []);
    }
    accountsBySubmenu.get(normalizedAccount.submenuId).push(normalizedAccount);

    if (!accountsByMaster.has(normalizedAccount.masterName)) {
      accountsByMaster.set(normalizedAccount.masterName, []);
    }
    accountsByMaster.get(normalizedAccount.masterName).push(normalizedAccount);
  }

  for (const groupedAccounts of accountsBySubmenu.values()) {
    groupedAccounts.sort((a, b) => {
      const codeA = String(a.accountCode || "");
      const codeB = String(b.accountCode || "");
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return a.accountName.localeCompare(b.accountName);
    });
  }

  for (const groupedAccounts of accountsByMaster.values()) {
    groupedAccounts.sort((a, b) => {
      if (a.submenuName !== b.submenuName) return a.submenuName.localeCompare(b.submenuName);
      const codeA = String(a.accountCode || "");
      const codeB = String(b.accountCode || "");
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return a.accountName.localeCompare(b.accountName);
    });
  }

  return {
    masters: masters.map((master) => ({
      ...master,
      id: toIdString(master._id),
    })),
    masterMap,
    submenus,
    submenuMap,
    accounts,
    accountMap,
    accountsBySubmenu,
    accountsByMaster,
  };
}

async function loadTransactionsContext(endDate) {
  const txns = await AccountingTransaction.find({
    transactionDate: { $lte: endDate },
  })
    .select(
      "_id transactionDate createdAt description transactionType amount categoryId categoryType accountId customerId vendorId notes isSplit invoiceNumber invoicePaymentId invoiceProjectionId invoiceProjectionIndex invoiceProjectionDescription invoiceProjectionDueDate"
    )
    .lean();

  const transactionIds = txns.map((txn) => txn._id);
  const splits = transactionIds.length
    ? await TransactionSplit.find({ transactionId: { $in: transactionIds } })
      .select("_id transactionId amount categoryId categoryType description")
      .lean()
    : [];

  const splitsByTransactionId = new Map();
  for (const split of splits) {
    const txnId = toIdString(split.transactionId);
    if (!splitsByTransactionId.has(txnId)) {
      splitsByTransactionId.set(txnId, []);
    }
    splitsByTransactionId.get(txnId).push(split);
  }

  return {
    transactions: txns,
    splits,
    splitsByTransactionId,
  };
}

function buildAccountsHierarchy(coaContext) {
  const hierarchy = [{ id: "all", name: "All Accounts", type: "all" }];
  const sortedMasters = [...coaContext.masters].sort((a, b) => a.masterName.localeCompare(b.masterName));

  for (const master of sortedMasters) {
    hierarchy.push({
      id: `master_${master.id}`,
      name: master.masterName,
      type: "master",
      master_id: master.id,
    });

    const submenus = coaContext.submenus
      .filter((submenu) => submenu.masterId === master.id)
      .sort((a, b) => a.submenuName.localeCompare(b.submenuName));

    for (const submenu of submenus) {
      hierarchy.push({
        id: `submenu_${submenu.id}`,
        name: `  └ ${submenu.submenuName}`,
        type: "submenu",
        submenu_id: submenu.id,
        master_name: master.masterName,
      });

      const accounts = (coaContext.accountsBySubmenu.get(submenu.id) || []).slice();
      for (const account of accounts) {
        hierarchy.push({
          id: `account_${account.id}`,
          name: `      └ ${account.accountName}`,
          type: "account",
          account_id: account.id,
          submenu_name: submenu.submenuName,
          master_name: master.masterName,
        });
      }
    }
  }

  return hierarchy;
}

function buildContactList(members, vendors) {
  const contacts = [{ id: "all", name: "All Contacts" }];
  for (const member of members) {
    contacts.push({
      id: `customer_${toIdString(member._id)}`,
      name: member.name || "-",
    });
  }
  for (const vendor of vendors) {
    contacts.push({
      id: `vendor_${encodeURIComponent(vendor)}`,
      name: `${vendor} (Vendor)`,
    });
  }
  return contacts;
}

function transactionMatchesContact(transaction, contactFilter) {
  const filter = String(contactFilter || "all");
  if (!filter || filter === "all") return true;

  if (filter.startsWith("customer_")) {
    const customerId = filter.slice("customer_".length);
    return toIdString(transaction.customerId) === customerId;
  }

  if (filter.startsWith("vendor_")) {
    const vendorName = decodeVendorFilter(filter).trim().toLowerCase();
    return String(transaction.vendorId || "").trim().toLowerCase() === vendorName;
  }

  return false;
}

function buildAccountTotalsByMaster({
  masterName,
  startDate,
  endDate,
  coaContext,
  transactionsContext,
  includeSubmenus = null,
  excludeSubmenus = null,
  skipZero = false,
}) {
  const includeSet = includeSubmenus ? new Set(includeSubmenus) : null;
  const excludeSet = excludeSubmenus ? new Set(excludeSubmenus) : null;

  const accounts = (coaContext.accountsByMaster.get(masterName) || []).filter((account) => {
    if (includeSet && !includeSet.has(account.submenuName)) return false;
    if (excludeSet && excludeSet.has(account.submenuName)) return false;
    return true;
  });

  const validAccountIds = new Set(accounts.map((account) => account.id));
  const nonSplitAccountTotals = new Map();
  const splitTotals = new Map();
  const directSubmenuTotals = new Map();
  const directMasterTotals = new Map();

  const includeSubmenu = (submenuName) => {
    if (includeSet && !includeSet.has(submenuName)) return false;
    if (excludeSet && excludeSet.has(submenuName)) return false;
    return true;
  };

  const addCategoryMovement = (categoryId, categoryType, transaction, amount) => {
    const id = toIdString(categoryId);
    const signed = computeMasterReportSigned(masterName, transaction.transactionType, amount);

    if (categoryType === "account") {
      if (!validAccountIds.has(id)) return;
      const target = transaction.isSplit ? splitTotals : nonSplitAccountTotals;
      target.set(id, (target.get(id) || 0) + signed);
      return;
    }

    if (categoryType === "submenu") {
      const submenu = coaContext.submenuMap.get(id);
      if (!submenu || submenu.masterName !== masterName || !includeSubmenu(submenu.submenuName)) return;
      directSubmenuTotals.set(id, (directSubmenuTotals.get(id) || 0) + signed);
      return;
    }

    if (categoryType === "master") {
      const master = coaContext.masterMap.get(id);
      if (!master || master.masterName !== masterName || includeSet) return;
      directMasterTotals.set(id, (directMasterTotals.get(id) || 0) + signed);
    }
  };

  for (const transaction of transactionsContext.transactions) {
    if (!inDateRange(transaction.transactionDate, startDate, endDate)) continue;
    const txnId = toIdString(transaction._id);

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(txnId) || [];
      for (const split of splits) {
        addCategoryMovement(split.categoryId, split.categoryType || "account", transaction, split.amount);
      }
      continue;
    }

    addCategoryMovement(transaction.categoryId, transaction.categoryType, transaction, transaction.amount);
  }

  const groupedMap = new Map();
  const flatAccounts = [];
  let total = 0;

  const appendLine = ({
    id,
    accountCode = "",
    accountName,
    currency = "Rp",
    submenuName = "",
    categoryId,
    categoryType,
    rawTotal,
  }) => {
    const displayTotal = roundReportMoney(rawTotal);
    if (skipZero && Math.abs(displayTotal) < 0.01) return;

    const groupName = submenuName || `${masterName} (Direct Posting)`;
    if (!groupedMap.has(groupName)) {
      groupedMap.set(groupName, {
        submenu_name: groupName,
        submenu_id: categoryType === "submenu" ? toIdString(categoryId) : "",
        accounts: [],
        subtotal: 0,
      });
    }

    const row = {
      id,
      account_code: accountCode,
      account_name: accountName,
      currency,
      submenu_name: submenuName,
      category_id: toIdString(categoryId),
      category_type: categoryType,
      total: displayTotal,
      raw_total: displayTotal,
    };
    groupedMap.get(groupName).accounts.push(row);
    groupedMap.get(groupName).subtotal = roundReportMoney(groupedMap.get(groupName).subtotal + displayTotal);
    flatAccounts.push(row);
    total = roundReportMoney(total + displayTotal);
  };

  for (const account of accounts) {
    const rawTotal = (nonSplitAccountTotals.get(account.id) || 0)
      + (splitTotals.get(account.id) || 0);
    appendLine({
      id: account.id,
      accountCode: account.accountCode || "",
      accountName: account.accountName,
      currency: account.currency || "Rp",
      submenuName: account.submenuName,
      categoryId: account.id,
      categoryType: "account",
      rawTotal,
    });
  }

  for (const [submenuId, rawTotal] of directSubmenuTotals) {
    const submenu = coaContext.submenuMap.get(submenuId);
    if (!submenu) continue;
    appendLine({
      id: `direct-submenu-${submenuId}`,
      accountName: `${submenu.submenuName} (Direct Posting)`,
      submenuName: submenu.submenuName,
      categoryId: submenuId,
      categoryType: "submenu",
      rawTotal,
    });
  }

  for (const [masterId, rawTotal] of directMasterTotals) {
    appendLine({
      id: `direct-master-${masterId}`,
      accountName: `${masterName} (Direct Posting)`,
      categoryId: masterId,
      categoryType: "master",
      rawTotal,
    });
  }

  return {
    accounts: flatAccounts,
    grouped: Array.from(groupedMap.values()),
    total: roundReportMoney(total),
  };
}

export function buildProfitLossData(startDate, endDate, coaContext, transactionsContext) {
  const income = buildAccountTotalsByMaster({
    masterName: "Income",
    startDate,
    endDate,
    coaContext,
    transactionsContext,
  });

  const cogs = buildAccountTotalsByMaster({
    masterName: "Expenses",
    startDate,
    endDate,
    coaContext,
    transactionsContext,
    includeSubmenus: [...COGS_SUBMENUS],
  });

  const operatingExpenses = buildAccountTotalsByMaster({
    masterName: "Expenses",
    startDate,
    endDate,
    coaContext,
    transactionsContext,
    excludeSubmenus: [...COGS_SUBMENUS],
    skipZero: true,
  });

  const totalIncome = income.total;
  const totalCOGS = cogs.total;
  const grossProfit = roundReportMoney(totalIncome - totalCOGS);
  const totalOperatingExpenses = operatingExpenses.total;
  const netProfit = roundReportMoney(grossProfit - totalOperatingExpenses);
  const grossProfitPercentage = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
  const netProfitPercentage = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  return {
    income,
    cogs,
    gross_profit: grossProfit,
    gross_profit_percentage: grossProfitPercentage,
    operating_expenses: operatingExpenses,
    net_profit: netProfit,
    net_profit_percentage: netProfitPercentage,
    total_income: totalIncome,
    total_cogs: totalCOGS,
    total_operating_expenses: totalOperatingExpenses,
  };
}

function buildAssetCategoryName(submenuName) {
  if (CASH_ASSET_SUBMENUS.has(submenuName)) return "Cash and Bank";
  if (
    [
      "Long-term Assets",
      "Other Long-Term Asset",
      "Property, Plant, Equipment",
      "Depreciation and Amortization",
      "Property and Equipment",
      "Fixed Assets",
      "Accumulated Depreciation",
    ].includes(submenuName)
  ) {
    return "Long-term Assets";
  }
  return "Other Current Assets";
}

function buildLiabilityCategoryName(submenuName) {
  if (LIABILITY_LONG_TERM_SUBMENUS.has(submenuName)) return "Long-term Liabilities";
  return "Current Liabilities";
}

function calculateAccountCategoryBalance({
  account,
  asOfDate,
  transactionsContext,
  coaContext,
  useAccountFlowForCash = false,
}) {
  let balance = 0;

  for (const transaction of transactionsContext.transactions) {
    const txnDate = new Date(transaction.transactionDate);
    if (Number.isNaN(txnDate.getTime()) || txnDate > asOfDate) continue;

    if (useAccountFlowForCash && toIdString(transaction.accountId) === account.id) {
      balance += cashFlowMovement(transaction.transactionType, transaction.amount);
    }

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(toIdString(transaction._id)) || [];
      for (const split of splits) {
        if (split.categoryType !== "account") continue;
        if (toIdString(split.categoryId) !== account.id) continue;
        balance += categoryBalanceMovement(account.masterName, transaction.transactionType, split.amount);
      }
      continue;
    }

    if (transaction.categoryType === "account" && toIdString(transaction.categoryId) === account.id) {
      balance += categoryBalanceMovement(account.masterName, transaction.transactionType, transaction.amount);
    }
  }

  return roundReportMoney(balance);
}

function calculateMasterProfit({
  masterName,
  startDate = null,
  endDate,
  transactionsContext,
  coaContext,
}) {
  let total = 0;

  for (const transaction of transactionsContext.transactions) {
    const txnDate = new Date(transaction.transactionDate);
    if (Number.isNaN(txnDate.getTime())) continue;
    if (txnDate > endDate) continue;
    if (startDate && txnDate < startDate) continue;

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(toIdString(transaction._id)) || [];
      for (const split of splits) {
        if (split.categoryType === "account") {
          const account = coaContext.accountMap.get(toIdString(split.categoryId));
          if (!account || account.masterName !== masterName) continue;
        } else if (split.categoryType === "submenu") {
          const submenu = coaContext.submenuMap.get(toIdString(split.categoryId));
          if (!submenu || submenu.masterName !== masterName) continue;
        } else if (split.categoryType === "master") {
          const categoryMaster = coaContext.masterMap.get(toIdString(split.categoryId));
          if (!categoryMaster || categoryMaster.masterName !== masterName) continue;
        } else {
          continue;
        }
        total += computeMasterReportSigned(masterName, transaction.transactionType, split.amount);
      }
      continue;
    }

    if (transaction.categoryType === "account") {
      const account = coaContext.accountMap.get(toIdString(transaction.categoryId));
      if (!account || account.masterName !== masterName) continue;
      total += computeMasterReportSigned(masterName, transaction.transactionType, transaction.amount);
      continue;
    }

    if (transaction.categoryType === "submenu") {
      const submenu = coaContext.submenuMap.get(toIdString(transaction.categoryId));
      if (!submenu || submenu.masterName !== masterName) continue;
      total += computeMasterReportSigned(masterName, transaction.transactionType, transaction.amount);
      continue;
    }

    if (transaction.categoryType === "master") {
      const categoryMaster = coaContext.masterMap.get(toIdString(transaction.categoryId));
      if (!categoryMaster || categoryMaster.masterName !== masterName) continue;
      total += computeMasterReportSigned(masterName, transaction.transactionType, transaction.amount);
    }
  }

  return roundReportMoney(total);
}

function calculateDirectBalanceSheetPostings(asOfDate, coaContext, transactionsContext) {
  const directRows = new Map();

  for (const transaction of transactionsContext.transactions) {
    const transactionDate = new Date(transaction.transactionDate);
    if (Number.isNaN(transactionDate.getTime()) || transactionDate > asOfDate) continue;
    const postings = transaction.isSplit
      ? transactionsContext.splitsByTransactionId.get(toIdString(transaction._id)) || []
      : [transaction];

    for (const posting of postings) {
      if (!["master", "submenu"].includes(posting.categoryType)) continue;
      const categoryId = toIdString(posting.categoryId);
      const master = posting.categoryType === "master"
        ? coaContext.masterMap.get(categoryId)
        : null;
      const submenu = posting.categoryType === "submenu"
        ? coaContext.submenuMap.get(categoryId)
        : null;
      const masterName = master?.masterName || submenu?.masterName;
      if (!["Assets", "Liabilities", "Equity"].includes(masterName)) continue;

      const rawBalance = categoryBalanceMovement(
        masterName,
        transaction.transactionType,
        posting.amount ?? transaction.amount,
      );
      const balance = ["Liabilities", "Equity"].includes(masterName)
        ? -rawBalance
        : rawBalance;
      const key = `${posting.categoryType}:${categoryId}`;
      const row = directRows.get(key) || {
        id: `direct-${posting.categoryType}-${categoryId}`,
        account_code: "",
        account_name: `${submenu?.submenuName || masterName} (Direct Posting)`,
        currency: "Rp",
        submenu_name: submenu?.submenuName || masterName,
        category_id: categoryId,
        category_type: posting.categoryType,
        is_direct_posting: true,
        master_name: masterName,
        balance: 0,
      };
      row.balance = roundReportMoney(row.balance + balance);
      directRows.set(key, row);
    }
  }

  return [...directRows.values()];
}

export function buildBalanceSheetData(asOfDate, coaContext, transactionsContext, reportStartDate = null) {
  const assetCategories = {
    "Cash and Bank": { accounts: [], total: 0 },
    "Other Current Assets": { accounts: [], total: 0 },
    "Long-term Assets": { accounts: [], total: 0 },
    "Unallocated Assets": { accounts: [], total: 0 },
  };
  const liabilityCategories = {
    "Current Liabilities": { accounts: [], total: 0 },
    "Long-term Liabilities": { accounts: [], total: 0 },
    "Unallocated Liabilities": { accounts: [], total: 0 },
  };

  let totalAssets = 0;
  let totalLiabilities = 0;

  const assetAccounts = coaContext.accountsByMaster.get("Assets") || [];
  for (const account of assetAccounts) {
    const useCashFlow = CASH_ASSET_SUBMENUS.has(account.submenuName);
    const rawBalance = calculateAccountCategoryBalance({
      account,
      asOfDate,
      transactionsContext,
      coaContext,
      useAccountFlowForCash: useCashFlow,
    });
    const categoryName = buildAssetCategoryName(account.submenuName);
    assetCategories[categoryName].accounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      category_id: account.id,
      category_type: "account",
      is_cash_flow: useCashFlow,
      balance: rawBalance,
    });
    assetCategories[categoryName].total = roundReportMoney(assetCategories[categoryName].total + rawBalance);
    totalAssets = roundReportMoney(totalAssets + rawBalance);
  }

  const liabilityAccounts = coaContext.accountsByMaster.get("Liabilities") || [];
  for (const account of liabilityAccounts) {
    const rawBalance = calculateAccountCategoryBalance({
      account,
      asOfDate,
      transactionsContext,
      coaContext,
      useAccountFlowForCash: false,
    });
    const displayBalance = roundReportMoney(-rawBalance);
    const categoryName = buildLiabilityCategoryName(account.submenuName);
    liabilityCategories[categoryName].accounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      category_id: account.id,
      category_type: "account",
      balance: displayBalance,
    });
    liabilityCategories[categoryName].total = roundReportMoney(liabilityCategories[categoryName].total + displayBalance);
    totalLiabilities = roundReportMoney(totalLiabilities + displayBalance);
  }

  const equityAccounts = coaContext.accountsByMaster.get("Equity") || [];
  const otherEquityAccounts = [];
  let otherEquityTotal = 0;
  for (const account of equityAccounts) {
    const rawBalance = calculateAccountCategoryBalance({
      account,
      asOfDate,
      transactionsContext,
      coaContext,
      useAccountFlowForCash: false,
    });
    const displayBalance = roundReportMoney(-rawBalance);
    otherEquityAccounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      category_id: account.id,
      category_type: "account",
      balance: displayBalance,
    });
    otherEquityTotal = roundReportMoney(otherEquityTotal + displayBalance);
  }

  const directRows = calculateDirectBalanceSheetPostings(asOfDate, coaContext, transactionsContext);
  for (const row of directRows) {
    const masterName = row.master_name;
    if (row.category_type === "submenu") {
      if (masterName === "Assets") {
        const categoryName = buildAssetCategoryName(row.submenu_name);
        assetCategories[categoryName].accounts.push(row);
        assetCategories[categoryName].total = roundReportMoney(assetCategories[categoryName].total + row.balance);
      } else if (masterName === "Liabilities") {
        const categoryName = buildLiabilityCategoryName(row.submenu_name);
        liabilityCategories[categoryName].accounts.push(row);
        liabilityCategories[categoryName].total = roundReportMoney(liabilityCategories[categoryName].total + row.balance);
      } else {
        otherEquityAccounts.push(row);
        otherEquityTotal = roundReportMoney(otherEquityTotal + row.balance);
      }
      continue;
    }

    if (masterName === "Assets") {
      assetCategories["Unallocated Assets"].accounts.push(row);
      assetCategories["Unallocated Assets"].total = roundReportMoney(assetCategories["Unallocated Assets"].total + row.balance);
    } else if (masterName === "Liabilities") {
      liabilityCategories["Unallocated Liabilities"].accounts.push(row);
      liabilityCategories["Unallocated Liabilities"].total = roundReportMoney(liabilityCategories["Unallocated Liabilities"].total + row.balance);
    } else {
      otherEquityAccounts.push(row);
      otherEquityTotal = roundReportMoney(otherEquityTotal + row.balance);
    }
  }

  totalAssets = roundReportMoney(Object.values(assetCategories).reduce((sum, category) => sum + category.total, 0));
  totalLiabilities = roundReportMoney(Object.values(liabilityCategories).reduce((sum, category) => sum + category.total, 0));

  const currentYearStart = new Date(asOfDate.getFullYear(), 0, 1);
  const totalIncomeAllTime = calculateMasterProfit({
    masterName: "Income",
    endDate: asOfDate,
    transactionsContext,
    coaContext,
  });
  const totalExpenseAllTime = calculateMasterProfit({
    masterName: "Expenses",
    endDate: asOfDate,
    transactionsContext,
    coaContext,
  });
  const retainedEarnings = roundReportMoney(totalIncomeAllTime - totalExpenseAllTime);

  const totalIncomeCurrentYear = calculateMasterProfit({
    masterName: "Income",
    startDate: currentYearStart,
    endDate: asOfDate,
    transactionsContext,
    coaContext,
  });
  const totalExpenseCurrentYear = calculateMasterProfit({
    masterName: "Expenses",
    startDate: currentYearStart,
    endDate: asOfDate,
    transactionsContext,
    coaContext,
  });
  const currentYearProfit = roundReportMoney(totalIncomeCurrentYear - totalExpenseCurrentYear);
  const priorYearsProfit = roundReportMoney(retainedEarnings - currentYearProfit);
  const firstTransactionDate = reportStartDate || transactionsContext.transactions.reduce((earliest, transaction) => {
    const transactionDate = new Date(transaction.transactionDate);
    if (Number.isNaN(transactionDate.getTime()) || transactionDate > asOfDate) return earliest;
    return !earliest || transactionDate < earliest ? transactionDate : earliest;
  }, null);
  const firstReportDate = firstTransactionDate
    ? formatYmd(firstTransactionDate)
    : formatYmd(new Date(asOfDate.getFullYear(), 0, 1));

  const equityCategories = {
    "Other Equity": {
      accounts: otherEquityAccounts,
      total: otherEquityTotal,
    },
    "Retained Earnings": {
      accounts: [
        {
          id: "prior_years",
          account_name: "Profit for all prior years",
          balance: priorYearsProfit,
          is_calculated: true,
          link: `/reports/profit-loss?start_date=${firstReportDate}&end_date=${formatYmd(new Date(asOfDate.getFullYear() - 1, 11, 31))}`,
        },
        {
          id: "current_period",
          account_name: `Profit between ${currentYearStart.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })} and ${asOfDate.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })}`,
          balance: currentYearProfit,
          is_calculated: true,
          link: `/reports/profit-loss?start_date=${formatYmd(currentYearStart)}&end_date=${formatYmd(asOfDate)}`,
        },
      ],
      total: retainedEarnings,
    },
  };

  const totalEquity = roundReportMoney(otherEquityTotal + retainedEarnings);
  const totalLiabilitiesAndEquity = roundReportMoney(totalLiabilities + totalEquity);
  const balanceDifference = roundReportMoney(totalAssets - totalLiabilitiesAndEquity);

  return {
    assets: {
      categories: assetCategories,
      total: totalAssets,
    },
    liabilities: {
      categories: liabilityCategories,
      total: totalLiabilities,
    },
    equity: {
      categories: equityCategories,
      total: totalEquity,
      retained_earnings: retainedEarnings,
    },
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    cash_and_bank: assetCategories["Cash and Bank"].total,
    to_be_received: assetCategories["Other Current Assets"].total,
    to_be_paid_out: liabilityCategories["Current Liabilities"].total,
    net_worth: roundReportMoney(totalAssets - totalLiabilities),
    total_liabilities_equity: totalLiabilitiesAndEquity,
    balance_difference: balanceDifference,
    is_balanced: Math.abs(balanceDifference) < 0.01,
  };
}

function resolveFilteredAccounts(accountFilter, coaContext) {
  const filter = String(accountFilter || "all");
  if (filter === "all") return coaContext.accounts.slice();

  if (filter.startsWith("account_")) {
    const accountId = filter.slice("account_".length);
    const account = coaContext.accountMap.get(accountId);
    return account ? [account] : [];
  }

  if (filter.startsWith("submenu_")) {
    const submenuId = filter.slice("submenu_".length);
    return (coaContext.accountsBySubmenu.get(submenuId) || []).slice();
  }

  if (filter.startsWith("master_")) {
    const masterId = filter.slice("master_".length);
    const master = coaContext.masterMap.get(masterId);
    if (!master) return [];
    return (coaContext.accountsByMaster.get(master.masterName) || []).slice();
  }

  return [];
}

export function buildAccountTransactionsData({
  startDate,
  endDate,
  accountFilter,
  contactFilter,
  coaContext,
  transactionsContext,
  memberNameMap,
}) {
  const filteredAccounts = resolveFilteredAccounts(accountFilter, coaContext);
  const accountById = new Map(filteredAccounts.map((account) => [account.id, account]));
  const ledgerMap = new Map();

  const createLedger = (account) => ({
      account_id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      master_name: account.masterName,
      starting_balance: 0,
      transactions: [],
      total_debit: 0,
      total_credit: 0,
      ending_balance: 0,
    });
  const getLedger = (account) => {
    if (!ledgerMap.has(account.id)) ledgerMap.set(account.id, createLedger(account));
    return ledgerMap.get(account.id);
  };
  const splitDebitCredit = (signed) => ({
    debit: signed > 0 ? signed : 0,
    credit: signed < 0 ? -signed : 0,
    signed,
  });

  const getParentCategoryAccount = (categoryId, categoryType) => {
    const id = toIdString(categoryId);
    const filter = String(accountFilter || "all");
    if (filter !== "all" && !filter.startsWith("master_") && !filter.startsWith("submenu_")) return null;

    let masterName = "";
    let submenuName = "";
    if (categoryType === "submenu") {
      const submenu = coaContext.submenuMap.get(id);
      if (!submenu) return null;
      masterName = submenu.masterName;
      submenuName = submenu.submenuName;
      if (filter.startsWith("submenu_") && filter !== `submenu_${id}`) return null;
      if (filter.startsWith("master_") && submenu.masterId !== filter.slice("master_".length)) return null;
    } else if (categoryType === "master") {
      const master = coaContext.masterMap.get(id);
      if (!master) return null;
      masterName = master.masterName;
      if (filter.startsWith("master_") && filter !== `master_${id}`) return null;
      if (filter.startsWith("submenu_")) return null;
    } else {
      return null;
    }

    return {
      id: `direct-${categoryType}-${id}`,
      accountCode: "",
      accountName: `${submenuName || masterName} (Direct Posting)`,
      currency: "Rp",
      submenuName: submenuName || masterName,
      masterName,
    };
  };

  const addContribution = (account, transaction, signedAmount) => {
    const ledger = getLedger(account);
    const txnDate = new Date(transaction.transactionDate);
    if (Number.isNaN(txnDate.getTime()) || txnDate > endDate) return;
    const debitCredit = splitDebitCredit(signedAmount);

    if (txnDate < startDate) {
      ledger.starting_balance = roundReportMoney(ledger.starting_balance + debitCredit.signed);
      return;
    }

    const contactName = transaction.customerId
      ? (memberNameMap.get(toIdString(transaction.customerId)) || "")
      : (transaction.vendorId || "");
    ledger.transactions.push({
      transaction_id: toIdString(transaction._id),
      date: formatYmd(txnDate),
      date_obj: txnDate,
      created_at: transaction.createdAt ? new Date(transaction.createdAt) : txnDate,
      account_name: account.accountName,
      description: transaction.description || "",
      notes: transaction.notes || "",
      contact_name: contactName || "",
      debit: roundReportMoney(debitCredit.debit),
      credit: roundReportMoney(debitCredit.credit),
    });
  };

  for (const transaction of transactionsContext.transactions) {
    if (!transactionMatchesContact(transaction, contactFilter)) continue;

    const txnId = toIdString(transaction._id);
    const cashAccount = accountById.get(toIdString(transaction.accountId));
    if (cashAccount) {
      addContribution(cashAccount, transaction, cashFlowMovement(transaction.transactionType, transaction.amount));
    }

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(txnId) || [];
      for (const split of splits) {
        const categoryType = split.categoryType || "account";
        const account = categoryType === "account"
          ? accountById.get(toIdString(split.categoryId))
          : getParentCategoryAccount(split.categoryId, categoryType);
        if (!account) continue;
        addContribution(
          account,
          transaction,
          categoryBalanceMovement(account.masterName, transaction.transactionType, split.amount),
        );
      }
    } else if (transaction.categoryType === "account") {
      const account = accountById.get(toIdString(transaction.categoryId));
      if (account) {
        addContribution(
          account,
          transaction,
          categoryBalanceMovement(account.masterName, transaction.transactionType, transaction.amount),
        );
      }
    } else if (["submenu", "master"].includes(transaction.categoryType)) {
      const account = getParentCategoryAccount(transaction.categoryId, transaction.categoryType);
      if (account) {
        addContribution(
          account,
          transaction,
          categoryBalanceMovement(account.masterName, transaction.transactionType, transaction.amount),
        );
      }
    }
  }

  const result = [];
  for (const ledger of ledgerMap.values()) {
    const running = {
      balance: ledger.starting_balance,
      totalDebit: 0,
      totalCredit: 0,
    };

    ledger.transactions.sort((a, b) => {
      const dateDelta = a.date_obj.getTime() - b.date_obj.getTime();
      if (dateDelta !== 0) return dateDelta;
      const createdDelta = a.created_at.getTime() - b.created_at.getTime();
      if (createdDelta !== 0) return createdDelta;
      return String(a.transaction_id).localeCompare(String(b.transaction_id));
    });

    for (const row of ledger.transactions) {
      running.totalDebit += row.debit;
      running.totalCredit += row.credit;
      running.balance += row.debit - row.credit;
      row.balance = running.balance;
      delete row.date_obj;
      delete row.created_at;
    }

    ledger.total_debit = running.totalDebit;
    ledger.total_credit = running.totalCredit;
    ledger.starting_balance = roundReportMoney(ledger.starting_balance);
    ledger.total_debit = roundReportMoney(running.totalDebit);
    ledger.total_credit = roundReportMoney(running.totalCredit);
    ledger.ending_balance = roundReportMoney(running.balance);

    if (String(accountFilter || "all") === "all" && ledger.transactions.length === 0 && Math.abs(ledger.starting_balance) < 0.01) {
      continue;
    }

    result.push(ledger);
  }

  result.sort((a, b) => {
    if (a.master_name !== b.master_name) return a.master_name.localeCompare(b.master_name);
    if (a.submenu_name !== b.submenu_name) return a.submenu_name.localeCompare(b.submenu_name);
    return a.account_name.localeCompare(b.account_name);
  });

  return result;
}

function serializeProfitLossPayload(payload) {
  return {
    title: "Profit & Loss",
    year: payload.year,
    startDate: payload.startDate,
    endDate: payload.endDate,
    compareEnabled: payload.compareEnabled,
    comparePeriod: payload.comparePeriod,
    compareStartDate: payload.compareStartDate,
    compareEndDate: payload.compareEndDate,
    comparisonDates: payload.comparisonDates || null,
    availableYears: payload.availableYears,
    reportData: payload.reportData,
    comparisonData: payload.comparisonData || null,
    viewMode: payload.viewMode,
  };
}

async function buildProfitLossPayload(options = {}) {
  const now = new Date();
  const period = resolveProfitLossPeriod(options, now);
  const { startDate, endDate } = period;
  const compareEnabled = normalizeBooleanFlag(options.compare_enabled ?? options.compareEnabled, false);
const comparePeriod = options.compare_period || options.comparePeriod || "custom";
  const compareStartDate = options.compare_start_date || options.compareStartDate || "";
  const compareEndDate = options.compare_end_date || options.compareEndDate || "";
  const viewMode = options.view_mode || options.viewMode || "summary";

  let comparisonDates = null;
  let comparisonRange = null;
  if (compareEnabled) {
    if (comparePeriod === "custom") {
      if (!compareStartDate || !compareEndDate) {
        throw new RangeError("Comparison start and end dates are both required.");
      }
      comparisonRange = resolveProfitLossPeriod({
        start_date: compareStartDate,
        end_date: compareEndDate,
      }, now);
    } else {
      const dates = getComparisonDates(startDate, endDate, comparePeriod);
      comparisonRange = resolveProfitLossPeriod({
        start_date: dates.start,
        end_date: dates.end,
      }, now);
    }
    comparisonDates = {
      start: comparisonRange.startDateText,
      end: comparisonRange.endDateText,
    };
  }

  const availableYears = await getAvailableYears();
  const coaContext = await loadCoaContext();
  const transactionsContext = await loadTransactionsContext(maxReportDate(endDate, comparisonRange?.endDate));
  const reportData = buildProfitLossData(startDate, endDate, coaContext, transactionsContext);

  let comparisonData = null;
  if (comparisonRange) {
    comparisonData = buildProfitLossData(
      comparisonRange.startDate,
      comparisonRange.endDate,
      coaContext,
      transactionsContext,
    );
  }

  return serializeProfitLossPayload({
    year: period.year,
    startDate: period.startDateText,
    endDate: period.endDateText,
    compareEnabled,
    comparePeriod,
    compareStartDate,
    compareEndDate,
    comparisonDates,
    availableYears,
    reportData,
    comparisonData,
    viewMode,
  });
}

async function buildAccountTransactionsPayload(options = {}) {
  const now = new Date();
  const yearDefault = now.getFullYear();
  const period = resolveProfitLossPeriod({
    year: options.year ?? yearDefault,
    ...options,
  }, now);
  const { startDate, endDate } = period;
  const accountFilter = options.account_filter || options.accountFilter || "all";
  const contactFilter = options.contact_filter || options.contactFilter || "all";
  const datePreset = options.date_preset || options.datePreset || "custom";

  const coaContext = await loadCoaContext();
  const transactionsContext = await loadTransactionsContext(endDate);
  const members = await Member.find({}).select("_id name").sort({ name: 1 }).lean();
  const memberNameMap = new Map(members.map((member) => [toIdString(member._id), member.name || ""]));
  const vendors = await AccountingTransaction.distinct("vendorId", { vendorId: { $nin: [null, ""] } });
  const normalizedVendors = vendors
    .map((vendor) => String(vendor || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const reportData = buildAccountTransactionsData({
    startDate,
    endDate,
    accountFilter,
    contactFilter,
    coaContext,
    transactionsContext,
    memberNameMap,
  });

  return {
    title: "Account Transactions",
    year: period.year,
    startDate: period.startDateText,
    endDate: period.endDateText,
    accountFilter,
    contactFilter,
    datePreset,
    reportData,
    accountsHierarchy: buildAccountsHierarchy(coaContext),
    availableYears: await getAvailableYears(),
    dateRangePresets: buildDatePresets(),
    contacts: buildContactList(members, normalizedVendors),
  };
}

async function buildBalanceSheetPayload(options = {}) {
  const now = new Date();
  const period = resolveBalanceSheetAsOfDate(options, now);
  const { asOfDate } = period;
  const viewMode = options.view_mode || options.viewMode || "summary";

  const coaContext = await loadCoaContext();
  const transactionsContext = await loadTransactionsContext(asOfDate);
  const firstTransactionDate = transactionsContext.transactions.reduce((earliest, transaction) => {
    const transactionDate = new Date(transaction.transactionDate);
    if (Number.isNaN(transactionDate.getTime())) return earliest;
    return !earliest || transactionDate < earliest ? transactionDate : earliest;
  }, null);
  const reportData = buildBalanceSheetData(asOfDate, coaContext, transactionsContext, firstTransactionDate);

  return {
    title: "Balance Sheet",
    year: period.year,
    asOfDate: period.asOfDateText,
    availableYears: await getAvailableYears(),
    reportData,
    viewMode,
  };
}

export function buildProfitLossCsvRows(payload) {
  const rows = [];
  rows.push(["Profit & Loss Statement"]);
  rows.push([`Period: ${payload.startDate} to ${payload.endDate}`]);
  if (payload.comparisonDates) {
    rows.push([`Compare: ${payload.comparisonDates.start} to ${payload.comparisonDates.end}`]);
  }
  rows.push([""]);
  rows.push(["Account", "Current Amount", ...(payload.comparisonData ? ["Comparison Amount", "Change %"] : [])]);
  rows.push([""]);

  const appendAmount = (name, amount, compareAmount) => {
    const row = [name, roundReportMoney(amount).toFixed(2)];
    if (payload.comparisonData) {
      const hasCompare = compareAmount !== undefined;
      const change = hasCompare
        ? (Math.abs(Number(compareAmount)) < 0.000001
          ? (Math.abs(Number(amount)) < 0.000001 ? "0.00%" : "Baru")
          : `${(((Number(amount) - Number(compareAmount)) / Math.abs(Number(compareAmount))) * 100).toFixed(2)}%`)
        : "";
      row.push(hasCompare ? roundReportMoney(compareAmount).toFixed(2) : "", change);
    }
    rows.push(row);
  };

  const appendSection = (label, key, current) => {
    const prior = payload.comparisonData?.[key];
    const priorByCategory = new Map((prior?.accounts || []).map((account) => [
      `${account.category_type || "account"}:${account.category_id || account.id}`,
      account.total,
    ]));
    rows.push([label]);
    for (const account of current.accounts) {
      const key = `${account.category_type || "account"}:${account.category_id || account.id}`;
      const comparisonAmount = payload.comparisonData
        ? (priorByCategory.get(key) ?? 0)
        : undefined;
      appendAmount(account.account_name, account.total, comparisonAmount);
    }
    appendAmount(`Total ${label}`, current.total, payload.comparisonData ? (prior?.total ?? 0) : undefined);
    rows.push([""]);
  };

  appendSection("Income", "income", payload.reportData.income);
  appendSection("Cost of Goods Sold", "cogs", payload.reportData.cogs);
  appendAmount("Gross Profit", payload.reportData.gross_profit, payload.comparisonData?.gross_profit);
  rows.push([""]);
  appendSection("Operating Expenses", "operating_expenses", payload.reportData.operating_expenses);
  appendAmount("Net Profit", payload.reportData.net_profit, payload.comparisonData?.net_profit);
  return rows;
}

function buildAccountTransactionsCsvRows(payload) {
  const rows = [];
  rows.push(["Account Transactions (General Ledger)"]);
  rows.push([`Period: ${payload.startDate} to ${payload.endDate}`]);
  rows.push([""]);

  for (const account of payload.reportData) {
    rows.push([""]);
    rows.push([account.account_name]);
    rows.push([`Under: ${account.master_name} > ${account.submenu_name}`]);
    rows.push([""]);
    rows.push(["Date", "Description", "Debit", "Credit", "Balance"]);
    rows.push(["Starting Balance", "", "", "", account.starting_balance.toFixed(2)]);
    for (const txn of account.transactions) {
      rows.push([
        txn.date,
        txn.description || "",
        txn.debit > 0 ? txn.debit.toFixed(2) : "",
        txn.credit > 0 ? txn.credit.toFixed(2) : "",
        txn.balance.toFixed(2),
      ]);
    }
    rows.push([
      "Totals and Ending Balance",
      "",
      account.total_debit.toFixed(2),
      account.total_credit.toFixed(2),
      account.ending_balance.toFixed(2),
    ]);
    rows.push([
      "Balance Change",
      "",
      (account.ending_balance - account.starting_balance).toFixed(2),
      "",
      "",
    ]);
  }

  return rows;
}

function buildBalanceSheetCsvRows(payload) {
  const rows = [];
  rows.push(["Balance Sheet"]);
  rows.push([`As of: ${payload.asOfDate}`]);
  rows.push([""]);
  rows.push(["Account", "Balance"]);

  rows.push([""]);
  rows.push(["ASSETS"]);
  for (const [categoryName, category] of Object.entries(payload.reportData.assets.categories)) {
    rows.push([categoryName]);
    for (const account of category.accounts) {
      if ((account.balance || 0) !== 0) {
        rows.push([`  ${account.account_name}`, Number(account.balance || 0).toFixed(2)]);
      }
    }
    rows.push([`Total ${categoryName}`, Number(category.total || 0).toFixed(2)]);
  }
  rows.push(["Total Assets", Number(payload.reportData.total_assets || 0).toFixed(2)]);

  rows.push([""]);
  rows.push(["LIABILITIES"]);
  for (const [categoryName, category] of Object.entries(payload.reportData.liabilities.categories)) {
    rows.push([categoryName]);
    for (const account of category.accounts) {
      if ((account.balance || 0) !== 0) {
        rows.push([`  ${account.account_name}`, Number(account.balance || 0).toFixed(2)]);
      }
    }
    rows.push([`Total ${categoryName}`, Number(category.total || 0).toFixed(2)]);
  }
  rows.push(["Total Liabilities", Number(payload.reportData.total_liabilities || 0).toFixed(2)]);

  rows.push([""]);
  rows.push(["EQUITY"]);
  for (const [categoryName, category] of Object.entries(payload.reportData.equity.categories)) {
    rows.push([categoryName]);
    for (const account of category.accounts) {
      if ((account.balance || 0) !== 0) {
        rows.push([`  ${account.account_name}`, Number(account.balance || 0).toFixed(2)]);
      }
    }
    rows.push([`Total ${categoryName}`, Number(category.total || 0).toFixed(2)]);
  }
  rows.push(["Total Equity", Number(payload.reportData.total_equity || 0).toFixed(2)]);
  rows.push([""]);
  rows.push([
    "Total Liabilities + Equity",
    Number(payload.reportData.total_liabilities_equity || 0).toFixed(2),
  ]);
  return rows;
}

export const getProfitLoss = async (req, res) => {
  try {
    const payload = await buildProfitLossPayload(req.query || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const filterProfitLoss = async (req, res) => {
  try {
    const payload = await buildProfitLossPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const exportProfitLossCsv = async (req, res) => {
  try {
    const payload = await buildProfitLossPayload(req.query || {});
    const filename = `profit_loss_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildProfitLossCsvRows(payload));
  } catch (error) {
    respondReportError(res, error);
  }
};

export const getAccountTransactionsReport = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.query || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const filterAccountTransactionsReport = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const exportAccountTransactionsCsv = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.query || {});
    const filename = `account_transactions_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildAccountTransactionsCsvRows(payload));
  } catch (error) {
    respondReportError(res, error);
  }
};

export const getAgedReceivables = async (req, res) => {
  try {
    const payload = await buildAgedReceivablesPayload(req.query || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBalanceSheet = async (req, res) => {
  try {
    const payload = await buildBalanceSheetPayload(req.query || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const filterBalanceSheet = async (req, res) => {
  try {
    const payload = await buildBalanceSheetPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    respondReportError(res, error);
  }
};

export const exportBalanceSheetCsv = async (req, res) => {
  try {
    const payload = await buildBalanceSheetPayload(req.query || {});
    const filename = `balance_sheet_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildBalanceSheetCsvRows(payload));
  } catch (error) {
    respondReportError(res, error);
  }
};

export const checkBalanceSheetSplits = async (req, res) => {
  try {
    const splitTransactions = await AccountingTransaction.find({ isSplit: true })
      .select("_id transactionDate description transactionType amount accountId invoiceNumber invoiceProjectionIndex invoiceProjectionDescription")
      .lean();

    const transactionIds = splitTransactions.map((txn) => txn._id);
    const splits = transactionIds.length
      ? await TransactionSplit.find({ transactionId: { $in: transactionIds } })
        .select("transactionId amount categoryId categoryType")
        .lean()
      : [];

    const splitTotalsMap = new Map();
    const splitsByTransactionId = new Map();
    for (const split of splits) {
      const txnId = toIdString(split.transactionId);
      if (!splitsByTransactionId.has(txnId)) splitsByTransactionId.set(txnId, []);
      splitsByTransactionId.get(txnId).push(split);
      splitTotalsMap.set(txnId, (splitTotalsMap.get(txnId) || 0) + normalizeMoney(split.amount));
    }

    const accountIds = [...new Set(splitTransactions.map((txn) => toIdString(txn.accountId)).filter(Boolean))];
    const accountRows = accountIds.length
      ? await CoaAccount.find({ _id: { $in: accountIds } }).select("_id accountName isActive").lean()
      : [];
    const accountNameMap = new Map(accountRows.map((row) => [toIdString(row._id), row.accountName || ""]));
    const splitCategoryAccountIds = [...new Set(
      splits
        .filter((split) => split.categoryType === "account")
        .map((split) => toIdString(split.categoryId))
        .filter(Boolean),
    )];
    const splitCategoryAccounts = splitCategoryAccountIds.length
      ? await CoaAccount.find({ _id: { $in: splitCategoryAccountIds } })
        .select("_id accountName isActive")
        .lean()
      : [];
    const splitCategoryAccountMap = new Map(
      splitCategoryAccounts.map((account) => [toIdString(account._id), account]),
    );

    const issues = [];
    for (const txn of splitTransactions) {
      const txnAmount = normalizeMoney(txn.amount);
      const splitTotal = splitTotalsMap.get(toIdString(txn._id)) || 0;
      const remaining = roundReportMoney(txnAmount - splitTotal);
      const baseIssue = {
        id: toIdString(txn._id),
        transaction_date: formatYmd(txn.transactionDate),
        description: txn.description || "",
        transaction_type: txn.transactionType,
        transaction_amount: txnAmount,
        total_split_amount: roundReportMoney(splitTotal),
        account_name: accountNameMap.get(toIdString(txn.accountId)) || "",
      };

      if (hasSplitAmountMismatch(txnAmount, splitTotal)) {
        issues.push({
          ...baseIssue,
          issue_type: "amount_mismatch",
          issue_reason: "Total split berbeda dari jumlah transaksi.",
          category_name: "",
          remaining_unallocated: remaining,
        });
      }

      for (const split of splitsByTransactionId.get(toIdString(txn._id)) || []) {
        if ((split.categoryType || "account") !== "account") continue;
        const categoryAccount = splitCategoryAccountMap.get(toIdString(split.categoryId));
        if (categoryAccount && categoryAccount.isActive !== false) continue;
        issues.push({
          ...baseIssue,
          issue_type: categoryAccount ? "inactive_category" : "missing_category",
          issue_reason: categoryAccount
            ? "Split masih mengarah ke akun COA nonaktif."
            : "Akun COA split tidak ditemukan.",
          category_name: categoryAccount?.accountName || toIdString(split.categoryId),
          remaining_unallocated: 0,
          split_amount: roundReportMoney(split.amount),
        });
      }
    }

    issues.sort((a, b) => {
      const delta = Math.abs(b.remaining_unallocated) - Math.abs(a.remaining_unallocated);
      if (delta !== 0) return delta;
      return a.transaction_date.localeCompare(b.transaction_date);
    });

    res.status(200).json({
      success: true,
      count: issues.length,
      data: issues,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
