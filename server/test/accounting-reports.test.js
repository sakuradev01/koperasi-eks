import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBalanceSheetData,
  buildAccountTransactionsData,
  buildProfitLossCsvRows,
  buildProfitLossData,
  loadCoaContext,
} from "../src/controllers/admin/reports.controller.js";
import { CoaAccount } from "../src/models/coaAccount.model.js";
import { CoaMaster } from "../src/models/coaMaster.model.js";
import { CoaSubmenu } from "../src/models/coaSubmenu.model.js";
import {
  buildAccountBalanceSnapshot,
  cashFlowMovement,
  categoryBalanceMovement,
  hasSplitAmountMismatch,
  profitLossMovement,
  resolveBalanceSheetAsOfDate,
  resolveProfitLossPeriod,
} from "../src/utils/accountingReportMath.js";

const date = (value) => new Date(`${value}T12:00:00`);
const makeAccount = (id, masterName, submenuName, isActive = true) => ({
  _id: id,
  id,
  accountCode: id,
  accountName: id,
  submenuId: `submenu-${submenuName}`,
  masterId: `master-${masterName}`,
  submenuName,
  masterName,
  isActive,
  currency: "Rp",
});

function makeCoaContext(accounts) {
  const accountsByMaster = new Map();
  const accountsBySubmenu = new Map();
  const accountMap = new Map();
  const submenuMap = new Map();
  const masterMap = new Map();
  for (const account of accounts) {
    accountMap.set(account.id, account);
    if (!accountsByMaster.has(account.masterName)) accountsByMaster.set(account.masterName, []);
    accountsByMaster.get(account.masterName).push(account);
    if (!accountsBySubmenu.has(account.submenuId)) accountsBySubmenu.set(account.submenuId, []);
    accountsBySubmenu.get(account.submenuId).push(account);
    submenuMap.set(account.submenuId, {
      id: account.submenuId,
      submenuName: account.submenuName,
      masterName: account.masterName,
    });
    masterMap.set(account.masterId, { id: account.masterId, masterName: account.masterName });
  }
  return { accountsByMaster, accountsBySubmenu, accountMap, submenuMap, masterMap };
}

test("selecting a year resolves to that full year unless explicit dates override it", () => {
  const period = resolveProfitLossPeriod({ year: "2024" }, date("2026-10-07"));
  assert.equal(period.startDateText, "2024-01-01");
  assert.equal(period.endDateText, "2024-12-31");
  assert.equal(period.year, 2024);

  const custom = resolveProfitLossPeriod({
    year: "2024",
    start_date: "2025-02-03",
    end_date: "2025-05-06",
  }, date("2026-10-07"));
  assert.equal(custom.startDateText, "2025-02-03");
  assert.equal(custom.endDateText, "2025-05-06");
});

test("invalid and reversed report date ranges are rejected instead of silently defaulting", () => {
  assert.throws(() => resolveProfitLossPeriod({
    start_date: "2026-02-30",
    end_date: "2026-03-01",
  }, date("2026-10-07")), /valid YYYY-MM-DD/i);
  assert.throws(() => resolveProfitLossPeriod({
    start_date: "2026-04-01",
    end_date: "2026-03-31",
  }, date("2026-10-07")), /before or equal/i);
  assert.throws(() => resolveProfitLossPeriod({ year: "nonsense" }, date("2026-10-07")), /four-digit year/i);
});

test("Balance Sheet year selects Dec 31 and an explicit as-of date wins", () => {
  assert.equal(
    resolveBalanceSheetAsOfDate({ year: "2024" }, date("2026-10-07")).asOfDateText,
    "2024-12-31",
  );
  assert.equal(
    resolveBalanceSheetAsOfDate({ year: "2024", as_of_date: "2025-03-04" }, date("2026-10-07")).asOfDateText,
    "2025-03-04",
  );
});

