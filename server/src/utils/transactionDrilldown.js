function normalizeCategoryKey(categoryId, categoryType) {
  if (!categoryId || !categoryType) return null;
  return `${categoryType}:${String(categoryId)}`;
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Build the account-specific view of a transaction used by report drill-downs.
 *
 * A split transaction is stored once with its payment account and has one or
 * more TransactionSplit rows for the P&L accounts. The parent amount and all
 * split rows must not be presented as the selected P&L account's amount.
 */
export function buildTransactionDrilldown({
  transaction = {},
  splits = [],
  categoryClauses = [],
  categoryFilterActive = false,
} = {}) {
  if (!categoryFilterActive) {
    return {
      amount: toAmount(transaction.amount),
      splits,
    };
  }

  const requestedKeys = new Set(
    categoryClauses
      .map((clause) => normalizeCategoryKey(clause?.categoryId, clause?.categoryType))
      .filter(Boolean),
  );

  if (transaction.isSplit) {
    const matchingSplits = splits.filter((split) => requestedKeys.has(
      normalizeCategoryKey(split?.categoryId, split?.categoryType),
    ));

    return {
      amount: matchingSplits.reduce((sum, split) => sum + toAmount(split.amount), 0),
      splits: matchingSplits,
    };
  }

  const transactionMatches = requestedKeys.has(
    normalizeCategoryKey(transaction.categoryId, transaction.categoryType),
  );

  return {
    amount: transactionMatches ? toAmount(transaction.amount) : 0,
    splits: [],
  };
}
