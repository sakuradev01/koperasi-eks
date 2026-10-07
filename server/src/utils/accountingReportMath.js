const CASH_ASSET_SUBMENUS = new Set([
  "Cash and Bank",
  "Cash on Hand",
  "Bank Accounts",
  "Money in Transit",
]);

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

export function roundReportMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function cashFlowMovement(transactionType, amount) {
  const signedAmount = money(amount);
  if (transactionType === "Deposit") return signedAmount;
  if (transactionType === "Withdrawal") return -signedAmount;
  return 0;
}

// Category rows are the counter-entry to the bank movement. Assets increase
// when cash is withdrawn to make a loan and decrease when that loan is repaid.
export function categoryBalanceMovement(masterName, transactionType, amount) {
  const signedAmount = money(amount);
  if (masterName === "Assets") {
    if (transactionType === "Withdrawal") return signedAmount;
    if (transactionType === "Deposit") return -signedAmount;
    return 0;
  }

  if (["Expenses"].includes(masterName)) {
    return transactionType === "Deposit" ? -signedAmount : signedAmount;
  }

  return transactionType === "Deposit" ? -signedAmount : signedAmount;
}

export function profitLossMovement(masterName, transactionType, amount) {
  const signedAmount = money(amount);
  if (masterName === "Income") {
    return transactionType === "Deposit" ? signedAmount : -signedAmount;
  }
  if (masterName === "Expenses") {
    return transactionType === "Withdrawal" ? signedAmount : -signedAmount;
  }
  return 0;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value, label) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new RangeError(`${label} must be a valid YYYY-MM-DD date.`);

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    throw new RangeError(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return date;
}

function validYear(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= 1900 && year <= 9999 ? year : null;
}

function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function resolveProfitLossPeriod(options = {}, now = new Date()) {
  const explicitStart = String(options.start_date ?? options.startDate ?? "").trim();
  const explicitEnd = String(options.end_date ?? options.endDate ?? "").trim();
  const rawYear = String(options.year ?? "").trim();
  const optionYear = validYear(rawYear);
  if (rawYear && !optionYear) throw new RangeError("Year must be a valid four-digit year.");
  const startYear = explicitStart ? Number(explicitStart.slice(0, 4)) : null;
  const year = optionYear || startYear || now.getFullYear();
  const today = formatDateOnly(now);
  const startDateText = explicitStart || `${year}-01-01`;
  const endDateText = explicitEnd || (year === now.getFullYear() ? today : `${year}-12-31`);
  const startDate = parseDateOnly(startDateText, "Start date");
  const endDate = endOfDay(parseDateOnly(endDateText, "End date"));

  if (startDate > endDate) {
    throw new RangeError("Start date must be before or equal to end date.");
  }

  return {
    year: explicitStart ? startDate.getFullYear() : (optionYear || startDate.getFullYear()),
    startDate,
    endDate,
    startDateText: formatDateOnly(startDate),
    endDateText: formatDateOnly(endDate),
  };
}

export function resolveBalanceSheetAsOfDate(options = {}, now = new Date()) {
  const explicitDate = String(options.as_of_date ?? options.asOfDate ?? "").trim();
  const rawYear = String(options.year ?? "").trim();
  const year = validYear(rawYear);
  if (rawYear && !year) throw new RangeError("Year must be a valid four-digit year.");
  const asOfDateText = explicitDate || (year ? `${year}-12-31` : formatDateOnly(now));
  const asOfDate = endOfDay(parseDateOnly(asOfDateText, "As-of date"));

  return {
    year: asOfDate.getFullYear(),
    asOfDate,
    asOfDateText: formatDateOnly(asOfDate),
  };
}

export function maxReportDate(...dates) {
  const validDates = dates.filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
  return validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : null;
}

export function hasSplitAmountMismatch(parentAmount, splitAmount) {
  return roundReportMoney(parentAmount) !== roundReportMoney(splitAmount);
}

function idOf(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "object" && typeof value.toString === "function"
    ? value.toString()
    : String(value);
}

function createActivityRow(id, account, isCashAccount) {
  return {
    id,
    balance: 0,
    transactionIds: new Set(),
    isCashAccount,
    accountName: account.accountName || "",
    currency: account.currency || "Rp",
  };
}

function displayAccountMovement(account, transactionType, amount) {
  if (account.masterName === "Income" || account.masterName === "Expenses") {
    return profitLossMovement(account.masterName, transactionType, amount);
  }
  const debitNormalMovement = categoryBalanceMovement(account.masterName, transactionType, amount);
  return ["Liabilities", "Equity"].includes(account.masterName)
    ? -debitNormalMovement
    : debitNormalMovement;
}