test("cash and category balances use opposite directions for cash versus receivables", () => {
  assert.equal(cashFlowMovement("Deposit", 100), 100);
  assert.equal(cashFlowMovement("Withdrawal", 100), -100);
  assert.equal(categoryBalanceMovement("Assets", "Withdrawal", 100), 100);
  assert.equal(categoryBalanceMovement("Assets", "Deposit", 100), -100);
  assert.equal(categoryBalanceMovement("Liabilities", "Deposit", 100), -100);
  assert.equal(categoryBalanceMovement("Liabilities", "Withdrawal", 100), 100);
  assert.equal(profitLossMovement("Income", "Deposit", 100), 100);
  assert.equal(profitLossMovement("Income", "Withdrawal", 100), -100);
  assert.equal(profitLossMovement("Expenses", "Withdrawal", 100), 100);
  assert.equal(profitLossMovement("Expenses", "Deposit", 100), -100);
});

test("Profit & Loss preserves contra-income signs and includes inactive historical COAs", () => {
  const activeIncome = makeAccount("active-income", "Income", "Income");
  const inactiveIncome = makeAccount("inactive-income", "Income", "Income", false);
  const fee = makeAccount("fee", "Expenses", "Payment Processing Fee");
  const coa = makeCoaContext([activeIncome, inactiveIncome, fee]);
  const transactions = [
    { _id: "income", transactionDate: date("2026-01-10"), transactionType: "Deposit", amount: 100, categoryId: activeIncome.id, categoryType: "account", isSplit: false },
    { _id: "refund", transactionDate: date("2026-01-11"), transactionType: "Withdrawal", amount: 150, categoryId: activeIncome.id, categoryType: "account", isSplit: false },
    { _id: "legacy-income", transactionDate: date("2026-01-12"), transactionType: "Deposit", amount: 40, categoryId: inactiveIncome.id, categoryType: "account", isSplit: false },
    { _id: "fee-expense", transactionDate: date("2026-01-13"), transactionType: "Withdrawal", amount: 10, categoryId: fee.id, categoryType: "account", isSplit: false },
  ];

  const report = buildProfitLossData(date("2026-01-01"), date("2026-12-31"), coa, {
    transactions,
    splitsByTransactionId: new Map(),
  });

  assert.equal(report.total_income, -10);
  assert.equal(report.total_operating_expenses, 10);
  assert.equal(report.net_profit, -20);
  assert.equal(report.income.accounts.find((account) => account.id === activeIncome.id).total, -50);
  assert.equal(report.income.accounts.find((account) => account.id === inactiveIncome.id).total, 40);
});

test("a direct submenu posting is counted once, not duplicated across its child COAs", () => {
  const incomeA = makeAccount("income-a", "Income", "Income");
  const incomeB = makeAccount("income-b", "Income", "Income");
  const coa = makeCoaContext([incomeA, incomeB]);
  const submenuId = incomeA.submenuId;
  const transactions = [{
    _id: "direct-submenu-income",
    transactionDate: date("2026-01-01"),
    transactionType: "Deposit",
    amount: 50,
    categoryId: submenuId,
    categoryType: "submenu",
    isSplit: false,
  }];

  const report = buildProfitLossData(date("2026-01-01"), date("2026-12-31"), {
    ...coa,
    submenuMap: new Map([[submenuId, { id: submenuId, submenuName: "Income", masterName: "Income" }]]),
    masterMap: new Map(),
  }, { transactions, splitsByTransactionId: new Map() });

  assert.equal(report.total_income, 50);
  assert.equal(report.income.accounts.filter((account) => account.category_type === "submenu").length, 1);
});

