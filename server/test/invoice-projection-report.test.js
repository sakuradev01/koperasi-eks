import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

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

test("monthly projection report assigns early allocations to the scheduled installment period", async () => {
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
  assert.equal(earlyPaymentProjection, undefined, "a February installment is not included in the January projection period");
  assert.equal(unallocatedPayment.realizedAmount, 25);
  assert.equal(report.rows.some((row) => row.invoiceNumber === "DRAFT-1"), false);
  assert.deepEqual(report.summary.byCurrency, [
    { currency: "IDR", totalProjection: 50, totalRealized: 0, totalAdvanceReceived: 0, difference: 50, totalUnallocated: 0 },
    { currency: "JPY", totalProjection: 100, totalRealized: 100, totalAdvanceReceived: 0, difference: 0, totalUnallocated: 25 },
  ]);

  const februaryReport = buildInvoiceProjectionReport(invoices, {
    mode: "monthly",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    asOfDate: "2026-02-28T23:59:59.999Z",
  });
  const februaryInstallment = februaryReport.rows.find((row) => row.projectionId === "p2");
  assert.equal(februaryInstallment.realizedAmount, 150);
  assert.equal(februaryInstallment.difference, 50);
  assert.deepEqual(februaryInstallment.paymentDates, ["2026-01-15"]);
});

test("monthly report groups a batched early payment under due installments and exposes each allocation", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const projections = [
    { _id: "p1", description: "Cicilan 1", estimateDate: "2026-06-12T00:00:00.000Z", amount: 3_053_858 },
    { _id: "p2", description: "Cicilan 2", estimateDate: "2026-07-12T00:00:00.000Z", amount: 3_242_857 },
    { _id: "p3", description: "Cicilan 3", estimateDate: "2026-08-12T00:00:00.000Z", amount: 3_242_857 },
    { _id: "p4", description: "Cicilan 4", estimateDate: "2026-09-12T00:00:00.000Z", amount: 3_242_857 },
    { _id: "p5", description: "Cicilan 5", estimateDate: "2026-10-12T00:00:00.000Z", amount: 3_242_857 },
    { _id: "p6", description: "Cicilan 6", estimateDate: "2026-11-12T00:00:00.000Z", amount: 3_242_857 },
    { _id: "p7", description: "Cicilan 7", estimateDate: "2026-12-12T00:00:00.000Z", amount: 3_242_857 },
  ];
  const report = buildInvoiceProjectionReport([{
    _id: "invoice-batch",
    invoiceNumber: "DTSTG2506007",
    customerSnapshot: { name: "HAMIM ILZAMI" },
    currency: "IDR",
    status: "paid",
    total: 22_511_000,
    totalPaid: 22_511_000,
    projections,
    payments: [
      { _id: "pay-1", paymentDate: "2026-06-12T00:00:00.000Z", amount: 3_053_858, projectionIndex: 1 },
      { _id: "pay-2", paymentDate: "2026-07-12T00:00:00.000Z", amount: 3_242_857, projectionIndex: 2 },
      { _id: "pay-3", paymentDate: "2026-08-12T00:00:00.000Z", amount: 3_242_857, projectionIndex: 3 },
      {
        _id: "pay-batch",
        paymentDate: "2026-08-24T00:00:00.000Z",
        amount: 12_971_428,
        coveredProjectionIds: ["p4", "p5", "p6", "p7"],
        coveredProjectionBreakdown: projections.slice(3).map((projection, index) => ({
        projectionId: projection._id,
        projectionIndex: index + 4,
        amount: 3_242_857,
      })),
      },
    ],
  }], {
    mode: "monthly",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    asOfDate: "2026-08-31T23:59:59.999Z",
  });

  assert.deepEqual(report.rows.map((row) => row.projectionIndex), [4, 5, 6, 7]);
  assert.equal(report.summary.byCurrency[0].totalProjection, 12_971_428);
  assert.equal(report.summary.byCurrency[0].totalRealized, 12_971_428);
  assert.equal(report.summary.byCurrency[0].totalAdvanceReceived, 12_971_428);
  assert.deepEqual(
    report.rows.map((row) => row.periodPaymentDetails[0].daysEarly),
    [19, 49, 80, 110],
  );
  assert.ok(report.rows.every((row) => row.periodPaymentDetails[0].transferAmount === 12_971_428));
  assert.ok(report.rows.every((row) => row.periodPaymentDetails[0].coveredProjectionLabel === "Cicilan 4–7"));
  assert.equal(
    report.rows.reduce((sum, row) => sum + row.realizedAmount, 0),
    12_971_428,
    "the one transfer must still reconcile to the four projection-period allocations",
  );
});

