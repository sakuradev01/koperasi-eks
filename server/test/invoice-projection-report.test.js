import test from "node:test";
import assert from "node:assert/strict";

const loadReportBuilder = async () => {
  const module = await import(
    "../src/modules/invoice-projections/application/buildInvoiceProjectionReport.js"
  ).catch(() => null);
  assert.ok(
    module?.buildInvoiceProjectionReport,
    "invoice projection report builder should be available",
  );
  return module.buildInvoiceProjectionReport;
};

const invoices = [
  {
    _id: "invoice-jpy",
    invoiceNumber: "PDD2610002",
    customerSnapshot: { name: "Puspaini" },
    currency: "JPY",
    status: "sent",
    total: 300,
    totalPaid: 250,
    dueDate: "2026-02-28T00:00:00.000Z",
    projections: [
      { _id: "p1", description: "Cicilan 1", estimateDate: "2026-01-10T00:00:00.000Z", amount: 100 },
      { _id: "p2", description: "Cicilan 2", estimateDate: "2026-02-10T00:00:00.000Z", amount: 200 },
    ],
    payments: [
      {
        _id: "pay-batch",
        paymentDate: "2026-01-15T00:00:00.000Z",
        amount: 250,
        coveredProjectionIds: ["p1", "p2"],
        coveredProjectionBreakdown: [
          { projectionId: "p1", projectionIndex: 1, amount: 100 },
          { projectionId: "p2", projectionIndex: 2, amount: 150 },
        ],
      },
      { _id: "pay-unallocated", paymentDate: "2026-01-20T00:00:00.000Z", amount: 25 },
      { _id: "pay-after-cutoff", paymentDate: "2027-01-05T00:00:00.000Z", amount: 50, projectionId: "p2" },
    ],
  },
  {
    _id: "invoice-idr",
    invoiceNumber: "A2601001",
    customerSnapshot: { name: "Anggitia" },
    currency: "IDR",
    status: "sent",
    total: 50,
    totalPaid: 0,
    projections: [
      { _id: "p-idr", description: "Biaya administrasi", estimateDate: "2026-01-20T00:00:00.000Z", amount: 50 },
    ],
    payments: [],
  },
  {
    _id: "invoice-draft",
    invoiceNumber: "DRAFT-1",
    customerSnapshot: { name: "Draft" },
    currency: "IDR",
    status: "draft",
    total: 900,
    totalPaid: 0,
    projections: [
      { _id: "p-draft", estimateDate: "2026-01-20T00:00:00.000Z", amount: 900 },
    ],
    payments: [],
  },
];

const paidInvoice = {
  _id: "invoice-paid",
  invoiceNumber: "PAID-1",
  customerSnapshot: { name: "Sudah Lunas" },
  currency: "IDR",
  status: "paid",
  dueDate: "2026-01-31T00:00:00.000Z",
  total: 75,
  totalPaid: 75,
  projections: [
    { _id: "p-paid", estimateDate: "2026-01-25T00:00:00.000Z", amount: 75 },
  ],
  payments: [
    { _id: "pay-paid", paymentDate: "2026-01-24T00:00:00.000Z", amount: 75, projectionId: "p-paid" },
  ],
};

const invoicesWithPaid = [...invoices, paidInvoice];

test("monthly activity report separates scheduled projections, actual payment dates, and unallocated money by currency", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoices, {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    asOfDate: "2026-01-31T23:59:59.999Z",
  });

  const batchProjection = report.rows.find((row) => row.projectionId === "p1");
  const earlyPaymentProjection = report.rows.find((row) => row.projectionId === "p2");
  const unallocatedPayment = report.rows.find((row) => row.rowType === "unallocated");

  assert.equal(report.mode, "monthly");
  assert.ok(batchProjection);
  assert.equal(batchProjection.projectedAmount, 100);
  assert.equal(batchProjection.realizedAmount, 100);
  assert.equal(batchProjection.status, "Paid");
  assert.ok(earlyPaymentProjection, "early payment remains visible in its actual payment month");
  assert.equal(earlyPaymentProjection.projectedAmount, 0);
  assert.equal(earlyPaymentProjection.realizedAmount, 150);
  assert.equal(earlyPaymentProjection.status, "Partial");
  assert.equal(unallocatedPayment.realizedAmount, 25);
  assert.equal(report.rows.some((row) => row.invoiceNumber === "DRAFT-1"), false);
  assert.deepEqual(report.summary.byCurrency, [
    { currency: "IDR", totalProjection: 50, totalRealized: 0, difference: 50, totalUnallocated: 0 },
    { currency: "JPY", totalProjection: 100, totalRealized: 275, difference: -175, totalUnallocated: 25 },
  ]);
});

test("year matrix shows scheduled outstanding balance after cutoff and never nets different currencies", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoices, {
    mode: "yearly",
    startYear: 2026,
    endYear: 2026,
    asOfDate: "2026-03-01T23:59:59.999Z",
  });

  const jpyRow = report.rows.find((row) => row.invoiceNumber === "PDD2610002");
  const idrRow = report.rows.find((row) => row.invoiceNumber === "A2601001");

  assert.equal(report.periods.length, 12);
  assert.equal(jpyRow.months["2026-01"], 0);
  assert.equal(jpyRow.months["2026-02"], 50);
  assert.equal(jpyRow.totalOutstanding, 50);
  assert.equal(idrRow.totalOutstanding, 50);
  assert.deepEqual(report.summary.byCurrency, [
    { currency: "IDR", totalProjection: 50, totalOutstanding: 50, totalUnallocated: 0 },
    { currency: "JPY", totalProjection: 300, totalOutstanding: 50, totalUnallocated: 25 },
  ]);
});

