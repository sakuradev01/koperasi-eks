import { AccountingTransaction } from "../../models/accountingTransaction.model.js";
import { TransactionSplit } from "../../models/transactionSplit.model.js";
import { CoaMaster } from "../../models/coaMaster.model.js";
import { CoaSubmenu } from "../../models/coaSubmenu.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";
import { Member } from "../../models/member.model.js";
import { Invoice } from "../../models/invoice.model.js";

const DEBIT_NORMAL_MASTERS = new Set(["Assets", "Expenses"]);
const COGS_SUBMENUS = new Set(["Cost of Goods Sold", "COGS", "Direct Costs", "Cost of Sales"]);
const CASH_ASSET_SUBMENUS = new Set(["Cash and Bank", "Cash on Hand", "Bank Accounts", "Money in Transit"]);
const LIABILITY_LONG_TERM_SUBMENUS = new Set([
  "Loan and Line of Credit",
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
  if (payment.projectionId && isSameObjectId(payment.projectionId, projection._id)) {
    return true;
  }
  return (
    Number(payment.projectionIndex || 0) > 0 &&
    Number(payment.projectionIndex) === Number(projectionIndex)
  );
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
          .reduce((sum, payment) => sum + roundMoney(payment.amount), 0),
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

    const matchingPayments = payments.filter((payment) =>
      payment.projectionId
        ? isSameObjectId(payment.projectionId, projection._id)
        : Number(payment.projectionIndex || 0) > 0 &&
          Number(payment.projectionIndex) ===
            (projections.indexOf(projection) + 1),
    );

    for (const payment of matchingPayments) {
      const payDate = new Date(payment.paymentDate);
      if (Number.isNaN(payDate.getTime())) continue;
      totalPaid += roundMoney(payment.amount);

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

function computeBalanceSigned(masterName, transactionType, amount) {
  const money = normalizeMoney(amount);
  if (DEBIT_NORMAL_MASTERS.has(masterName)) {
    return transactionType === "Deposit" ? money : -money;
  }
  return transactionType === "Deposit" ? -money : money;
}

function computeMasterReportSigned(masterName, transactionType, amount) {
  const money = normalizeMoney(amount);
  if (masterName === "Income") {
    return transactionType === "Deposit" ? money : -money;
  }
  if (masterName === "Expenses") {
    return transactionType === "Withdrawal" ? money : -money;
  }
  return computeBalanceSigned(masterName, transactionType, money);
}

function computeDebitCredit(masterName, transactionType, amount) {
  const money = normalizeMoney(amount);
  const isDebit = DEBIT_NORMAL_MASTERS.has(masterName)
    ? transactionType === "Deposit"
    : transactionType === "Withdrawal";
  return {
    debit: isDebit ? money : 0,
    credit: isDebit ? 0 : money,
    signed: isDebit ? money : -money,
  };
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
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)),
      end: formatYmd(now),
      group: "Other",
    },
    {
      label: "Last 60 Days",
      value: "last_60_days",
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60)),
      end: formatYmd(now),
      group: "Other",
    },
    {
      label: "Last 90 Days",
      value: "last_90_days",
      start: formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)),
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