test("Balance Sheet balances cash, receivables, liabilities, equity, income and expenses", () => {
  const bank = makeAccount("bank", "Assets", "Cash and Bank");
  const receivable = makeAccount("receivable", "Assets", "Accounts Receivable");
  const liability = makeAccount("liability", "Liabilities", "Accounts Payable");
  const equity = makeAccount("equity", "Equity", "Equity");
  const income = makeAccount("income", "Income", "Income");
  const expense = makeAccount("expense", "Expenses", "Payment Processing Fee");
  const accounts = [bank, receivable, liability, equity, income, expense];
  const coa = makeCoaContext(accounts);
  const transactions = [
    { _id: "loan-out", transactionDate: date("2026-01-01"), transactionType: "Withdrawal", amount: 100, accountId: bank.id, categoryId: receivable.id, categoryType: "account", isSplit: false },
    { _id: "liability-in", transactionDate: date("2026-01-02"), transactionType: "Deposit", amount: 100, accountId: bank.id, categoryId: liability.id, categoryType: "account", isSplit: false },
    { _id: "income-in", transactionDate: date("2026-01-03"), transactionType: "Deposit", amount: 50, accountId: bank.id, categoryId: income.id, categoryType: "account", isSplit: false },
    { _id: "expense-out", transactionDate: date("2026-01-04"), transactionType: "Withdrawal", amount: 20, accountId: bank.id, categoryId: expense.id, categoryType: "account", isSplit: false },
    { _id: "capital-in", transactionDate: date("2026-01-05"), transactionType: "Deposit", amount: 5, accountId: bank.id, categoryId: equity.id, categoryType: "account", isSplit: false },
  ];

  const report = buildBalanceSheetData(date("2026-12-31"), coa, {
    transactions,
    splitsByTransactionId: new Map(),
  });

  assert.equal(report.assets.total, 135);
  assert.equal(report.liabilities.total, 100);
  assert.equal(report.equity.total, 35);
  assert.equal(report.is_balanced, true);
  assert.equal(report.assets.categories["Other Current Assets"].accounts.find((a) => a.id === receivable.id).balance, 100);
});

test("direct parent-category postings remain visible once and contra liabilities stay negative", () => {
  const bank = makeAccount("bank", "Assets", "Cash and Bank");
  const liability = makeAccount("liability", "Liabilities", "Accounts Payable");
  const income = makeAccount("income", "Income", "Income");
  const coa = makeCoaContext([bank, liability, income]);
  const transactions = [
    { _id: "asset-parent", transactionDate: date("2026-01-01"), transactionType: "Withdrawal", amount: 100, accountId: bank.id, categoryId: "submenu-Accounts Receivable", categoryType: "submenu", isSplit: false },
    { _id: "income-parent", transactionDate: date("2026-01-02"), transactionType: "Deposit", amount: 40, accountId: bank.id, categoryId: "master-Income", categoryType: "master", isSplit: false },
    { _id: "liability-debit", transactionDate: date("2026-01-03"), transactionType: "Withdrawal", amount: 150, accountId: bank.id, categoryId: liability.id, categoryType: "account", isSplit: false },
  ];
  coa.submenuMap.set("submenu-Accounts Receivable", {
    id: "submenu-Accounts Receivable",
    submenuName: "Accounts Receivable",
    masterName: "Assets",
  });
  coa.masterMap.set("master-Income", { id: "master-Income", masterName: "Income" });
  const context = { transactions, splitsByTransactionId: new Map() };
  const report = buildBalanceSheetData(date("2026-12-31"), coa, context);
  const pl = buildProfitLossData(date("2026-01-01"), date("2026-12-31"), coa, context);

  assert.equal(report.assets.categories["Other Current Assets"].total, 100);
  assert.equal(report.assets.total, -110);
  assert.equal(report.is_balanced, true);
  assert.equal(report.liabilities.categories["Current Liabilities"].accounts[0].balance, -150);
  assert.equal(pl.total_income, 40);
});

