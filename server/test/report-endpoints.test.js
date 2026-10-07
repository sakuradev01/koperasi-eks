import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBalanceSheetSplits,
  exportBalanceSheetCsv,
  exportProfitLossCsv,
  filterBalanceSheet,
  filterProfitLoss,
  getBalanceSheet,
  getProfitLoss,
} from "../src/controllers/admin/reports.controller.js";
import { AccountingTransaction } from "../src/models/accountingTransaction.model.js";
import { CoaAccount } from "../src/models/coaAccount.model.js";
import { CoaMaster } from "../src/models/coaMaster.model.js";
import { CoaSubmenu } from "../src/models/coaSubmenu.model.js";
import { TransactionSplit } from "../src/models/transactionSplit.model.js";

const date = (value) => new Date(`${value}T12:00:00.000Z`);
const masters = [
  { _id: "m-assets", masterName: "Assets", isActive: true },
  { _id: "m-liabilities", masterName: "Liabilities", isActive: true },
  { _id: "m-income", masterName: "Income", isActive: true },
  { _id: "m-expenses", masterName: "Expenses", isActive: true },
  { _id: "m-equity", masterName: "Equity", isActive: true },
];
const submenus = [
  { _id: "s-cash", masterId: "m-assets", submenuName: "Cash and Bank", isActive: true },
  { _id: "s-ar", masterId: "m-assets", submenuName: "Accounts Receivable", isActive: true },
  { _id: "s-liability", masterId: "m-liabilities", submenuName: "Accounts Payable", isActive: true },
  { _id: "s-income", masterId: "m-income", submenuName: "Income", isActive: true },
  { _id: "s-expense", masterId: "m-expenses", submenuName: "Operating Expense", isActive: true },
  { _id: "s-equity", masterId: "m-equity", submenuName: "Equity", isActive: true },
];
const accounts = [
  { _id: "a-bank", accountCode: "1000", accountName: "Bank", submenuId: "s-cash", balance: 0, isActive: true },
  { _id: "a-ar", accountCode: "1200", accountName: "Receivable", submenuId: "s-ar", balance: 0, isActive: true },
  { _id: "a-liability", accountCode: "2000", accountName: "Payable", submenuId: "s-liability", balance: 0, isActive: true },
  { _id: "a-income", accountCode: "4000", accountName: "Service Income", submenuId: "s-income", balance: 0, isActive: true },
  { _id: "a-expense", accountCode: "6000", accountName: "Operating Expense", submenuId: "s-expense", balance: 0, isActive: true },
  { _id: "a-equity", accountCode: "3000", accountName: "Capital", submenuId: "s-equity", balance: 0, isActive: true },
];
const transactions = [
  { _id: "t-2024-income", transactionDate: date("2024-02-01"), transactionType: "Deposit", amount: 100, accountId: "a-bank", categoryId: "a-income", categoryType: "account", isSplit: false },
  { _id: "t-2024-expense", transactionDate: date("2024-03-01"), transactionType: "Withdrawal", amount: 30, accountId: "a-bank", categoryId: "a-expense", categoryType: "account", isSplit: false },
  { _id: "t-2025-income", transactionDate: date("2025-04-01"), transactionType: "Deposit", amount: 500, accountId: "a-bank", categoryId: "a-income", categoryType: "account", isSplit: false },
  { _id: "t-2027-income", transactionDate: date("2027-05-01"), transactionType: "Deposit", amount: 700, accountId: "a-bank", categoryId: "a-income", categoryType: "account", isSplit: false },
];

function query(value) {
  return {
    sort() { return this; },
    select() { return this; },
    lean() { return Promise.resolve(value); },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(value) { this.body = value; return this; },
  };
}

function mockMethod(t, model, name, implementation) {
  const original = model[name];
  model[name] = implementation;
  t.after(() => { model[name] = original; });
}

function withReadOnlyLedgerMocks(t) {
  mockMethod(t, CoaMaster, "find", () => query(masters));
  mockMethod(t, CoaSubmenu, "find", () => query(submenus));
  mockMethod(t, CoaAccount, "find", () => query(accounts));
  mockMethod(t, AccountingTransaction, "aggregate", async () => [{ _id: 2027 }, { _id: 2025 }, { _id: 2024 }]);
  mockMethod(t, AccountingTransaction, "find", (filter = {}) => {
    const cutoff = filter.transactionDate?.$lte;
    return query(cutoff ? transactions.filter((transaction) => transaction.transactionDate <= cutoff) : transactions);
  });
  mockMethod(t, TransactionSplit, "find", () => query([]));
}

