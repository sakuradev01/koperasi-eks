import test from "node:test";
import assert from "node:assert/strict";

const loadUseCase = async () => {
  const module = await import(
    "../src/modules/invoice-projections/application/getInvoiceProjectionReport.js"
  ).catch(() => null);
  assert.ok(
    module?.createGetInvoiceProjectionReport,
    "invoice projection report use case should be available",
  );
  return module.createGetInvoiceProjectionReport;
};

test("loads report invoices through the repository and returns available years", async () => {
  const createUseCase = await loadUseCase();
  let requestedFilters;
  const useCase = createUseCase({
    now: () => new Date("2026-10-30T04:00:00.000Z"),
    repository: {
      findReportInvoices: async (filters) => {
        requestedFilters = filters;
        return [];
      },
      listAvailableYears: async () => [2024, 2026],
    },
  });

  const report = await useCase({ mode: "yearly", fromYear: "2026", toYear: "2026" });

  assert.equal(requestedFilters.startYear, 2026);
  assert.equal(requestedFilters.endYear, 2026);
  assert.deepEqual(report.availableYears, [2024, 2026]);
  assert.equal(report.mode, "yearly");
});

test("rejects invalid filters before querying invoice data", async () => {
  const createUseCase = await loadUseCase();
  let repositoryCalls = 0;
  const useCase = createUseCase({
    repository: {
      findReportInvoices: async () => { repositoryCalls += 1; return []; },
      listAvailableYears: async () => { repositoryCalls += 1; return []; },
    },
  });

  await assert.rejects(useCase({ mode: "monthly", startDate: "invalid" }), /tanggal/i);
  await assert.rejects(
    useCase({ mode: "monthly", invoiceStatuses: "sent,invalid" }),
    /status invoice/i,
  );
  assert.equal(repositoryCalls, 0);
});

test("passes status filters to both report queries", async () => {
  const createUseCase = await loadUseCase();
  let reportFilters;
  let yearFilters;
  const useCase = createUseCase({
    now: () => new Date("2026-10-30T04:00:00.000Z"),
    repository: {
      findReportInvoices: async (filters) => { reportFilters = filters; return []; },
      listAvailableYears: async (filters) => { yearFilters = filters; return []; },
    },
  });

  await useCase({ mode: "yearly", invoiceStatuses: "draft,sent" });

  assert.deepEqual(reportFilters.invoiceStatuses, ["draft", "sent"]);
  assert.deepEqual(yearFilters.invoiceStatuses, ["draft", "sent"]);
});
