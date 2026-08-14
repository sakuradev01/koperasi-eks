function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseDateBoundary(value, endOfDay = false) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Build the Mongo filter used by the transaction list endpoint.
 *
 * Category filters include both regular transactions and split transactions.
 * The caller resolves split transaction ids before passing them here so this
 * helper stays deterministic and can be covered without a database.
 */
export function buildTransactionListFilter({
  account = "",
  dateFrom = "",
  dateTo = "",
  categoryClauses = [],
  splitTransactionIds = [],
  categoryFilterActive = false,
} = {}) {
  const filter = {};
  const accountValue = normalizeText(account);

  if (accountValue) filter.accountId = accountValue;

  const startDate = parseDateBoundary(dateFrom);
  const endDate = parseDateBoundary(dateTo, true);
  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = startDate;
    if (endDate) filter.transactionDate.$lte = endDate;
  }

  const categoryConditions = categoryClauses
    .filter((clause) => clause?.categoryId && clause?.categoryType)
    .map((clause) => ({
      categoryId: clause.categoryId,
      categoryType: clause.categoryType,
    }));

  if (splitTransactionIds.length > 0) {
    categoryConditions.push({ _id: { $in: splitTransactionIds } });
  }

  if (categoryFilterActive || categoryConditions.length > 0) {
    filter.$or = categoryConditions.length > 0
      ? categoryConditions
      : [{ _id: { $in: [] } }];
  }

  return filter;
}
