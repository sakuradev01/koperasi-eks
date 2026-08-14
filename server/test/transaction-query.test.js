import test from "node:test";
import assert from "node:assert/strict";
import { buildTransactionListFilter } from "../src/utils/transactionQuery.js";
import { buildTransactionDrilldown } from "../src/utils/transactionDrilldown.js";

test("builds a category/date query for Profit & Loss drill-downs", () => {
  const filter = buildTransactionListFilter({
    account: "cash-account-1",
    dateFrom: "2026-01-01",
    dateTo: "2026-08-14",
    categoryClauses: [
      { categoryId: "coa-account-1", categoryType: "account" },
    ],
    splitTransactionIds: ["split-transaction-1"],
  });

  const expectedFrom = new Date("2026-01-01");
  expectedFrom.setHours(0, 0, 0, 0);
  const expectedTo = new Date("2026-08-14");
  expectedTo.setHours(23, 59, 59, 999);

  assert.equal(filter.accountId, "cash-account-1");
  assert.equal(filter.transactionDate.$gte.toISOString(), expectedFrom.toISOString());
  assert.equal(filter.transactionDate.$lte.toISOString(), expectedTo.toISOString());
  assert.deepEqual(filter.$or, [
    { categoryId: "coa-account-1", categoryType: "account" },
    { _id: { $in: ["split-transaction-1"] } },
  ]);
});

test("keeps an unknown report category from falling back to every transaction", () => {
  const filter = buildTransactionListFilter({
    dateFrom: "2026-01-01",
    dateTo: "2026-08-14",
    categoryFilterActive: true,
  });

  assert.deepEqual(filter.$or, [{ _id: { $in: [] } }]);
});

test("limits a split drill-down to the selected account and amount", () => {
  const result = buildTransactionDrilldown({
    transaction: {
      isSplit: true,
      amount: 1000,
    },
    splits: [
      { categoryId: "selected-account", categoryType: "account", amount: 300 },
      { categoryId: "payment-account", categoryType: "account", amount: 700 },
    ],
    categoryClauses: [
      { categoryId: "selected-account", categoryType: "account" },
    ],
    categoryFilterActive: true,
  });

  assert.equal(result.amount, 300);
  assert.deepEqual(result.splits, [
    { categoryId: "selected-account", categoryType: "account", amount: 300 },
  ]);
});
