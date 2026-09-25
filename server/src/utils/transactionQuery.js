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

function parseAmountBoundary(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function containsText(value) {
  const text = normalizeText(value).slice(0, 120);
  if (!text) return null;
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export function normalizeTransactionPagination(pageValue, limitValue) {
  const parsedPage = Number.parseInt(pageValue, 10);
  const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
  const requestedLimit = normalizeText(limitValue).toLowerCase();

  if (requestedLimit === "all") {
    return { page: 1, limit: null, isAll: true };
  }

  const parsedLimit = Number.parseInt(requestedLimit, 10);
  const limit = [10, 25, 50].includes(parsedLimit) ? parsedLimit : 10;
  return { page, limit, isAll: false };
}

const TRANSACTION_SORTS = {
  date_desc: { transactionDate: -1, createdAt: -1, _id: -1 },
  date_asc: { transactionDate: 1, createdAt: 1, _id: 1 },
  amount_desc: { amount: -1, transactionDate: -1, createdAt: -1, _id: -1 },
  amount_asc: { amount: 1, transactionDate: -1, createdAt: -1, _id: -1 },
  desc_asc: { description: 1, transactionDate: -1, createdAt: -1, _id: -1 },
  desc_desc: { description: -1, transactionDate: -1, createdAt: -1, _id: -1 },
  reviewed_desc: { reviewed: -1, transactionDate: -1, createdAt: -1, _id: -1 },
  reviewed_asc: { reviewed: 1, transactionDate: -1, createdAt: -1, _id: -1 },
};

export function buildTransactionSort(sortBy) {
  return TRANSACTION_SORTS[normalizeText(sortBy)] || TRANSACTION_SORTS.date_desc;
}

export function buildRunningBalanceHistoryFilter(accountIds, visibleTransactions) {
  const validAccountIds = (accountIds || []).filter(Boolean);
  const earliestTimestamp = (visibleTransactions || []).reduce((earliest, transaction) => {
    const timestamp = new Date(transaction?.transactionDate).getTime();
    return Number.isFinite(timestamp) ? Math.min(earliest, timestamp) : earliest;
  }, Number.POSITIVE_INFINITY);
  if (validAccountIds.length === 0 || !Number.isFinite(earliestTimestamp)) return null;

  return {
    accountId: { $in: validAccountIds },
    transactionDate: { $gte: new Date(earliestTimestamp) },
  };
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
  accountIds = [],
  accountFilterActive = false,
  dateFrom = "",
  dateTo = "",
  transactionType = "",
  description = "",
  reviewed,
  amountMin,
  amountMax,
  categoryClauses = [],
  splitTransactionIds = [],
  categoryFilterActive = false,
  additionalCategoryFilters = [],
  searchClauses = [],
} = {}) {
  const filter = {};
  const additionalConditions = [];
  const disjunctions = [];
  const accountValue = normalizeText(account);

  if (accountValue) filter.accountId = accountValue;

  if (accountFilterActive) {
    const accountCondition = {
      accountId: { $in: accountIds.filter(Boolean) },
    };
    if (filter.accountId) additionalConditions.push(accountCondition);
    else Object.assign(filter, accountCondition);
  }

  const startDate = parseDateBoundary(dateFrom);
  const endDate = parseDateBoundary(dateTo, true);
  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = startDate;
    if (endDate) filter.transactionDate.$lte = endDate;
  }

  const normalizedType = normalizeText(transactionType);
  if (normalizedType === "Deposit" || normalizedType === "Withdrawal") {
    filter.transactionType = normalizedType;
  }

  const descriptionPattern = containsText(description);
  if (descriptionPattern) filter.description = descriptionPattern;

  if (reviewed !== undefined && reviewed !== null && reviewed !== "") {
    filter.reviewed = reviewed === true || ["1", "true", "yes", "on"].includes(String(reviewed).trim().toLowerCase());
  }

  const minAmount = parseAmountBoundary(amountMin);
  const maxAmount = parseAmountBoundary(amountMax);
  if (minAmount !== null || maxAmount !== null) {
    filter.amount = {};
    if (minAmount !== null) filter.amount.$gte = minAmount;
    if (maxAmount !== null) filter.amount.$lte = maxAmount;
  }

  const categoryFilters = [
    { clauses: categoryClauses, splitTransactionIds, active: categoryFilterActive },
    ...additionalCategoryFilters,
  ];
  for (const categoryFilter of categoryFilters) {
    const categoryConditions = (categoryFilter.clauses || [])
      .filter((clause) => clause?.categoryId && clause?.categoryType)
      .map((clause) => ({
        categoryId: clause.categoryId,
        categoryType: clause.categoryType,
      }));
    const categorySplitIds = (categoryFilter.splitTransactionIds || []).filter(Boolean);

    if (categorySplitIds.length > 0) {
      categoryConditions.push({ _id: { $in: categorySplitIds } });
    }

    if (categoryFilter.active || categoryConditions.length > 0) {
      disjunctions.push(categoryConditions.length > 0
        ? categoryConditions
        : [{ _id: { $in: [] } }]);
    }
  }

  const validSearchClauses = searchClauses.filter((clause) => clause && Object.keys(clause).length > 0);
  if (validSearchClauses.length > 0) disjunctions.push(validSearchClauses);

  if (disjunctions.length === 1) filter.$or = disjunctions[0];
  else if (disjunctions.length > 1) {
    additionalConditions.push(...disjunctions.map((conditions) => ({ $or: conditions })));
  }

  if (additionalConditions.length > 0) {
    return { $and: [filter, ...additionalConditions] };
  }

  return filter;
}
