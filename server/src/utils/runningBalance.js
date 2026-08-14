function toIdString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function timestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareHistoryRowsDesc(left, right) {
  const transactionDateDiff = timestamp(right.transactionDate) - timestamp(left.transactionDate);
  if (transactionDateDiff !== 0) return transactionDateDiff;

  const createdAtDiff = timestamp(right.createdAt) - timestamp(left.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;

  return toIdString(right._id ?? right.id ?? right.transactionId)
    .localeCompare(toIdString(left._id ?? left.id ?? left.transactionId));
}

function signedTransactionAmount(row) {
  const amount = toAmount(row.amount);
  if (row.transactionType === "Deposit") return amount;
  if (row.transactionType === "Withdrawal") return -amount;
  return 0;
}

function calculateLedgerRunningBalances({ accountBalances = [], ledgerRows = [] } = {}) {
  const balanceByAccount = new Map();
  for (const account of accountBalances) {
    const accountId = toIdString(account?._id ?? account?.id);
    if (!accountId) continue;
    balanceByAccount.set(accountId, toNumber(account.balance));
  }

  const calculatedBalances = new Map();
  const orderedRows = [...ledgerRows].sort(compareHistoryRowsDesc);

  for (const row of orderedRows) {
    const accountId = toIdString(row?.accountId);
    if (!accountId || !balanceByAccount.has(accountId)) continue;

    const transactionId = toIdString(row?.transactionId ?? row?._id ?? row?.id);
    if (!transactionId) continue;

    const currentBalance = balanceByAccount.get(accountId);
    calculatedBalances.set(transactionId, currentBalance);
    balanceByAccount.set(accountId, currentBalance - toNumber(row.signedAmount));
  }

  return calculatedBalances;
}

/**
 * Calculate the balance after each transaction, starting from each account's
 * current balance and walking the complete history backwards. The caller can
 * pass only the account IDs represented on the current page; historyRows must
 * contain all transactions for those accounts, not only the visible page.
 */
export function calculateRunningBalances({ accountBalances = [], historyRows = [] } = {}) {
  return calculateLedgerRunningBalances({
    accountBalances,
    ledgerRows: historyRows.map((row) => ({
      ...row,
      transactionId: row?._id ?? row?.id,
      signedAmount: signedTransactionAmount(row),
    })),
  });
}

/**
 * Calculate a running balance for a report/category ledger. Unlike the bank
 * account calculation above, this starts from the complete signed movement
 * set because category accounts do not maintain the payment account balance.
 * Multiple split rows belonging to one parent transaction are aggregated so
 * the returned map still has one balance per displayed transaction.
 */
export function calculateRunningBalancesFromMovements({ movementRows = [] } = {}) {
  const groupedRows = new Map();
  for (const row of movementRows) {
    const transactionId = toIdString(row?.transactionId ?? row?._id ?? row?.id);
    if (!transactionId) continue;

    const existing = groupedRows.get(transactionId);
    if (existing) {
      existing.signedAmount += toNumber(row.signedAmount);
      continue;
    }

    groupedRows.set(transactionId, {
      ...row,
      transactionId,
      accountId: "__report_category__",
      signedAmount: toNumber(row.signedAmount),
    });
  }

  const ledgerRows = [...groupedRows.values()];
  const currentBalance = ledgerRows.reduce((sum, row) => sum + row.signedAmount, 0);

  return calculateLedgerRunningBalances({
    accountBalances: [{ _id: "__report_category__", balance: currentBalance }],
    ledgerRows,
  });
}