test("GET, filter, and CSV export all apply the selected Profit & Loss year", async (t) => {
  withReadOnlyLedgerMocks(t);

  const getResponse = response();
  await getProfitLoss({ query: { year: "2024" } }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.data.startDate, "2024-01-01");
  assert.equal(getResponse.body.data.endDate, "2024-12-31");
  assert.equal(getResponse.body.data.reportData.total_income, 100);
  assert.equal(getResponse.body.data.reportData.total_operating_expenses, 30);

  const filterResponse = response();
  await filterProfitLoss({ body: { year: "2024" } }, filterResponse);
  assert.equal(filterResponse.body.data.startDate, "2024-01-01");
  assert.equal(filterResponse.body.data.reportData.net_profit, 70);

  const exportResponse = response();
  await exportProfitLossCsv({ query: { year: "2024" } }, exportResponse);
  assert.equal(exportResponse.statusCode, 200);
  assert.match(exportResponse.body, /Period: 2024-01-01 to 2024-12-31/);
  assert.match(exportResponse.body, /Net Profit,70\.00/);
});

test("Profit & Loss comparison loads transactions through the later comparison date", async (t) => {
  withReadOnlyLedgerMocks(t);

  const result = response();
  await getProfitLoss({
    query: {
      year: "2024",
      compare_enabled: "true",
      compare_period: "custom",
      compare_start_date: "2027-01-01",
      compare_end_date: "2027-12-31",
    },
  }, result);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.reportData.total_income, 100);
  assert.equal(result.body.data.comparisonData.total_income, 700);
  assert.deepEqual(result.body.data.comparisonDates, { start: "2027-01-01", end: "2027-12-31" });
});

test("GET, filter, and CSV export resolve Balance Sheet year to a dated snapshot", async (t) => {
  withReadOnlyLedgerMocks(t);

  const getResponse = response();
  await getBalanceSheet({ query: { year: "2024" } }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.data.asOfDate, "2024-12-31");
  assert.equal(getResponse.body.data.reportData.total_assets, 70);
  assert.equal(getResponse.body.data.reportData.total_equity, 70);
  assert.equal(getResponse.body.data.reportData.is_balanced, true);

  const filterResponse = response();
  await filterBalanceSheet({ body: { year: "2024" } }, filterResponse);
  assert.equal(filterResponse.body.data.asOfDate, "2024-12-31");
  assert.equal(filterResponse.body.data.reportData.total_assets, 70);

  const exportResponse = response();
  await exportBalanceSheetCsv({ query: { year: "2024" } }, exportResponse);
  assert.equal(exportResponse.statusCode, 200);
  assert.match(exportResponse.body, /As of: 2024-12-31/);
});

test("report endpoints reject invalid date ranges with a client error", async (t) => {
  withReadOnlyLedgerMocks(t);

  const result = response();
  await getProfitLoss({ query: { start_date: "2024-02-30", end_date: "2024-03-01" } }, result);

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.success, false);
});

test("split diagnostics expose cent mismatches and historical inactive COA references", async (t) => {
  const splitTransaction = {
    _id: "split-parent",
    transactionDate: date("2026-08-01"),
    description: "Split ledger entry",
    transactionType: "Withdrawal",
    amount: 100,
    accountId: "cash-account",
    isSplit: true,
  };
  const splits = [
    { transactionId: "split-parent", amount: 99.99, categoryId: "inactive-coa", categoryType: "account" },
  ];
  mockMethod(t, AccountingTransaction, "find", () => query([splitTransaction]));
  mockMethod(t, TransactionSplit, "find", () => query(splits));
  mockMethod(t, CoaAccount, "find", (filter) => {
    const ids = filter._id.$in;
    return query(ids.includes("cash-account")
      ? [{ _id: "cash-account", accountName: "Bank", isActive: true }]
      : [{ _id: "inactive-coa", accountName: "Legacy Category", isActive: false }]);
  });

  const result = response();
  await checkBalanceSheetSplits({}, result);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.count, 2);
  assert.ok(result.body.data.some((issue) => issue.issue_type === "amount_mismatch" && issue.remaining_unallocated === 0.01));
  assert.ok(result.body.data.some((issue) => issue.issue_type === "inactive_category" && issue.category_name === "Legacy Category"));
});
