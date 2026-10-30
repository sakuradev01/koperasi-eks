import test from "node:test";
import assert from "node:assert/strict";
import { buildYearlyInvoiceMonthlyTotals } from "../src/utils/invoiceProjectionTotals.js";

test("calculates annual monthly totals separately for each currency", () => {
  const periods = [{ key: "2026-01" }, { key: "2026-02" }];
  const rows = [
    { currency: "IDR", months: { "2026-01": 1_000_000, "2026-02": 2_000_000 } },
    { currency: "IDR", months: { "2026-01": 500_000, "2026-02": 0 } },
    { currency: "JPY", months: { "2026-01": 10_000, "2026-02": 20_000 } },
  ];

  assert.deepEqual(buildYearlyInvoiceMonthlyTotals(rows, periods), [
    {
      currency: "IDR",
      totalsByPeriod: { "2026-01": 1_500_000, "2026-02": 2_000_000 },
      totalOutstanding: 3_500_000,
    },
    {
      currency: "JPY",
      totalsByPeriod: { "2026-01": 10_000, "2026-02": 20_000 },
      totalOutstanding: 30_000,
    },
  ]);
});

test("uses IDR for rows without a currency and returns no totals for empty data", () => {
  assert.deepEqual(buildYearlyInvoiceMonthlyTotals([
    { months: { "2026-01": 250 } },
  ], [{ key: "2026-01" }]), [
    {
      currency: "IDR",
      totalsByPeriod: { "2026-01": 250 },
      totalOutstanding: 250,
    },
  ]);
  assert.deepEqual(buildYearlyInvoiceMonthlyTotals([], [{ key: "2026-01" }]), []);
});
