export function buildTransactionRequestParams({
  reportQuery = {},
  page = 1,
  pageSize = "10",
  sortBy = "date_desc",
  appliedFilters = {},
  searchQuery = "",
  exportAll = false,
} = {}) {
  const filters = appliedFilters;

  return {
    ...reportQuery,
    page: exportAll ? 1 : page,
    limit: exportAll ? "all" : pageSize,
    sortBy,
    transactionType: filters.type || "",
    description: filters.description || "",
    filter_account_name: filters.account || "",
    filter_category_name: filters.category === reportQuery.filter_category
      ? ""
      : (filters.category || ""),
    reviewed: filters.reviewed || "",
    filter_date_from: filters.dateFrom || reportQuery.filter_date_from || "",
    filter_date_to: filters.dateTo || reportQuery.filter_date_to || "",
    amountMin: filters.amountMin || "",
    amountMax: filters.amountMax || "",
    search: String(searchQuery || "").trim(),
  };
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatSplitCategory(split) {
  const categoryName = split?.categoryName || "Kategori tidak diketahui";
  const amount = Number(split?.amount);
  return Number.isFinite(amount)
    ? `${categoryName} (${amount.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : categoryName;
}

export function buildTransactionExportRows(transactions = [], { hasReportCategoryFilter = false } = {}) {
  return transactions.flatMap((transaction) => {
    const splits = hasReportCategoryFilter
      ? (transaction.drilldownSplits || [])
      : (transaction.splitCategories || []);
    const drilldownAmount = Number(transaction.drilldownAmount);
    const amount = hasReportCategoryFilter && Number.isFinite(drilldownAmount)
      ? drilldownAmount
      : (Number(transaction.amount) || 0);
    const parentRow = {
      date: formatDate(transaction.transactionDate),
      description: transaction.description || "-",
      account: transaction.accountId?.accountName || "-",
      currency: transaction.accountId?.currency || "Rp",
      category: transaction.isSplit
        ? (hasReportCategoryFilter ? "Kategori terpilih - total transaksi" : "Total transaksi split")
        : (transaction.categoryName || "-"),
      transactionType: transaction.transactionType || "-",
      amount,
      runningBalance: transaction.runningBalance === null || transaction.runningBalance === undefined
        ? null
        : Number(transaction.runningBalance),
      reviewed: transaction.reviewed ? "Sudah diperiksa" : "Belum diperiksa",
      senderName: transaction.senderName || "-",
      notes: transaction.notes || "-",
      isDetail: false,
    };

    if (!transaction.isSplit || splits.length === 0) return [parentRow];

    const detailRows = splits.map((split) => ({
      date: "",
      description: "",
      account: "",
      currency: parentRow.currency,
      category: `  - ${formatSplitCategory(split)}`,
      transactionType: "",
      amount: Number(split.amount) || 0,
      runningBalance: null,
      reviewed: "",
      senderName: "",
      notes: split.description || "",
      isDetail: true,
    }));

    return [parentRow, ...detailRows];
  });
}

export function summarizeTransactionExport(rows = []) {
  const summary = {
    transactionCount: rows.filter((row) => !row.isDetail).length,
    totalsByCurrency: [],
  };
  const totals = new Map();

  for (const row of rows.filter((item) => !item.isDetail)) {
    const currency = row.currency || "Rp";
    if (!totals.has(currency)) {
      totals.set(currency, { currency, totalDeposit: 0, totalWithdrawal: 0, net: 0 });
    }
    const currencyTotal = totals.get(currency);
    if (row.transactionType === "Deposit") currencyTotal.totalDeposit += Number(row.amount) || 0;
    if (row.transactionType === "Withdrawal") currencyTotal.totalWithdrawal += Number(row.amount) || 0;
    currencyTotal.net = currencyTotal.totalDeposit - currencyTotal.totalWithdrawal;
  }

  summary.totalsByCurrency = Array.from(totals.values());
  return summary;
}

function escapeExcelCell(value) {
  const text = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function formatExcelAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

export function buildTransactionExcelTsv(rows = [], summary = summarizeTransactionExport(rows)) {
  const headers = [
    "Tanggal",
    "Keterangan",
    "Rekening",
    "Mata Uang",
    "Kategori / Rincian Split",
    "Tipe",
    "Nominal",
    "Saldo Berjalan",
    "Status Review",
    "Nama Pengirim",
    "Catatan",
  ];
  const lines = [headers.join("\t")];

  for (const row of rows) {
    lines.push([
      escapeExcelCell(row.date),
      escapeExcelCell(row.description),
      escapeExcelCell(row.account),
      escapeExcelCell(row.currency),
      escapeExcelCell(row.category),
      escapeExcelCell(row.transactionType),
      formatExcelAmount(row.amount),
      formatExcelAmount(row.runningBalance),
      escapeExcelCell(row.reviewed),
      escapeExcelCell(row.senderName),
      escapeExcelCell(row.notes),
    ].join("\t"));
  }

  lines.push("");
  lines.push(["Ringkasan", "Jumlah Transaksi", String(summary.transactionCount)].join("\t"));
  for (const totals of summary.totalsByCurrency) {
    const currency = escapeExcelCell(totals.currency);
    lines.push(["", `Total Deposit (${currency})`, formatExcelAmount(totals.totalDeposit)].join("\t"));
    lines.push(["", `Total Withdrawal (${currency})`, formatExcelAmount(totals.totalWithdrawal)].join("\t"));
    lines.push(["", `Neto (${currency})`, formatExcelAmount(totals.net)].join("\t"));
  }

  return `\uFEFF${lines.join("\n")}`;
}

export function createTransactionExportFilename(format, date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `transaksi_koperasi_${timestamp}.${format}`;
}
