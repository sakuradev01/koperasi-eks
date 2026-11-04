import test from "node:test";
import assert from "node:assert/strict";
import { buildTransactionAccountOptions } from "../src/utils/transactionAccountOptions.js";

test("builds transaction account choices from accounts across all COA groups", () => {
  const options = buildTransactionAccountOptions([
    { type: "master", name: "Assets" },
    { type: "submenu", name: "Bank Accounts", masterName: "Assets" },
    { type: "account", id: "cash", name: "Bank Koperasi", code: "1010", masterName: "Assets", submenuName: "Bank Accounts", currency: "IDR", balance: 2500 },
    { type: "master", name: "Income" },
    { type: "submenu", name: "Other Income", masterName: "Income" },
    { type: "account", id: "interest", name: "Pendapatan Bunga", code: "4010", masterName: "Income", submenuName: "Other Income", currency: "IDR", balance: 1000 },
    { type: "master", name: "Expenses" },
    { type: "submenu", name: "Operating Expense", masterName: "Expenses" },
    { type: "account", id: "rent", name: "Beban Sewa", code: "5010", masterName: "Expenses", submenuName: "Operating Expense", currency: "IDR", balance: 0 },
    { type: "master", name: "Liabilities" },
    { type: "submenu", name: "Other Short-Term Liability", masterName: "Liabilities" },
    { type: "account", id: "payable", name: "Utang Usaha", code: "2010", masterName: "Liabilities", submenuName: "Other Short-Term Liability", currency: "IDR", balance: 0 },
    { type: "master", name: "Equity" },
    { type: "submenu", name: "Equity", masterName: "Equity" },
    { type: "account", id: "equity", name: "Modal Anggota", code: "3010", masterName: "Equity", submenuName: "Equity", currency: "JPY", balance: 500 },
  ]);

  assert.deepEqual(options.map(({ label, items }) => [label, items.map(({ value }) => value)]), [
    ["Assets · Bank Accounts", ["cash"]],
    ["Income · Other Income", ["interest"]],
    ["Expenses · Operating Expense", ["rent"]],
    ["Liabilities · Other Short-Term Liability", ["payable"]],
    ["Equity · Equity", ["equity"]],
  ]);
  assert.equal(options[1].items[0].label, "Pendapatan Bunga (4010)");
  assert.equal(options[1].items[0].currency, "IDR");
  assert.equal(options[4].items[0].currency, "JPY");
});

test("does not expose COA master or submenu rows as transaction accounts", () => {
  const options = buildTransactionAccountOptions([
    { type: "master", name: "Assets" },
    { type: "submenu", name: "Cash and Bank", masterName: "Assets" },
  ]);

  assert.deepEqual(options, []);
});
