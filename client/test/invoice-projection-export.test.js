import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { strFromU8, unzipSync } from "fflate";

const loadExport = async () => {
  const module = await import("../src/utils/invoiceProjectionExport.js").catch(() => null);
  assert.ok(module?.buildInvoiceProjectionXlsx, "invoice projection XLSX exporter should be available");
  assert.ok(module?.buildInvoiceProjectionPdf, "invoice projection PDF exporter should be available");
  return module;
};

const monthlyReport = {
  mode: "monthly",
  filters: { startDate: "2026-01-01", endDate: "2026-01-31" },
  rows: [
    {
      rowType: "projection",
      projectionDate: "2026-01-10",
      paymentDates: ["2026-01-15"],
      invoiceNumber: '=HYPERLINK("https://bad.example")',
      customerName: "Puspaini",
      description: "Cicilan 1",
      currency: "JPY",
      status: "Paid",
      projectedAmount: 100,
      realizedAmount: 100,
      difference: 0,
    },
  ],
  summary: {
    byCurrency: [
      { currency: "JPY", totalProjection: 100, totalRealized: 100, difference: 0, totalUnallocated: 0 },
    ],
  },
};

const yearlyReport = {
  mode: "yearly",
  filters: { startYear: 2026, endYear: 2027 },
  periods: [
    { key: "2026-01", year: 2026, month: 1, label: "Jan 2026" },
    { key: "2027-01", year: 2027, month: 1, label: "Jan 2027" },
  ],
  rows: [
    {
      invoiceNumber: "PDD2610002",
      customerName: "Puspaini",
      currency: "JPY",
      months: { "2026-01": 50, "2027-01": 25 },
      totalOutstanding: 75,
    },
  ],
  summary: {
    byCurrency: [
      { currency: "JPY", totalProjection: 300, totalOutstanding: 75, totalUnallocated: 0 },
    ],
  },
};

test("exports a valid XLSX workbook with numeric amounts and formula-like text kept inert", async () => {
  const { buildInvoiceProjectionXlsx } = await loadExport();
  const workbook = buildInvoiceProjectionXlsx(monthlyReport);
  const files = unzipSync(workbook);
  const contentTypes = strFromU8(files["[Content_Types].xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

  assert.match(contentTypes, /spreadsheetml\.sheet\.main\+xml/);
  assert.match(sheet, /<c r="G[0-9]+"[^>]*><v>100<\/v><\/c>/);
  assert.match(sheet, /<c r="C4"[^>]*t="inlineStr"/);
  assert.ok(sheet.includes("=HYPERLINK"));
  assert.match(sheet, /<autoFilter ref="A3:J5"\/>/);
  assert.doesNotMatch(sheet, /<f>/);
});

test("exports yearly invoice projections with the selected year columns", async () => {
  const { buildInvoiceProjectionXlsx } = await loadExport();
  const files = unzipSync(buildInvoiceProjectionXlsx(yearlyReport));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

  assert.match(sheet, /PDD2610002/);
  assert.match(sheet, /Jan 2026/);
  assert.match(sheet, /Jan 2027/);
  assert.match(sheet, /75/);
});

test("creates a readable multi-page PDF for yearly projection rows", async () => {
  const { buildInvoiceProjectionPdf } = await loadExport();
  const pdf = buildInvoiceProjectionPdf(yearlyReport);
  const bytes = Buffer.from(pdf.output("arraybuffer"));

  assert.equal(bytes.toString("latin1", 0, 8), "%PDF-1.3");
  assert.ok(bytes.toString("latin1").includes("PDD2610002"));
  assert.equal(pdf.internal.getNumberOfPages(), 2);
});