async function loadCoaContext() {
  const masters = await CoaMaster.find({ isActive: true }).sort({ masterName: 1 }).lean();
  const masterMap = new Map();
  for (const master of masters) {
    masterMap.set(toIdString(master._id), { ...master, id: toIdString(master._id) });
  }

  const submenusRaw = await CoaSubmenu.find({ isActive: true }).sort({ submenuName: 1 }).lean();
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

  const accountsRaw = await CoaAccount.find({ isActive: true }).sort({ accountName: 1 }).lean();
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

  return true;
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
  const validSubmenuIds = new Set(accounts.map((account) => account.submenuId));

  const nonSplitAccountTotals = new Map();
  const nonSplitSubmenuTotals = new Map();
  const splitTotals = new Map();

  for (const transaction of transactionsContext.transactions) {
    if (!inDateRange(transaction.transactionDate, startDate, endDate)) continue;
    const txnId = toIdString(transaction._id);
    const transactionType = transaction.transactionType;

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(txnId) || [];
      for (const split of splits) {
        if (split.categoryType !== "account") continue;
        const accountId = toIdString(split.categoryId);
        if (!validAccountIds.has(accountId)) continue;
        const signed = computeMasterReportSigned(masterName, transactionType, split.amount);
        splitTotals.set(accountId, (splitTotals.get(accountId) || 0) + signed);
      }
      continue;
    }

    if (transaction.categoryType === "account") {
      const accountId = toIdString(transaction.categoryId);
      if (!validAccountIds.has(accountId)) continue;
      const signed = computeMasterReportSigned(masterName, transactionType, transaction.amount);
      nonSplitAccountTotals.set(accountId, (nonSplitAccountTotals.get(accountId) || 0) + signed);
      continue;
    }

    if (transaction.categoryType === "submenu") {
      const submenuId = toIdString(transaction.categoryId);
      if (!validSubmenuIds.has(submenuId)) continue;
      const signed = computeMasterReportSigned(masterName, transactionType, transaction.amount);
      nonSplitSubmenuTotals.set(submenuId, (nonSplitSubmenuTotals.get(submenuId) || 0) + signed);
    }
  }

  const groupedMap = new Map();
  const flatAccounts = [];
  let total = 0;

  for (const account of accounts) {
    const rawTotal = (nonSplitAccountTotals.get(account.id) || 0)
      + (nonSplitSubmenuTotals.get(account.submenuId) || 0)
      + (splitTotals.get(account.id) || 0);
    const displayTotal = Math.abs(rawTotal);
    if (skipZero && displayTotal < 0.01) continue;

    if (!groupedMap.has(account.submenuName)) {
      groupedMap.set(account.submenuName, {
        submenu_name: account.submenuName,
        submenu_id: account.submenuId,
        accounts: [],
        subtotal: 0,
      });
    }

    groupedMap.get(account.submenuName).accounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      total: displayTotal,
      raw_total: rawTotal,
    });
    groupedMap.get(account.submenuName).subtotal += displayTotal;
    flatAccounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      total: displayTotal,
      raw_total: rawTotal,
    });
    total += displayTotal;
  }

  return {
    accounts: flatAccounts,
    grouped: Array.from(groupedMap.values()),
    total,
  };
}

function buildProfitLossData(startDate, endDate, coaContext, transactionsContext) {
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
  const grossProfit = totalIncome - totalCOGS;
  const totalOperatingExpenses = operatingExpenses.total;
  const netProfit = grossProfit - totalOperatingExpenses;
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

    if (useAccountFlowForCash) {
      if (toIdString(transaction.accountId) !== account.id) continue;
      balance += computeBalanceSigned("Assets", transaction.transactionType, transaction.amount);
      continue;
    }

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(toIdString(transaction._id)) || [];
      for (const split of splits) {
        if (split.categoryType !== "account") continue;
        if (toIdString(split.categoryId) !== account.id) continue;
        balance += computeBalanceSigned(account.masterName, transaction.transactionType, split.amount);
      }
      continue;
    }

    if (transaction.categoryType === "account" && toIdString(transaction.categoryId) === account.id) {
      balance += computeBalanceSigned(account.masterName, transaction.transactionType, transaction.amount);
      continue;
    }

    if (transaction.categoryType === "submenu" && toIdString(transaction.categoryId) === account.submenuId) {
      balance += computeBalanceSigned(account.masterName, transaction.transactionType, transaction.amount);
    }
  }

  return balance;
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
        if (split.categoryType !== "account") continue;
        const account = coaContext.accountMap.get(toIdString(split.categoryId));
        if (!account || account.masterName !== masterName) continue;
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
    }
  }

  return Math.abs(total);
}

