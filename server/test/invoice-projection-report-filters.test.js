import test from "node:test";
import assert from "node:assert/strict";

const loadParser = async () => {
  const module = await import(
    "../src/modules/invoice-projections/application/parseReportFilters.js"
  ).catch(() => null);
  assert.ok(
    module?.parseInvoiceProjectionReportFilters,
    "invoice projection report filter parser should be available",
  );
  return module.parseInvoiceProjectionReportFilters;
};

test("defaults to the current Jakarta calendar month and caps as-of at now", async () => {
  const parseFilters = await loadParser();
  const filters = parseFilters(
    { mode: "monthly" },
    new Date("2026-10-30T04:00:00.000Z"),
  );

  assert.equal(filters.startDate, "2026-10-01");
  assert.equal(filters.endDate, "2026-10-31");
  assert.equal(filters.asOfDate, "2026-10-30T04:00:00.000Z");
  assert.equal(filters.status, "all");
});

test("normalizes reversed yearly bounds and rejects ranges wider than ten years", async () => {
  const parseFilters = await loadParser();
  const filters = parseFilters(
    { mode: "yearly", fromYear: "2027", toYear: "2026" },
    new Date("2026-10-30T00:00:00.000Z"),
  );

  assert.equal(filters.startYear, 2026);
  assert.equal(filters.endYear, 2027);
  assert.throws(
    () => parseFilters({ mode: "yearly", fromYear: "2000", toYear: "2020" }),
    /maksimal 10 tahun/i,
  );
});

test("rejects invalid date ranges and unsupported status filters", async () => {
  const parseFilters = await loadParser();

  assert.throws(
    () => parseFilters({ mode: "monthly", startDate: "2026-02-30", endDate: "2026-03-01" }),
    /tanggal/i,
  );
  assert.throws(
    () => parseFilters({ mode: "monthly", startDate: "2026-03-01", endDate: "2026-02-01" }),
    /tanggal mulai/i,
  );
  assert.throws(
    () => parseFilters({ mode: "monthly", status: "unknown" }),
    /status/i,
  );
});