test("monthly projection realization follows the covered installment even when paid months early", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport([{
    _id: "invoice-hamim",
    invoiceNumber: "DTSTG2506007",
    customerSnapshot: { name: "HAMIM ILZAMI" },
    currency: "IDR",
    status: "paid",
    total: 3_242_857,
    totalPaid: 3_242_857,
    projections: [
      { _id: "installment-1", description: "Cicilan 1", estimateDate: "2026-06-12T00:00:00.000Z", amount: 3_242_857 },
      { _id: "installment-2", description: "Cicilan 2", estimateDate: "2026-07-12T00:00:00.000Z", amount: 3_242_857 },
      { _id: "installment-3", description: "Cicilan 3", estimateDate: "2026-08-12T00:00:00.000Z", amount: 3_242_857 },
      { _id: "installment-4", description: "Cicilan 4", estimateDate: "2026-09-12T00:00:00.000Z", amount: 3_242_857 },
      { _id: "installment-5", description: "Cicilan 5", estimateDate: "2026-10-12T00:00:00.000Z", amount: 3_242_857 },
      { _id: "november-installment", description: "Cicilan 6", estimateDate: "2026-11-12T00:00:00.000Z", amount: 3_242_857 },
    ],
    payments: [
      {
        _id: "august-payment",
        paymentDate: "2026-08-24T00:00:00.000Z",
        amount: 3_242_857,
        projectionIndex: 6,
      },
    ],
  }], {
    mode: "monthly",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    asOfDate: "2026-11-13T00:00:00.000Z",
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].projectionDate, "2026-11-12");
  assert.deepEqual(report.rows[0].paymentDates, ["2026-08-24"]);
  assert.equal(report.rows[0].realizedAmount, 3_242_857);
  assert.equal(report.rows[0].earlyRealizedAmount, 3_242_857);
  assert.equal(report.rows[0].difference, 0);
  assert.equal(report.rows[0].status, "Paid");
  assert.equal(report.summary.byCurrency[0].totalRealized, 3_242_857);
  assert.equal(report.summary.byCurrency[0].difference, 0);
});

test("monthly outstanding difference is never negative when an installment is overpaid", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const report = buildInvoiceProjectionReport([{
    _id: "invoice-overpaid",
    invoiceNumber: "OVERPAID-1",
    customerSnapshot: { name: "Overpaid member" },
    currency: "IDR",
    status: "paid",
    total: 100,
    totalPaid: 120,
    projections: [
      { _id: "installment-1", description: "Cicilan 1", estimateDate: "2026-11-12T00:00:00.000Z", amount: 100 },
    ],
    payments: [
      { _id: "payment-1", paymentDate: "2026-08-24T00:00:00.000Z", amount: 120, projectionIndex: 1 },
    ],
  }], {
    mode: "monthly",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    asOfDate: "2026-11-13T00:00:00.000Z",
  });

  assert.equal(report.rows[0].realizedAmount, 120);
  assert.equal(report.rows[0].difference, 0);
  assert.equal(report.rows[0].remainingAmount, 0);
  assert.equal(report.summary.byCurrency[0].difference, 0);
});

test("monthly report safely normalizes Mongo ObjectIds without recursive _id traversal", async () => {
  const buildInvoiceProjectionReport = await loadReportBuilder();
  const projectionId = new mongoose.Types.ObjectId();
  const report = buildInvoiceProjectionReport([{
    _id: new mongoose.Types.ObjectId(),
    invoiceNumber: "OBJECT-ID-1",
    customerSnapshot: { name: "Object ID member" },
    currency: "IDR",
    status: "sent",
    total: 100,
    totalPaid: 100,
    projections: [{
      _id: projectionId,
      estimateDate: "2026-08-12T00:00:00.000Z",
      amount: 100,
    }],
    payments: [{
      _id: new mongoose.Types.ObjectId(),
      paymentDate: "2026-08-12T00:00:00.000Z",
      amount: 100,
      projectionId,
      projectionIndex: 1,
    }],
  }], {
    mode: "monthly",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    asOfDate: "2026-08-31T23:59:59.999Z",
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].invoiceNumber, "OBJECT-ID-1");
  assert.equal(report.rows[0].realizedAmount, 100);
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
    { currency: "JPY", totalProjection: 100, totalRealized: 100, totalAdvanceReceived: 0, difference: 0, totalUnallocated: 0 },
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