function buildBalanceSheetData(asOfDate, coaContext, transactionsContext) {
  const assetCategories = {
    "Cash and Bank": { accounts: [], total: 0 },
    "Other Current Assets": { accounts: [], total: 0 },
    "Long-term Assets": { accounts: [], total: 0 },
  };
  const liabilityCategories = {
    "Current Liabilities": { accounts: [], total: 0 },
    "Long-term Liabilities": { accounts: [], total: 0 },
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
      balance: rawBalance,
    });
    assetCategories[categoryName].total += rawBalance;
    totalAssets += rawBalance;
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
    const displayBalance = Math.abs(rawBalance);
    const categoryName = buildLiabilityCategoryName(account.submenuName);
    liabilityCategories[categoryName].accounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      balance: displayBalance,
    });
    liabilityCategories[categoryName].total += displayBalance;
    totalLiabilities += displayBalance;
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
    const displayBalance = Math.abs(rawBalance);
    otherEquityAccounts.push({
      id: account.id,
      account_code: account.accountCode || "",
      account_name: account.accountName,
      currency: account.currency || "Rp",
      submenu_name: account.submenuName,
      balance: displayBalance,
    });
    otherEquityTotal += displayBalance;
  }

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
  const retainedEarnings = totalIncomeAllTime - totalExpenseAllTime;

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
  const currentYearProfit = totalIncomeCurrentYear - totalExpenseCurrentYear;
  const priorYearsProfit = retainedEarnings - currentYearProfit;

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
          link: `/reports/profit-loss?end_date=${formatYmd(new Date(asOfDate.getFullYear() - 1, 11, 31))}`,
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

  const totalEquity = otherEquityTotal + retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

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
    net_worth: totalAssets - totalLiabilities,
    total_liabilities_equity: totalLiabilitiesAndEquity,
    is_balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
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

  return coaContext.accounts.slice();
}