test("split category postings count only child amounts and category balances are derived without DB writes", () => {
  const bank = makeAccount("bank", "Assets", "Cash and Bank");
  const receivable = makeAccount("receivable", "Assets", "Accounts Receivable");
  const expense = makeAccount("expense", "Expenses", "Payment Processing Fee");
  const accounts = [bank, receivable, expense];
  const transactions = [{
    _id: "split-payment",
    transactionDate: date("2026-01-01"),
    transactionType: "Withdrawal",
    amount: 100,
    accountId: bank.id,
    isSplit: true,
  }];
  const splits = [
    { transactionId: "split-payment", categoryId: receivable.id, categoryType: "account", amount: 80 },
    { transactionId: "split-payment", categoryId: expense.id, categoryType: "account", amount: 20 },
  ];

  const snapshot = buildAccountBalanceSnapshot({ accounts, transactions, splits });
  assert.equal(snapshot.byAccountId[bank.id].balance, -100);
  assert.equal(snapshot.byAccountId[receivable.id].balance, 80);
  assert.equal(snapshot.byAccountId[expense.id].balance, 20);
  assert.equal(snapshot.byAccountId[receivable.id].transactionCount, 1);
  assert.equal(snapshot.byAccountId[expense.id].transactionCount, 1);
});

test("split rounding mismatches are visible at one-cent precision", () => {
  assert.equal(hasSplitAmountMismatch(100, 99.99), true);
  assert.equal(hasSplitAmountMismatch(100, 100), false);
  assert.equal(hasSplitAmountMismatch(100, 100.01), true);
});

test("General Ledger includes both sides of a payment and uses account-normal debit/credit", () => {
  const bank = makeAccount("bank", "Assets", "Cash and Bank");
  const receivable = makeAccount("receivable", "Assets", "Accounts Receivable");
  const income = makeAccount("income", "Income", "Income");
  const expense = makeAccount("expense", "Expenses", "Payment Processing Fee");
  const coa = makeCoaContext([bank, receivable, income, expense]);
  const transactions = [
    { _id: "loan", transactionDate: date("2026-01-01"), createdAt: date("2026-01-01"), transactionType: "Withdrawal", amount: 100, accountId: bank.id, categoryId: receivable.id, categoryType: "account", isSplit: false },
    { _id: "income", transactionDate: date("2026-01-02"), createdAt: date("2026-01-02"), transactionType: "Deposit", amount: 50, accountId: bank.id, categoryId: income.id, categoryType: "account", isSplit: false },
    { _id: "expense", transactionDate: date("2026-01-03"), createdAt: date("2026-01-03"), transactionType: "Withdrawal", amount: 20, accountId: bank.id, categoryId: expense.id, categoryType: "account", isSplit: false },
  ];

  const report = buildAccountTransactionsData({
    startDate: date("2026-01-01"),
    endDate: date("2026-12-31"),
    accountFilter: "all",
    contactFilter: "all",
    coaContext: { ...coa, accounts: [bank, receivable, income, expense] },
    transactionsContext: { transactions, splitsByTransactionId: new Map() },
    memberNameMap: new Map(),
  });
  const byId = new Map(report.map((account) => [account.account_id, account]));

  assert.equal(byId.get(bank.id).total_debit, 50);
  assert.equal(byId.get(bank.id).total_credit, 120);
  assert.equal(byId.get(bank.id).ending_balance, -70);
  assert.equal(byId.get(receivable.id).total_debit, 100);
  assert.equal(byId.get(income.id).total_credit, 50);
  assert.equal(byId.get(expense.id).total_debit, 20);
});