test("year matrix does not count payments posted after its as-of date", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoices, {
    mode: "yearly",
    startYear: 2026,
    endYear: 2026,
    asOfDate: "2026-12-31T23:59:59.999Z",
  });

  const jpyRow = report.rows.find((row) => row.invoiceNumber === "PDD2610002");
  assert.equal(jpyRow.months["2026-02"], 50);
});

test("monthly status filter narrows rows and summary to the selected status", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoices, {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    asOfDate: "2026-01-31T23:59:59.999Z",
    status: "paid",
  });

  assert.ok(report.rows.length > 0);
  assert.ok(report.rows.every((row) => row.status === "Paid"));
  assert.equal(report.rows.some((row) => row.rowType === "unallocated"), false);
  assert.deepEqual(report.summary.byCurrency, [
    { currency: "JPY", totalProjection: 100, totalRealized: 100, difference: 0, totalUnallocated: 0 },
  ]);
});

test("overall invoice status defaults to non-Draft and preserves monthly projection status", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoicesWithPaid, {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    asOfDate: "2026-01-31T23:59:59.999Z",
  });

  assert.equal(report.rows.some((row) => row.invoiceNumber === "DRAFT-1"), false);
  const paidProjection = report.rows.find((row) => row.invoiceNumber === "PAID-1");
  assert.equal(paidProjection.invoiceStatus, "paid");
  assert.equal(paidProjection.status, "Paid");
});

test("monthly invoice status selection uses OR and can explicitly include Draft", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoicesWithPaid, {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    asOfDate: "2026-01-31T23:59:59.999Z",
    invoiceStatuses: ["draft", "paid"],
  });

  assert.ok(report.rows.some((row) => row.invoiceNumber === "DRAFT-1"));
  assert.ok(report.rows.some((row) => row.invoiceNumber === "PAID-1"));
  assert.ok(report.rows.every((row) => ["draft", "paid"].includes(row.invoiceStatus)));
  assert.ok(report.rows.every((row) => row.status !== row.invoiceStatus));
});

test("selected Partial includes a raw Draft invoice with a payment by effective invoice status", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const rawDraftWithPayment = {
    _id: "draft-partial",
    invoiceNumber: "DRAFT-PARTIAL",
    customerSnapshot: { name: "Draft Partial" },
    currency: "IDR",
    status: "draft",
    dueDate: "2026-02-28T00:00:00.000Z",
    total: 100,
    totalPaid: 25,
    projections: [
      { _id: "p-draft-partial", estimateDate: "2026-01-20T00:00:00.000Z", amount: 100 },
    ],
    payments: [
      { _id: "pay-draft-partial", paymentDate: "2026-01-21T00:00:00.000Z", amount: 25, projectionId: "p-draft-partial" },
    ],
  };

  const filters = {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    asOfDate: "2026-01-31T23:59:59.999Z",
  };
  const defaultReport = buildInvoiceProjectionReport([rawDraftWithPayment], filters);
  const partialReport = buildInvoiceProjectionReport([rawDraftWithPayment], {
    ...filters,
    invoiceStatuses: ["partial"],
  });

  assert.equal(defaultReport.rows.length, 0);
  assert.equal(partialReport.rows.length, 1);
  assert.equal(partialReport.rows[0].invoiceStatus, "partial");
  assert.equal(partialReport.rows[0].status, "Partial");
});

test("yearly status selection can include paid invoices with zero outstanding without changing default", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const filters = {
    mode: "yearly",
    startYear: 2026,
    endYear: 2026,
    asOfDate: "2026-03-01T23:59:59.999Z",
  };
  const defaultReport = buildInvoiceProjectionReport(invoicesWithPaid, filters);
  const selectedReport = buildInvoiceProjectionReport(invoicesWithPaid, {
    ...filters,
    invoiceStatuses: ["paid"],
  });

  assert.equal(defaultReport.rows.some((row) => row.invoiceNumber === "PAID-1"), false);
  assert.equal(defaultReport.rows.some((row) => row.invoiceNumber === "DRAFT-1"), false);
  assert.deepEqual(selectedReport.rows.map((row) => row.invoiceNumber), ["PAID-1"]);
  assert.equal(selectedReport.rows[0].invoiceStatus, "paid");
  assert.equal(selectedReport.rows[0].totalOutstanding, 0);
});

test("yearly report can explicitly include Draft invoices and labels overall status separately", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport(invoices, {
    mode: "yearly",
    startYear: 2026,
    endYear: 2026,
    asOfDate: "2026-03-01T23:59:59.999Z",
    invoiceStatuses: ["draft"],
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].invoiceNumber, "DRAFT-1");
  assert.equal(report.rows[0].invoiceStatus, "draft");
  assert.equal(report.rows[0].status, "draft");
});
