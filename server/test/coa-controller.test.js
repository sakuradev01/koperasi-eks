import test from "node:test";
import assert from "node:assert/strict";
import { getAccountsByType } from "../src/controllers/admin/coa.controller.js";
import { AccountingTransaction } from "../src/models/accountingTransaction.model.js";
import { CoaAccount } from "../src/models/coaAccount.model.js";
import { CoaMaster } from "../src/models/coaMaster.model.js";
import { CoaSubmenu } from "../src/models/coaSubmenu.model.js";
import { TransactionSplit } from "../src/models/transactionSplit.model.js";

const masters = [{ _id: "m-assets", masterName: "Assets", isActive: true }];
const submenus = [
  { _id: "s-cash", masterId: "m-assets", submenuName: "Cash and Bank", isActive: true },
  { _id: "s-ar", masterId: "m-assets", submenuName: "Accounts Receivable", isActive: true },
];
const accounts = [
  { _id: "a-bank", accountCode: "1000", accountName: "Bank", submenuId: "s-cash", balance: 0, currency: "Rp", isActive: true },
  { _id: "a-ar", accountCode: "1200", accountName: "Receivable", submenuId: "s-ar", balance: 0, currency: "Rp", isActive: true },
];
const transactions = [
  { _id: "t-cash", transactionDate: new Date("2026-01-01T12:00:00Z"), transactionType: "Deposit", amount: 100, accountId: "a-bank", categoryId: "a-ar", categoryType: "account", isSplit: false },
  { _id: "t-receivable", transactionDate: new Date("2026-01-02T12:00:00Z"), transactionType: "Withdrawal", amount: 40, accountId: "a-bank", categoryId: "a-ar", categoryType: "account", isSplit: false },
];

function query(value) {
  return {
    sort() { return this; },
    select() { return this; },
    lean() { return Promise.resolve(value); },
  };
}

function mockMethod(t, model, name, implementation) {
  const original = model[name];
  model[name] = implementation;
  t.after(() => { model[name] = original; });
}

test("COA endpoint returns derived balances and transaction counts without changing stored balances", async (t) => {
  let transactionFilter;
  mockMethod(t, CoaMaster, "findOne", async (filter) => masters.find((master) => master.masterName === filter.masterName) || null);
  mockMethod(t, CoaSubmenu, "find", async (filter) => submenus.filter((submenu) => String(submenu.masterId) === String(filter.masterId)));
  mockMethod(t, CoaAccount, "countDocuments", async (filter) => accounts.filter((account) => filter.submenuId.$in.includes(account.submenuId)).length);
  mockMethod(t, CoaAccount, "find", (filter) => query(accounts.filter((account) => account.submenuId === filter.submenuId)));
  mockMethod(t, AccountingTransaction, "find", (filter) => {
    transactionFilter = filter;
    return query(transactions);
  });
  mockMethod(t, TransactionSplit, "find", () => query([]));

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await getAccountsByType({ params: { type: "Assets" }, query: {}, body: {} }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.accountsBySubtype["Cash and Bank"].accounts[0].reportBalance, 60);
  assert.equal(res.body.accountsBySubtype["Cash and Bank"].accounts[0].balance, 0);
  assert.equal(res.body.accountsBySubtype["Cash and Bank"].accounts[0].transactionCount, 2);
  assert.equal(res.body.accountsBySubtype["Accounts Receivable"].accounts[0].reportBalance, -60);
  assert.equal(res.body.accountsBySubtype["Accounts Receivable"].accounts[0].transactionCount, 2);
  assert.ok(transactionFilter.$or.some((clause) => clause.accountId?.$in?.includes("a-bank")));
  assert.ok(transactionFilter.$or.some((clause) => clause.categoryId?.$in?.includes("a-ar")));
});