export function buildAccountBalanceSnapshot({
  accounts = [],
  submenus = [],
  masters = [],
  transactions = [],
  splits = [],
} = {}) {
  const accountsById = new Map();
  const rows = new Map();
  const submenuById = new Map();
  const masterById = new Map();
  const directSubmenu = new Map();
  const directMaster = new Map();
  const splitsByTransactionId = new Map();

  for (const submenu of submenus) {
    const submenuId = idOf(submenu.id ?? submenu._id);
    const masterId = idOf(submenu.masterId);
    const masterName = submenu.masterName || masters.find((master) => idOf(master.id ?? master._id) === masterId)?.masterName || "";
    submenuById.set(submenuId, { masterName, submenuName: submenu.submenuName || "" });
  }
  for (const master of masters) {
    masterById.set(idOf(master.id ?? master._id), master.masterName || "");
  }
  for (const split of splits) {
    const transactionId = idOf(split.transactionId);
    if (!splitsByTransactionId.has(transactionId)) splitsByTransactionId.set(transactionId, []);
    splitsByTransactionId.get(transactionId).push(split);
  }

  for (const account of accounts) {
    const id = idOf(account.id ?? account._id);
    const submenuId = idOf(account.submenuId);
    const isCashAccount = account.masterName === "Assets" && CASH_ASSET_SUBMENUS.has(account.submenuName);
    const normalized = { ...account, id, submenuId };
    accountsById.set(id, normalized);
    rows.set(id, createActivityRow(id, normalized, isCashAccount));
    if (submenuId && !submenuById.has(submenuId)) {
      submenuById.set(submenuId, { masterName: account.masterName, submenuName: account.submenuName });
    }
    const masterId = idOf(account.masterId);
    if (masterId && !masterById.has(masterId)) masterById.set(masterId, account.masterName);
  }

  const markActivity = (row, transactionId) => row.transactionIds.add(transactionId);
  const addDirectCategory = (target, categoryId, transactionId, movement) => {
    const row = target.get(categoryId) || { balance: 0, transactionIds: new Set() };
    row.balance += movement;
    row.transactionIds.add(transactionId);
    target.set(categoryId, row);
  };

  const addCategoryPosting = (categoryIdValue, categoryType, transaction, amount) => {
    const categoryId = idOf(categoryIdValue);
    const transactionId = idOf(transaction._id);
    if (categoryType === "account") {
      const account = accountsById.get(categoryId);
      const row = rows.get(categoryId);
      if (!account || !row) return;
      row.balance += displayAccountMovement(account, transaction.transactionType, amount);
      markActivity(row, transactionId);
      return;
    }

    if (categoryType === "submenu") {
      const submenu = submenuById.get(categoryId);
      if (!submenu) return;
      const movement = displayAccountMovement(
        { masterName: submenu.masterName }, transaction.transactionType, amount,
      );
      addDirectCategory(directSubmenu, categoryId, transactionId, movement);
      return;
    }

    if (categoryType === "master") {
      const masterName = masterById.get(categoryId);
      if (!masterName) return;
      const movement = displayAccountMovement(
        { masterName }, transaction.transactionType, amount,
      );
      addDirectCategory(directMaster, categoryId, transactionId, movement);
    }
  };

  for (const transaction of transactions) {
    const transactionId = idOf(transaction._id);
    const cashAccountRow = rows.get(idOf(transaction.accountId));
    if (cashAccountRow?.isCashAccount) {
      cashAccountRow.balance += cashFlowMovement(transaction.transactionType, transaction.amount);
      markActivity(cashAccountRow, transactionId);
    }

    if (transaction.isSplit) {
      for (const split of splitsByTransactionId.get(transactionId) || []) {
        addCategoryPosting(split.categoryId, split.categoryType || "account", transaction, split.amount);
      }
    } else if (transaction.categoryId && transaction.categoryType) {
      addCategoryPosting(transaction.categoryId, transaction.categoryType, transaction, transaction.amount);
    }
  }

  const byAccountId = Object.fromEntries([...rows].map(([id, row]) => [id, {
    balance: roundReportMoney(row.balance),
    transactionCount: row.transactionIds.size,
  }]));
  const submenuTotals = new Map();
  for (const [id, row] of rows) {
    const submenuId = accountsById.get(id)?.submenuId;
    if (!submenuId) continue;
    const total = submenuTotals.get(submenuId) || { balance: 0, transactionIds: new Set() };
    total.balance += row.balance;
    for (const transactionId of row.transactionIds) total.transactionIds.add(transactionId);
    submenuTotals.set(submenuId, total);
  }
  for (const [id, row] of directSubmenu) {
    const total = submenuTotals.get(id) || { balance: 0, transactionIds: new Set() };
    total.balance += row.balance;
    for (const transactionId of row.transactionIds) total.transactionIds.add(transactionId);
    submenuTotals.set(id, total);
  }
  const bySubmenuId = Object.fromEntries([...submenuTotals].map(([id, row]) => [id, {
    balance: roundReportMoney(row.balance),
    transactionCount: row.transactionIds.size,
  }]));
  const directBySubmenuId = Object.fromEntries([...directSubmenu].map(([id, row]) => [id, {
    balance: roundReportMoney(row.balance),
    transactionCount: row.transactionIds.size,
  }]));
  const byMasterId = Object.fromEntries([...directMaster].map(([id, row]) => [id, {
    balance: roundReportMoney(row.balance),
    transactionCount: row.transactionIds.size,
  }]));

  return { byAccountId, bySubmenuId, directBySubmenuId, byMasterId };
}
