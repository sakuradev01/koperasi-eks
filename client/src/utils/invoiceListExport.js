import { strToU8, zipSync } from "fflate";

const numericColumns = new Set(["Invoice Total", "Invoice Paid", "Invoice Due"]);
const columnWidths = {
  Customer: 30,
  Reff: 22,
  "Invoice Number": 24,
  Currency: 12,
  "Issued Date": 15,
  "Invoice Total": 18,
  "Invoice Paid": 18,
  "Invoice Due": 18,
  "Due Date": 15,
  Status: 14,
  "Due Aging": 18,
  "Invoice URL": 64,
  Notes: 42,
};

const columnName = (index) => {
  let current = index;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
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

const numericValue = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const worksheetCell = (value, reference, styleIndex = 0, isNumeric = false) => {
  const style = styleIndex ? ` s="${styleIndex}"` : "";
  if (isNumeric) {
    const number = numericValue(value);
    if (number !== null) return `<c r="${reference}"${style} t="n"><v>${number}</v></c>`;
  }
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }
  const text = String(value).replace(/[\t\r\n]+/g, " ").trim();
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
};

export const parseInvoiceExportTsv = (tsv) => {
  const lines = String(tsv ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n");
  const headerLine = lines.shift() || "";
  const headers = headerLine.split("\t").map((header) => header.trim());
  const rows = lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const values = line.split("\t");
      return Array.from({ length: headers.length }, (_, index) => values[index] ?? "");
    });

  return { headers, rows };
};

export const buildInvoiceListXlsx = ({ headers = [], rows = [] } = {}) => {
  if (!headers.length) throw new Error("Format ekspor invoice kosong atau tidak dikenali.");

  const columnXml = headers.map((header, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${columnWidths[header] || 20}" customWidth="1"/>`).join("");
  const headerXml = `<row r="1" ht="28" customHeight="1">${headers.map((header, index) =>
    worksheetCell(header, `${columnName(index + 1)}1`, 1)).join("")}</row>`;
  const dataXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = headers.map((header, columnIndex) => worksheetCell(
      row[columnIndex],
      `${columnName(columnIndex + 1)}${rowNumber}`,
      numericColumns.has(header) ? 2 : 0,
      numericColumns.has(header),
    )).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const lastColumn = columnName(headers.length);
  const lastRow = Math.max(rows.length + 1, 1);
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnXml}</cols><sheetData>${headerXml}${dataXml}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoices" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00;-"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF04214A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXml,
  };

  return zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  ), { level: 6 });
};
