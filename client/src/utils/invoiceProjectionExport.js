import { strToU8, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : 0;
};

const formatAmount = (value, currency) =>
  `${currency} ${money(value).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const columnName = (index) => {
  let value = index;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const xmlEscape = (value) =>
  Array.from(String(value ?? ""))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === 9 || codePoint === 10 || codePoint === 13 || codePoint >= 32;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const worksheetCell = (value, reference, styleIndex = 0) => {
  const style = styleIndex ? ` s="${styleIndex}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style} t="n"><v>${value}</v></c>`;
  }
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }
  const text = String(value).replace(/[\t\r\n]+/g, " ").trim();
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
};

const worksheetRow = (values, rowNumber, styleIndex = 0, numericColumns = new Set()) =>
  `<row r="${rowNumber}">${values.map((value, index) =>
    worksheetCell(
      value,
      `${columnName(index + 1)}${rowNumber}`,
      numericColumns.has(index + 1) && typeof value === "number" ? 2 : styleIndex,
    )).join("")}</row>`;

const workbookFiles = (sheetXml, sheetName) => ({
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00;-"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF04214A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  "xl/worksheets/sheet1.xml": sheetXml,
});

const sheetFromRows = (rows, {
  autoFilterColumn = "J",
  autoFilterStartRow = 1,
  widths = [],
} = {}) => {
  const rowsXml = rows.map((row, index) => {
    const { values, style = 0, numericColumns = [] } = row;
    return worksheetRow(values, index + 1, style, new Set(numericColumns));
  });
  const columnXml = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${columnXml}<sheetData>${rowsXml.join("")}</sheetData><autoFilter ref="A${autoFilterStartRow}:${autoFilterColumn}${Math.max(rows.length, autoFilterStartRow)}"/></worksheet>`;
};

const monthlyXlsx = (report) => {
  const headers = [
    "Tanggal Proyeksi", "Tanggal Pembayaran", "Nomor Invoice", "Nama Siswa",
    "Keterangan", "Mata Uang", "Proyeksi", "Realisasi Periode", "Selisih", "Status",
  ];
  const rows = [{ values: ["PAYMENT PROJECTION INVOICE - PER BULAN"], style: 1 }];
  rows.push({ values: [`Periode ${report.filters.startDate} s.d. ${report.filters.endDate}`] });
  rows.push({ values: headers, style: 1 });
  report.rows.forEach((row) => rows.push({
    values: [
      row.projectionDate || "-",
      (row.paymentDates || []).join(", ") || "-",
      row.invoiceNumber,
      row.customerName,
      row.description,
      row.currency,
      row.projectedAmount,
      row.realizedAmount,
      row.difference,
      row.status,
    ],
    numericColumns: [7, 8, 9],
  }));
  report.summary.byCurrency.forEach((total) => rows.push({
    values: ["", "", "", `Ringkasan ${total.currency}`, "Total periode", total.currency,
      total.totalProjection, total.totalRealized, total.difference, `Belum dialokasikan: ${total.totalUnallocated}`],
    style: 2,
    numericColumns: [7, 8, 9],
  }));
  return sheetFromRows(rows, {
    autoFilterColumn: "J",
    autoFilterStartRow: 3,
    widths: [17, 24, 22, 30, 44, 12, 18, 20, 18, 18],
  });
};

const yearlyXlsx = (report) => {
  const headers = ["Nomor Invoice", "Nama Siswa", "Mata Uang", ...report.periods.map((period) => period.label), "Total Sisa"];
  const rows = [{ values: ["PAYMENT PROJECTION INVOICE - PER TAHUN"], style: 1 }];
  rows.push({ values: [`Periode ${report.filters.startYear}${report.filters.startYear !== report.filters.endYear ? ` s.d. ${report.filters.endYear}` : ""}`] });
  rows.push({ values: headers, style: 1 });
  report.rows.forEach((row) => rows.push({
    values: [row.invoiceNumber, row.customerName, row.currency,
      ...report.periods.map((period) => money(row.months?.[period.key])), row.totalOutstanding],
    numericColumns: Array.from({ length: report.periods.length + 1 }, (_, index) => index + 4),
  }));

  report.summary.byCurrency.forEach((currencyTotal) => {
    const monthTotals = report.periods.map((period) =>
      money(report.rows
        .filter((row) => row.currency === currencyTotal.currency)
        .reduce((sum, row) => sum + money(row.months?.[period.key]), 0)),
    );
    rows.push({
      values: ["", `Total Sisa (${currencyTotal.currency})`, currencyTotal.currency,
        ...monthTotals, currencyTotal.totalOutstanding],
      style: 2,
      numericColumns: Array.from({ length: report.periods.length + 1 }, (_, index) => index + 4),
    });
  });

  const lastColumn = columnName(headers.length);
  return sheetFromRows(rows, {
    autoFilterColumn: lastColumn,
    autoFilterStartRow: 3,
    widths: [22, 30, 12, ...report.periods.map(() => 14), 20],
  });
};

export function buildInvoiceProjectionXlsx(report) {
  const isYearly = report.mode === "yearly";
  const sheetXml = isYearly ? yearlyXlsx(report) : monthlyXlsx(report);
  const files = workbookFiles(sheetXml, isYearly ? "Proyeksi Tahunan" : "Proyeksi Bulanan");
  const archive = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  );
  return zipSync(archive, { level: 6 });
}

const getYearAmount = (row, year) =>
  money(Object.entries(row.months || {})
    .filter(([key]) => key.startsWith(`${year}-`))
    .reduce((sum, [, value]) => sum + money(value), 0));

export function buildInvoiceProjectionPdf(report) {
  const isYearly = report.mode === "yearly";
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: isYearly ? "a3" : "a4",
  });

  if (!isYearly) {
    pdf.setFontSize(16);
    pdf.text("Payment Projection Invoice - Per Bulan", 36, 36);
    pdf.setFontSize(9);
    pdf.text(`Periode: ${report.filters.startDate} s.d. ${report.filters.endDate}`, 36, 52);
    const summaryText = report.summary.byCurrency
      .map((item) => `${item.currency}: proyeksi ${formatAmount(item.totalProjection, item.currency)}, realisasi ${formatAmount(item.totalRealized, item.currency)}`)
      .join(" | ");
    if (summaryText) pdf.text(summaryText, 36, 66, { maxWidth: 760 });
    autoTable(pdf, {
      startY: 82,
      head: [["Tgl Proyeksi", "Tgl Bayar", "No. Invoice", "Nama", "Keterangan", "Mata Uang", "Proyeksi", "Realisasi", "Selisih", "Status"]],
      body: report.rows.map((row) => [
        row.projectionDate || "-",
        (row.paymentDates || []).join(", ") || "-",
        row.invoiceNumber,
        row.customerName,
        row.description,
        row.currency,
        formatAmount(row.projectedAmount, row.currency),
        formatAmount(row.realizedAmount, row.currency),
        row.difference === null ? "-" : formatAmount(row.difference, row.currency),
        row.status,
      ]),
      styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [4, 33, 74] },
      margin: { left: 36, right: 36 },
    });
    return pdf;
  }

  const years = [...new Set(report.periods.map((period) => period.year))];
  years.forEach((year, yearIndex) => {
    if (yearIndex > 0) pdf.addPage("a3", "landscape");
    const periods = report.periods.filter((period) => period.year === year);
    const yearRows = report.rows.filter((row) => getYearAmount(row, year) > 0);
    const totalsByCurrency = report.summary.byCurrency.map((summary) => {
      const rows = report.rows.filter((row) => row.currency === summary.currency);
      return {
        currency: summary.currency,
        months: periods.map((period) =>
          money(rows.reduce((sum, row) => sum + money(row.months?.[period.key]), 0)),
        ),
        total: money(rows.reduce((sum, row) => sum + getYearAmount(row, year), 0)),
      };
    });

    pdf.setFontSize(16);
    pdf.text("Payment Projection Invoice - Per Tahun", 36, 36);
    pdf.setFontSize(10);
    pdf.text(`Periode: ${year}`, 36, 53);
    autoTable(pdf, {
      startY: 68,
      head: [["No. Invoice", "Nama Siswa", "Mata Uang", ...periods.map((period) => period.label.split(" ")[0]), "Total Sisa"]],
      body: [
        ...totalsByCurrency.map((total) => [
          "", `Total Sisa (${total.currency})`, total.currency,
          ...total.months.map((amount) => formatAmount(amount, total.currency)),
          formatAmount(total.total, total.currency),
        ]),
        ...yearRows.map((row) => [
          row.invoiceNumber,
          row.customerName,
          row.currency,
          ...periods.map((period) => formatAmount(row.months?.[period.key], row.currency)),
          formatAmount(getYearAmount(row, year), row.currency),
        ]),
      ],
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [4, 33, 74] },
      margin: { left: 24, right: 24 },
    });
  });

  return pdf;
}

export function createInvoiceProjectionFilename(report, extension) {
  const label = report.mode === "yearly" ? "per_tahun" : "per_bulan";
  const period = report.mode === "yearly"
    ? `${report.filters.startYear}${report.filters.startYear !== report.filters.endYear ? `-${report.filters.endYear}` : ""}`
    : `${report.filters.startDate}_${report.filters.endDate}`;
  return `projection_invoice_${label}_${period}.${extension}`;
}