function buildAccountTransactionsData({
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

  for (const account of filteredAccounts) {
    ledgerMap.set(account.id, {
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
  }

  for (const transaction of transactionsContext.transactions) {
    if (!transactionMatchesContact(transaction, contactFilter)) continue;

    const txnDate = new Date(transaction.transactionDate);
    if (Number.isNaN(txnDate.getTime()) || txnDate > endDate) continue;
    const transactionType = transaction.transactionType;
    const txnId = toIdString(transaction._id);

    const contributions = [];

    if (transaction.isSplit) {
      const splits = transactionsContext.splitsByTransactionId.get(txnId) || [];
      for (const split of splits) {
        if (split.categoryType !== "account") continue;
        const accountId = toIdString(split.categoryId);
        if (!accountById.has(accountId)) continue;
        contributions.push({
          accountId,
          amount: normalizeMoney(split.amount),
        });
      }
    } else if (transaction.categoryType === "account") {
      const accountId = toIdString(transaction.categoryId);
      if (accountById.has(accountId)) {
        contributions.push({
          accountId,
          amount: normalizeMoney(transaction.amount),
        });
      }
    } else if (transaction.categoryType === "submenu") {
      const submenuId = toIdString(transaction.categoryId);
      const submenuAccounts = coaContext.accountsBySubmenu.get(submenuId) || [];
      for (const submenuAccount of submenuAccounts) {
        if (!accountById.has(submenuAccount.id)) continue;
        contributions.push({
          accountId: submenuAccount.id,
          amount: normalizeMoney(transaction.amount),
        });
      }
    }

    if (contributions.length === 0) continue;

    const contactName = transaction.customerId
      ? (memberNameMap.get(toIdString(transaction.customerId)) || "")
      : (transaction.vendorId || "");

    for (const contribution of contributions) {
      const ledger = ledgerMap.get(contribution.accountId);
      const account = accountById.get(contribution.accountId);
      const debitCredit = computeDebitCredit(account.masterName, transactionType, contribution.amount);

      if (txnDate < startDate) {
        ledger.starting_balance += debitCredit.signed;
        continue;
      }

      ledger.transactions.push({
        transaction_id: txnId,
        date: formatYmd(txnDate),
        date_obj: txnDate,
        created_at: transaction.createdAt ? new Date(transaction.createdAt) : txnDate,
        account_name: account.accountName,
        description: transaction.description || "",
        notes: transaction.notes || "",
        contact_name: contactName || "",
        debit: debitCredit.debit,
        credit: debitCredit.credit,
      });
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
    ledger.ending_balance = running.balance;

    if (String(accountFilter || "all") === "all" && ledger.transactions.length === 0) {
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
    reportType: payload.reportType,
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
  const startDefault = `${now.getFullYear()}-01-01`;
  const endDefault = formatYmd(now);
  const startDateText = options.start_date || options.startDate || startDefault;
  const endDateText = options.end_date || options.endDate || endDefault;
  const startDate = startOfDay(parseDateInput(startDateText, startDefault));
  const endDate = endOfDay(parseDateInput(endDateText, endDefault));
  const reportType = options.report_type || options.reportType || "accrual";
  const compareEnabled = normalizeBooleanFlag(options.compare_enabled ?? options.compareEnabled, false);
  const comparePeriod = options.compare_period || options.comparePeriod || "custom";
  const compareStartDate = options.compare_start_date || options.compareStartDate || "";
  const compareEndDate = options.compare_end_date || options.compareEndDate || "";
  const viewMode = options.view_mode || options.viewMode || "summary";

  const availableYears = await getAvailableYears();
  const coaContext = await loadCoaContext();
  const transactionsContext = await loadTransactionsContext(endDate);
  const reportData = buildProfitLossData(startDate, endDate, coaContext, transactionsContext);

  let comparisonDates = null;
  let comparisonData = null;
  if (compareEnabled) {
    if (comparePeriod === "custom" && compareStartDate && compareEndDate) {
      comparisonDates = {
        start: compareStartDate,
        end: compareEndDate,
      };
    } else {
      comparisonDates = getComparisonDates(startDate, endDate, comparePeriod);
    }

    const compareStart = startOfDay(parseDateInput(comparisonDates.start, comparisonDates.start));
    const compareEnd = endOfDay(parseDateInput(comparisonDates.end, comparisonDates.end));
    comparisonData = buildProfitLossData(compareStart, compareEnd, coaContext, transactionsContext);
  }

  return serializeProfitLossPayload({
    year: Number.parseInt(options.year, 10) || startDate.getFullYear(),
    startDate: formatYmd(startDate),
    endDate: formatYmd(endDate),
    reportType,
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
  const startDefault = `${yearDefault}-01-01`;
  const endDefault = `${yearDefault}-12-31`;

  const year = Number.parseInt(options.year, 10) || yearDefault;
  const startDate = startOfDay(parseDateInput(options.start_date || options.startDate, startDefault));
  const endDate = endOfDay(parseDateInput(options.end_date || options.endDate, endDefault));
  const accountFilter = options.account_filter || options.accountFilter || "all";
  const contactFilter = options.contact_filter || options.contactFilter || "all";
  const reportType = options.report_type || options.reportType || "accrual";
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
    year,
    startDate: formatYmd(startDate),
    endDate: formatYmd(endDate),
    accountFilter,
    contactFilter,
    reportType,
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
  const asOfDateText = options.as_of_date || options.asOfDate || formatYmd(now);
  const asOfDate = endOfDay(parseDateInput(asOfDateText, formatYmd(now)));
  const reportType = options.report_type || options.reportType || "accrual";
  const viewMode = options.view_mode || options.viewMode || "summary";
  const year = Number.parseInt(options.year, 10) || asOfDate.getFullYear();

  const coaContext = await loadCoaContext();
  const transactionsContext = await loadTransactionsContext(asOfDate);
  const reportData = buildBalanceSheetData(asOfDate, coaContext, transactionsContext);

  return {
    title: "Balance Sheet",
    year,
    asOfDate: formatYmd(asOfDate),
    reportType,
    availableYears: await getAvailableYears(),
    reportData,
    viewMode,
  };
}

function buildProfitLossCsvRows(payload) {
  const rows = [];
  rows.push(["Profit & Loss Statement"]);
  rows.push([`Period: ${payload.startDate} to ${payload.endDate}`]);
  rows.push([""]);
  rows.push(["Account", "Amount"]);
  rows.push([""]);
  rows.push(["INCOME"]);
  for (const account of payload.reportData.income.accounts) {
    rows.push([account.account_name, account.total.toFixed(2)]);
  }
  rows.push(["Total Income", payload.reportData.income.total.toFixed(2)]);
  rows.push([""]);
  rows.push(["COST OF GOODS SOLD"]);
  for (const account of payload.reportData.cogs.accounts) {
    rows.push([account.account_name, account.total.toFixed(2)]);
  }
  rows.push(["Total Cost of Goods Sold", payload.reportData.cogs.total.toFixed(2)]);
  rows.push([""]);
  rows.push(["Gross Profit", payload.reportData.gross_profit.toFixed(2)]);
  rows.push([""]);
  rows.push(["OPERATING EXPENSES"]);
  for (const account of payload.reportData.operating_expenses.accounts) {
    rows.push([account.account_name, account.total.toFixed(2)]);
  }
  rows.push(["Total Operating Expenses", payload.reportData.operating_expenses.total.toFixed(2)]);
  rows.push([""]);
  rows.push(["Net Profit", payload.reportData.net_profit.toFixed(2)]);
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const filterProfitLoss = async (req, res) => {
  try {
    const payload = await buildProfitLossPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportProfitLossCsv = async (req, res) => {
  try {
    const payload = await buildProfitLossPayload(req.query || {});
    const filename = `profit_loss_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildProfitLossCsvRows(payload));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAccountTransactionsReport = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.query || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const filterAccountTransactionsReport = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportAccountTransactionsCsv = async (req, res) => {
  try {
    const payload = await buildAccountTransactionsPayload(req.query || {});
    const filename = `account_transactions_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildAccountTransactionsCsvRows(payload));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const filterBalanceSheet = async (req, res) => {
  try {
    const payload = await buildBalanceSheetPayload(req.body || {});
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportBalanceSheetCsv = async (req, res) => {
  try {
    const payload = await buildBalanceSheetPayload(req.query || {});
    const filename = `balance_sheet_${formatYmd(new Date())}.csv`;
    sendCsv(res, filename, buildBalanceSheetCsvRows(payload));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
        .select("transactionId amount")
        .lean()
      : [];

    const splitTotalsMap = new Map();
    for (const split of splits) {
      const txnId = toIdString(split.transactionId);
      splitTotalsMap.set(txnId, (splitTotalsMap.get(txnId) || 0) + normalizeMoney(split.amount));
    }

    const accountIds = [...new Set(splitTransactions.map((txn) => toIdString(txn.accountId)).filter(Boolean))];
    const accountRows = accountIds.length
      ? await CoaAccount.find({ _id: { $in: accountIds } }).select("_id accountName").lean()
      : [];
    const accountNameMap = new Map(accountRows.map((row) => [toIdString(row._id), row.accountName || ""]));

    const issues = [];
    for (const txn of splitTransactions) {
      const txnAmount = normalizeMoney(txn.amount);
      const splitTotal = splitTotalsMap.get(toIdString(txn._id)) || 0;
      const remaining = txnAmount - splitTotal;
      if (Math.abs(remaining) <= 0.01) continue;
      issues.push({
        id: toIdString(txn._id),
        transaction_date: formatYmd(txn.transactionDate),
        description: txn.description || "",
        transaction_type: txn.transactionType,
        transaction_amount: txnAmount,
        total_split_amount: splitTotal,
        remaining_unallocated: remaining,
        account_name: accountNameMap.get(toIdString(txn.accountId)) || "",
      });
    }

    issues.sort((a, b) => Math.abs(b.remaining_unallocated) - Math.abs(a.remaining_unallocated));

    res.status(200).json({
      success: true,
      count: issues.length,
      data: issues,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
