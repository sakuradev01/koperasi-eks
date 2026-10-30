import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  buildInvoiceListXlsx,
  parseInvoiceExportTsv,
} from "../src/utils/invoiceListExport.js";

const invoiceExportTsv = [
  "\ufeffCustomer\tReff\tInvoice Number\tCurrency\tIssued Date\tInvoice Total\tInvoice Paid\tInvoice Due\tDue Date\tStatus\tDue Aging\tInvoice URL\tNotes",
  "Siswa Satu\tJPSB12345\tPDD2610002\tIDR\t2026-10-22\t1250000\t250000\t1000000\t2026-11-20\tsent\tIn 21 days\thttps://admin.samitcoop.com/public/invoice/PDD2610002\t=HYPERLINK(\"https://unsafe.example\")",
  "",
].join("\r\n");

test("parses invoice export TSV into aligned columns without a BOM", () => {
  const parsed = parseInvoiceExportTsv(invoiceExportTsv);

  assert.equal(parsed.headers[2], "Invoice Number");
  assert.equal(parsed.headers[11], "Invoice URL");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][2], "PDD2610002");
  assert.equal(parsed.rows[0][11], "https://admin.samitcoop.com/public/invoice/PDD2610002");
});

test("builds a valid XLSX with numeric amounts, readable columns, and inert text", () => {
  const workbook = buildInvoiceListXlsx(parseInvoiceExportTsv(invoiceExportTsv));
  const files = unzipSync(workbook);
  const contentTypes = strFromU8(files["[Content_Types].xml"]);
  const worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

  assert.match(contentTypes, /spreadsheetml\.sheet\.main\+xml/);
  assert.match(worksheet, /<c r="C2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>PDD2610002<\/t><\/is><\/c>/);
  assert.match(worksheet, /<c r="D2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>IDR<\/t><\/is><\/c>/);
  assert.match(worksheet, /<c r="F2"[^>]*t="n"><v>1250000<\/v><\/c>/);
  assert.match(worksheet, /<c r="L2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>https:\/\/admin\.samitcoop\.com\/public\/invoice\/PDD2610002<\/t><\/is><\/c>/);
  assert.match(worksheet, /<pane ySplit="1" topLeftCell="A2"[^>]*state="frozen"/);
  assert.match(worksheet, /<autoFilter ref="A1:M2"\/>/);
  assert.ok(worksheet.includes("=HYPERLINK"));
  assert.doesNotMatch(worksheet, /<f>/);
});
