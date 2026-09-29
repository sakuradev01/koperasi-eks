import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  buildTransactionExportRows,
  buildTransactionXlsx,
  buildTransactionRequestParams,
  summarizeTransactionExport,
} from "../src/utils/transactionExport.js";
import { buildTransactionPdf } from "../src/utils/transactionPdfExport.js";

test("requests every matching transaction with the same account, filters and sort", () => {
  const query = buildTransactionRequestParams({
    reportQuery: { filter_date_from: "2026-01-01", filter_date_to: "2026-08-14" },
    page: 7,
    pageSize: "25",
    sortBy: "amount_asc",
    appliedFilters: {
      type: "Deposit",
      description: "invoice",
      account: "Bank SAMIT",
      category: "Modal",
      reviewed: "0",
      dateFrom: "2026-02-01",
      dateTo: "2026-08-01",
      amountMin: "100000",
      amountMax: "3000000",
    },
    searchQuery: "deswita",
    exportAll: true,
  });

  assert.equal(query.page, 1);
  assert.equal(query.limit, "all");
  assert.equal(query.sortBy, "amount_asc");
  assert.equal(query.transactionType, "Deposit");
  assert.equal(query.description, "invoice");
  assert.equal(query.filter_account_name, "Bank SAMIT");
  assert.equal(query.filter_category_name, "Modal");
  assert.equal(query.reviewed, "0");
  assert.equal(query.filter_date_from, "2026-02-01");
  assert.equal(query.filter_date_to, "2026-08-01");
  assert.equal(query.amountMin, "100000");
  assert.equal(query.amountMax, "3000000");
  assert.equal(query.search, "deswita");
});

test("preserves Profit and Loss drill-down filters without applying the same category twice", () => {
  const query = buildTransactionRequestParams({
    reportQuery: {
      filter_category: "Bunga Talangan",
      filter_category_id: "category-123",
      filter_category_type: "account",
      filter_date_from: "2026-01-01",
    },
    appliedFilters: {
      type: "",
      description: "",
      account: "",
      category: "Bunga Talangan",
      reviewed: "",
      dateFrom: "",
      dateTo: "",
      amountMin: "",
      amountMax: "",
    },
    searchQuery: "",
    exportAll: true,
  });

  assert.equal(query.filter_category, "Bunga Talangan");
  assert.equal(query.filter_category_id, "category-123");
  assert.equal(query.filter_category_type, "account");
  assert.equal(query.filter_category_name, "");
  assert.equal(query.filter_date_from, "2026-01-01");
});

test("exports readable split details and the selected report-category amount", () => {
  const rows = buildTransactionExportRows([
    {
      transactionDate: "2026-08-12T00:00:00.000Z",
      description: "Invoice DTSTG001",
      accountId: { accountName: "Bank Koperasi *596" },
      isSplit: true,
      transactionType: "Deposit",
      amount: 1000,
      drilldownAmount: 350,
      drilldownSplits: [
        { categoryName: "Bunga Talangan", amount: 350 },
      ],
      splitCategories: [
        { categoryName: "Bunga Talangan", amount: 350 },
        { categoryName: "Pokok Talangan", amount: 650 },
      ],
      runningBalance: 2500,
      reviewed: true,
    },
  ], { hasReportCategoryFilter: true });

  assert.deepEqual(rows, [
    {
      date: "2026-08-12",
      description: "Invoice DTSTG001",
      account: "Bank Koperasi *596",
      currency: "Rp",
      category: "Kategori terpilih - total transaksi",
      transactionType: "Deposit",
      amount: 350,
      runningBalance: 2500,
      reviewed: "Sudah diperiksa",
      senderName: "-",
      notes: "-",
      isDetail: false,
    },
    {
      date: "",
      description: "",
      account: "",
      currency: "Rp",
      category: "  - Bunga Talangan (350,00)",
      transactionType: "",
      amount: 350,
      runningBalance: null,
      reviewed: "",
      senderName: "",
      notes: "",
      isDetail: true,
    },
  ]);
});

test("summarizes exported transactions without adding split-category amounts twice", () => {
  const rows = [
    ...buildTransactionExportRows([{
      transactionType: "Deposit",
      amount: 1000,
      currency: "Rp",
      isSplit: true,
      splitCategories: [
        { categoryName: "Modal", amount: 400 },
        { categoryName: "Simpanan", amount: 600 },
      ],
    }]),
    ...buildTransactionExportRows([
      { transactionType: "Withdrawal", amount: 200, currency: "Rp" },
    ]),
  ];

  assert.deepEqual(summarizeTransactionExport(rows), {
    transactionCount: 2,
    totalsByCurrency: [{ currency: "Rp", totalDeposit: 1000, totalWithdrawal: 200, net: 800 }],
  });
});

test("creates a valid XLSX workbook, preserves numeric amounts, and keeps formula-like text inert", () => {
  const workbookBytes = buildTransactionXlsx([
    {
      date: "2026-08-12",
      description: "\t=HYPERLINK(\"https://bad.example\")",
      account: "Bank Koperasi *596",
      currency: "Rp",
      category: "Modal",
      transactionType: "Deposit",
      amount: 2500000,
      runningBalance: -6339000,
      reviewed: "Sudah diperiksa",
      senderName: "-",
      notes: "memo",
    },
  ]);
  const files = unzipSync(workbookBytes);
  const contentTypes = strFromU8(files["[Content_Types].xml"]);
  const worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

  assert.match(contentTypes, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/);
  assert.match(worksheet, /<c r="B2"[^>]*t="inlineStr"><is><t[^>]*>=HYPERLINK/);
  assert.match(worksheet, /<c r="G2"[^>]*><v>2500000<\/v><\/c>/);
  assert.match(worksheet, /<c r="H2"[^>]*><v>-6339000<\/v><\/c>/);
  assert.match(worksheet, /Total Deposit \(Rp\)/);
  assert.doesNotMatch(worksheet, /<f>/);
});

test("builds a valid multi-page PDF with transaction rows and report metadata", () => {
  const rows = Array.from({ length: 90 }, (_, index) => ({
    date: "2026-08-12",
    description: `Invoice DTSTG${String(index).padStart(4, "0")}`,
    account: "Bank Koperasi *596",
    currency: "Rp",
    category: index % 2 ? "Modal" : "Split transaction total",
    transactionType: "Deposit",
    amount: 2500000,
    runningBalance: 2500000 + (index * 2500000),
    reviewed: "Sudah diperiksa",
    senderName: "-",
    notes: "-",
    isDetail: false,
  }));
  const summary = summarizeTransactionExport(rows);
  const pdf = buildTransactionPdf(rows, summary, {
    accountName: "Bank Koperasi *596",
    filters: ["Tipe: Deposit", "Dari: 2026-08-01"],
  });
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const content = bytes.toString("latin1");

  assert.equal(content.slice(0, 8), "%PDF-1.3");
  assert.ok(content.includes("Laporan Transaksi Koperasi"));
  assert.ok(content.includes("DTSTG0089"));
  assert.ok(pdf.internal.getNumberOfPages() > 1);
});
