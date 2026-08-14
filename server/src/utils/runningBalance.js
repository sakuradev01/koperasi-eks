function toIdString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
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

  return toIdString(right._id ?? right.id).localeCompare(toIdString(left._id ?? left.id));
}

/**
 * Calculate the balance after each transaction, starting from each account's
 * current balance and walking the complete history backwards. The caller can
 * pass only the account IDs represented on the current page; historyRows must
 * contain all transactions for those accounts, not only the visible page.
 */
export function calculateRunningBalances({ accountBalances = [], historyRows = [] } = {}) {
  const balanceByAccount = new Map();
  for (const account of accountBalances) {
    const accountId = toIdString(account?._id ?? account?.id);
    if (!accountId) continue;
    const balance = Number(account.balance);
    balanceByAccount.set(accountId, Number.isFinite(balance) ? balance : 0);
  }

  const calculatedBalances = new Map();
  const orderedRows = [...historyRows].sort(compareHistoryRowsDesc);

  for (const row of orderedRows) {
    const accountId = toIdString(row?.accountId);
    if (!accountId || !balanceByAccount.has(accountId)) continue;

    const transactionId = toIdString(row?._id ?? row?.id);
    if (!transactionId) continue;

    const currentBalance = balanceByAccount.get(accountId);
    calculatedBalances.set(transactionId, currentBalance);

    const amount = toAmount(row.amount);
    if (row.transactionType === "Deposit") {
      balanceByAccount.set(accountId, currentBalance - amount);
    } else if (row.transactionType === "Withdrawal") {
      balanceByAccount.set(accountId, currentBalance + amount);
    }
  }

  return calculatedBalances;
}