test("General Ledger splits do not repeat the parent amount in category accounts", () => {
  const bank = makeAccount("bank", "Assets", "Cash and Bank");
  const income = makeAccount("income", "Income", "Income");
  const expense = makeAccount("expense", "Expenses", "Payment Processing Fee");
  const transactions = [{
    _id: "split",
    transactionDate: date("2026-01-01"),
    createdAt: date("2026-01-01"),
    transactionType: "Deposit",
    amount: 100,
    accountId: bank.id,
    isSplit: true,
  }];
  const report = buildAccountTransactionsData({
    startDate: date("2026-01-01"),
    endDate: date("2026-12-31"),
    accountFilter: "all",
    contactFilter: "all",
    coaContext: { ...makeCoaContext([bank, income, expense]), accounts: [bank, income, expense] },
    transactionsContext: {
      transactions,
      splitsByTransactionId: new Map([[
        "split",
        [
          { categoryId: income.id, categoryType: "account", amount: 70 },
          { categoryId: expense.id, categoryType: "account", amount: 30 },
        ],
      ]]),
    },
    memberNameMap: new Map(),
  });
  const byId = new Map(report.map((account) => [account.account_id, account]));

  assert.equal(byId.get(bank.id).total_debit, 100);
  assert.equal(byId.get(income.id).total_credit, 70);
  assert.equal(byId.get(expense.id).total_credit, 30);
  assert.equal(report.reduce((sum, account) => sum + account.total_debit, 0), 100);
  assert.equal(report.reduce((sum, account) => sum + account.total_credit, 0), 100);
});

test("Profit & Loss CSV export includes comparison values and direct-category rows", () => {
  const currentAccount = {
    id: "income-id",
    category_id: "income-id",
    category_type: "account",
    account_name: "Bunga",
    total: 125,
  };
  const newCategory = {
    id: "new-category-id",
    category_id: "new-category-id",
    category_type: "submenu",
    account_name: "Direct Income Posting",
    total: 25,
  };
  const payload = {
    startDate: "2026-01-01",
    endDate: "2026-10-06",
    comparisonDates: { start: "2025-01-01", end: "2025-10-06" },
    reportData: {
      income: { accounts: [currentAccount, newCategory], total: 150 },
      cogs: { accounts: [], total: 0 },
      gross_profit: 125,
      operating_expenses: { accounts: [], total: 0 },
      net_profit: 125,
    },
    comparisonData: {
      income: { accounts: [{ ...currentAccount, total: 100 }], total: 100 },
      cogs: { accounts: [], total: 0 },
      gross_profit: 100,
      operating_expenses: { accounts: [], total: 0 },
      net_profit: 100,
    },
  };

  const rows = buildProfitLossCsvRows(payload);
  assert.ok(rows.some((row) => row[0] === "Account" && row[1] === "Current Amount" && row[2] === "Comparison Amount"));
  assert.ok(rows.some((row) => row[0] === "Bunga" && row[1] === "125.00" && row[2] === "100.00" && row[3] === "25.00%"));
  assert.ok(rows.some((row) => row[0] === "Direct Income Posting" && row[1] === "25.00" && row[2] === "0.00" && row[3] === "Baru"));
  assert.ok(rows.some((row) => row[0] === "Net Profit" && row[1] === "125.00" && row[2] === "100.00"));
});

test("COA report context includes inactive history instead of dropping posted accounts", async (t) => {
  const originals = [CoaMaster.find, CoaSubmenu.find, CoaAccount.find];
  t.after(() => {
    [CoaMaster.find, CoaSubmenu.find, CoaAccount.find] = originals;
  });

  const results = {
    masters: [{ _id: "master-income", masterName: "Income", isActive: true }],
    submenus: [{ _id: "submenu-income", masterId: "master-income", submenuName: "Income", isActive: true }],
    accounts: [{
      ...makeAccount("inactive-income", "Income", "Income", false),
      submenuId: "submenu-income",
    }],
  };
  const seenFilters = [];
  const mockFind = (key) => (filter) => {
    seenFilters.push(filter);
    return { sort() { return this; }, lean: async () => results[key] };
  };
  CoaMaster.find = mockFind("masters");
  CoaSubmenu.find = mockFind("submenus");
  CoaAccount.find = mockFind("accounts");

  const context = await loadCoaContext();
  assert.equal(context.accountMap.get("inactive-income").isActive, false);
  assert.ok(context.accountsByMaster.get("Income").some((account) => account.id === "inactive-income"));
  assert.deepEqual(seenFilters, [{}, {}, {}]);
});
