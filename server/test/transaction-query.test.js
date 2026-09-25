import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTransactionListFilter,
  buildTransactionSort,
  buildRunningBalanceHistoryFilter,
  normalizeTransactionPagination,
} from "../src/utils/transactionQuery.js";
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

test("builds transaction filters that apply across the full matching dataset", () => {
  const filter = buildTransactionListFilter({
    account: "selected-account",
    accountFilterActive: true,
    accountIds: ["named-account"],
    transactionType: "Deposit",
    description: "refund",
    reviewed: false,
    amountMin: "100",
    amountMax: "500",
    dateFrom: "2026-01-01",
    categoryClauses: [{ categoryId: "category-1", categoryType: "account" }],
    splitTransactionIds: ["split-parent-1"],
    categoryFilterActive: true,
    searchClauses: [{ senderName: /samit/i }],
  });
  const conditions = filter.$and || [filter];

  assert.ok(conditions.some((condition) => condition.accountId === "selected-account"));
  assert.ok(conditions.some((condition) => condition.accountId?.$in?.[0] === "named-account"));
  assert.ok(conditions.some((condition) => condition.transactionType === "Deposit"));
  assert.ok(conditions.some((condition) => condition.description instanceof RegExp));
  assert.ok(conditions.some((condition) => condition.reviewed === false));
  assert.ok(conditions.some((condition) => condition.amount?.$gte === 100 && condition.amount?.$lte === 500));
  assert.ok(conditions.some((condition) => condition.transactionDate?.$gte instanceof Date));
  assert.ok(conditions.some((condition) => condition.$or?.some((clause) => clause.categoryId === "category-1")));
  assert.ok(conditions.some((condition) => condition.$or?.some((clause) => clause.senderName instanceof RegExp)));
});

test("keeps report category and page category filters as separate requirements", () => {
  const filter = buildTransactionListFilter({
    categoryClauses: [{ categoryId: "report-category", categoryType: "account" }],
    categoryFilterActive: true,
    additionalCategoryFilters: [
      {
        clauses: [{ categoryId: "page-category", categoryType: "submenu" }],
        splitTransactionIds: ["page-split-parent"],
        active: true,
      },
    ],
  });
  const categoryGroups = (filter.$and || [filter]).filter((condition) => Array.isArray(condition.$or));

  assert.equal(categoryGroups.length, 2);
  assert.ok(categoryGroups[0].$or.some((clause) => clause.categoryId === "report-category"));
  assert.ok(categoryGroups[1].$or.some((clause) => clause.categoryId === "page-category"));
  assert.ok(categoryGroups[1].$or.some((clause) => clause._id?.$in?.includes("page-split-parent")));
});

test("defaults transaction pagination to ten and supports only requested sizes", () => {
  assert.deepEqual(normalizeTransactionPagination("1", undefined), {
    page: 1,
    limit: 10,
    isAll: false,
  });
  assert.deepEqual(normalizeTransactionPagination("3", "25"), {
    page: 3,
    limit: 25,
    isAll: false,
  });
  assert.deepEqual(normalizeTransactionPagination("invalid", "all"), {
    page: 1,
    limit: null,
    isAll: true,
  });
  assert.equal(normalizeTransactionPagination("1", "500").limit, 10);
});

test("uses a stable database sort and falls back safely for unknown sort keys", () => {
  assert.deepEqual(buildTransactionSort("amount_asc"), {
    amount: 1,
    transactionDate: -1,
    createdAt: -1,
    _id: -1,
  });
  assert.deepEqual(buildTransactionSort("unknown"), {
    transactionDate: -1,
    createdAt: -1,
    _id: -1,
  });
});

test("limits running-balance history to all transactions on or after the oldest visible date", () => {
  const filter = buildRunningBalanceHistoryFilter(
    ["account-1", "account-2"],
    [
      { transactionDate: "2026-08-12T14:00:00.000Z" },
      { transactionDate: "2026-08-10T09:00:00.000Z" },
    ],
  );

  assert.deepEqual(filter, {
    accountId: { $in: ["account-1", "account-2"] },
    transactionDate: { $gte: new Date("2026-08-10T09:00:00.000Z") },
  });
  assert.deepEqual(buildRunningBalanceHistoryFilter(["account-1"], []), null);
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
