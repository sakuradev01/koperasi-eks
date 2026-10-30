import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceExportTsv } from "../src/utils/invoiceExport.js";

test("exports invoice fields under matching headers in a stable TSV column order", () => {
  const tsv = buildInvoiceExportTsv([{
    customer: "Siswa Satu",
    reff: "JPSB12345",
    invoiceNumber: "PDD2610002",
    currency: "IDR",
    issuedDate: "2026-10-22",
    invoiceTotal: 1_250_000,
    invoicePaid: 250_000,
    invoiceDue: 1_000_000,
    dueDate: "2026-11-20",
    status: "sent",
    dueAging: "In 21 days",
    invoiceUrl: "https://admin.samitcoop.com/public/invoice/PDD2610002",
    notes: "Invoice note",
  }]);
  const [header, row] = tsv.replace(/^\uFEFF/, "").split("\n");
  const headers = header.split("\t");
  const values = row.split("\t");

  assert.deepEqual(headers, [
    "Customer", "Reff", "Invoice Number", "Currency", "Issued Date",
    "Invoice Total", "Invoice Paid", "Invoice Due", "Due Date", "Status",
    "Due Aging", "Invoice URL", "Notes",
  ]);
  assert.equal(values[2], "PDD2610002");
  assert.equal(values[3], "IDR");
  assert.equal(values[5], "1250000");
  assert.equal(values[11], "https://admin.samitcoop.com/public/invoice/PDD2610002");
});

test("keeps embedded tabs and line breaks from shifting invoice export columns", () => {
  const tsv = buildInvoiceExportTsv([{
    customer: "Siswa\tDua",
    invoiceNumber: "PDD2610003",
    notes: "Catatan baris satu\nbaris dua",
  }]);
  const lines = tsv.replace(/^\uFEFF/, "").split("\n");

  assert.equal(lines.length, 2);
  assert.equal(lines[1].split("\t").length, 13);
  assert.match(lines[1], /Siswa Dua/);
  assert.match(lines[1], /Catatan baris satu baris dua/);
});
