import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountBalanceSnapshot } from "../src/utils/accountingReportMath.js";

const account = (id, masterName, submenuName, currency = "Rp") => ({
  id,
  accountName: id,
  accountCode: id,
  masterName,
  submenuName,
  submenuId: `submenu-${submenuName}`,
  currency,
  balance: 0,
});

test("COA balances are derived per account without counting split parent value twice", () => {
  const bank = account("bank", "Assets", "Cash and Bank");
  const receivable = account("receivable", "Assets", "Accounts Receivable");
  const income = account("income", "Income", "Income");
  const expense = account("expense", "Expenses", "Payment Processing Fee");
  const transactions = [
    { _id: "loan", transactionType: "Withdrawal", amount: 100, accountId: "bank", categoryId: "receivable", categoryType: "account", isSplit: false },
    { _id: "split-income", transactionType: "Deposit", amount: 50, accountId: "bank", isSplit: true },
    { _id: "split-fee", transactionType: "Withdrawal", amount: 10, accountId: "bank", isSplit: true },
  ];
  const splits = [
    { transactionId: "split-income", categoryId: "income", categoryType: "account", amount: 50 },
    { transactionId: "split-fee", categoryId: "expense", categoryType: "account", amount: 10 },
  ];

  const balances = buildAccountBalanceSnapshot({ accounts: [bank, receivable, income, expense], transactions, splits });

  assert.equal(balances.byAccountId.bank.balance, -60);
  assert.equal(balances.byAccountId.bank.transactionCount, 3);
  assert.equal(balances.byAccountId.receivable.balance, 100);
  assert.equal(balances.byAccountId.income.balance, 50);
  assert.equal(balances.byAccountId.expense.balance, 10);
  assert.equal(balances.bySubmenuId["submenu-Accounts Receivable"].balance, 100);
});

test("COA liability balances are positive on the credit-normal side and negative for debit balances", () => {
  const payable = account("payable", "Liabilities", "Accounts Payable");
  const transactions = [
    { _id: "borrow", transactionType: "Deposit", amount: 100, accountId: "bank", categoryId: "payable", categoryType: "account", isSplit: false },
    { _id: "repayment", transactionType: "Withdrawal", amount: 25, accountId: "bank", categoryId: "payable", categoryType: "account", isSplit: false },
  ];

  const balances = buildAccountBalanceSnapshot({ accounts: [payable], transactions });
  assert.equal(balances.byAccountId.payable.balance, 75);
});

test("transfers between cash accounts add the counter-entry to the receiving account once", () => {
  const bankA = account("bank-a", "Assets", "Cash and Bank");
  const bankB = account("bank-b", "Assets", "Cash and Bank");
  const transactions = [{
    _id: "bank-transfer",
    transactionType: "Withdrawal",
    amount: 100,
    accountId: "bank-a",
    categoryId: "bank-b",
    categoryType: "account",
    isSplit: false,
  }];

  const balances = buildAccountBalanceSnapshot({ accounts: [bankA, bankB], transactions });

  assert.equal(balances.byAccountId["bank-a"].balance, -100);
  assert.equal(balances.byAccountId["bank-b"].balance, 100);
  assert.equal(balances.byAccountId["bank-b"].transactionCount, 1);
});
