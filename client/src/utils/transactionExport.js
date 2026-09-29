import { strToU8, zipSync } from "fflate";

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

function columnName(index) {
  let value = index;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xmlEscape(value) {
  const validXmlText = Array.from(String(value ?? ""))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === 9 || codePoint === 10 || codePoint === 13 || codePoint >= 32;
    })
    .join("");

  return validXmlText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function worksheetCell(value, reference, styleIndex = 0) {
  const style = styleIndex ? ` s="${styleIndex}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style} t="n"><v>${value}</v></c>`;
  }
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }
  const text = String(value).replace(/[\t\r\n]+/g, " ").trim();
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function worksheetRow(values, rowNumber, styleIndex = 0, numberColumns = new Set()) {
  const cells = values.map((value, index) => worksheetCell(
    value,
    `${columnName(index + 1)}${rowNumber}`,
    numberColumns.has(index + 1) && typeof value === "number" ? 2 : styleIndex,
  ));
  return `<row r="${rowNumber}">${cells.join("")}</row>`;
}

export function buildTransactionXlsx(rows = [], summary = summarizeTransactionExport(rows)) {
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
  const sheetRows = [worksheetRow(headers, 1, 1)];

  let rowNumber = 2;
  for (const row of rows) {
    const values = [
      row.date,
      row.description,
      row.account,
      row.currency,
      row.category,
      row.transactionType,
      Number(row.amount) || 0,
      row.runningBalance === null || row.runningBalance === undefined ? "" : Number(row.runningBalance),
      row.reviewed,
      row.senderName,
      row.notes,
    ];
    sheetRows.push(worksheetRow(values, rowNumber, row.isDetail ? 4 : 0, new Set([7, 8])));
    rowNumber += 1;
  }

  const lastTransactionRow = rowNumber - 1;
  rowNumber += 1;
  sheetRows.push(worksheetRow(["Ringkasan", "Jumlah Transaksi", String(summary.transactionCount)], rowNumber, 3));
  rowNumber += 1;
  for (const totals of summary.totalsByCurrency) {
    const currency = totals.currency || "Rp";
    sheetRows.push(worksheetRow(["", `Total Deposit (${currency})`, Number(totals.totalDeposit) || 0], rowNumber, 0, new Set([3])));
    rowNumber += 1;
    sheetRows.push(worksheetRow(["", `Total Withdrawal (${currency})`, Number(totals.totalWithdrawal) || 0], rowNumber, 0, new Set([3])));
    rowNumber += 1;
    sheetRows.push(worksheetRow(["", `Neto (${currency})`, Number(totals.net) || 0], rowNumber, 3, new Set([3])));
    rowNumber += 1;
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="28" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="48" customWidth="1"/><col min="6" max="6" width="16" customWidth="1"/><col min="7" max="8" width="24" customWidth="1"/><col min="9" max="10" width="24" customWidth="1"/><col min="11" max="11" width="40" customWidth="1"/></cols>
  <sheetData>${sheetRows.join("")}</sheetData>
  <autoFilter ref="A1:K${Math.max(1, lastTransactionRow)}"/>
</worksheet>`;

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transaksi" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00;-"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><color rgb="FF64748B"/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXml,
  };

  const archive = {};
  for (const [path, content] of Object.entries(files)) archive[path] = strToU8(content);
  return zipSync(archive, { level: 6 });
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
