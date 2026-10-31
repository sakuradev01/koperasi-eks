import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvailableInvoiceYearsMatch,
  buildInvoiceProjectionQuery,
} from "../src/modules/invoice-projections/infrastructure/mongooseInvoiceProjectionReportRepository.js";

test("invoice status selection includes raw Draft invoices so effective statuses can be evaluated", () => {
  const filters = {
    mode: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    invoiceStatuses: ["partial"],
  };

  const query = buildInvoiceProjectionQuery(filters);
  const yearMatch = buildAvailableInvoiceYearsMatch(filters);

  assert.equal(Object.hasOwn(query, "status"), false);
  assert.equal(Object.hasOwn(yearMatch, "status"), false);
  assert.equal(query.$or.length, 2);
  assert.deepEqual(yearMatch["projections.estimateDate"], { $type: "date" });
});

test("no selected invoice status preserves raw Draft exclusion in report queries", () => {
  const filters = {
    mode: "yearly",
    startYear: 2026,
    endYear: 2026,
    invoiceStatuses: [],
  };

  assert.deepEqual(buildInvoiceProjectionQuery(filters).status, { $ne: "draft" });
  assert.deepEqual(buildAvailableInvoiceYearsMatch(filters).status, { $ne: "draft" });
});
