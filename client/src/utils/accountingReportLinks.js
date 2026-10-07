function buildCategoryParams(account, params) {
  const categoryId = account?.category_id || account?.account_id || account?.id;
  const categoryType = account?.category_type || "account";
  if (!categoryId || !["account", "submenu", "master"].includes(categoryType)) return;

  params.set("filter_category_id", categoryId);
  params.set("filter_category_type", categoryType);
  if (account?.account_name) params.set("filter_category", account.account_name);
}

function buildHref(params) {
  const query = params.toString();
  return query ? `/akuntansi/transaksi?${query}` : "/akuntansi/transaksi";
}

export function buildProfitLossTransactionHref(account, startDate, endDate) {
  const params = new URLSearchParams();
  buildCategoryParams(account, params);
  if (startDate) params.set("filter_date_from", startDate);
  if (endDate) params.set("filter_date_to", endDate);
  return buildHref(params);
}

export function buildBalanceSheetTransactionHref(account, asOfDate) {
  const params = new URLSearchParams();
  if (account?.is_cash_flow) {
    if (account.account_name) params.set("filter_account", account.account_name);
  } else {
    buildCategoryParams(account, params);
  }
  if (asOfDate) params.set("filter_date_to", asOfDate);
  return buildHref(params);
}

export function buildAccountTransactionsRowHref(account, transactionId) {
  const params = new URLSearchParams();
  buildCategoryParams(account, params);
  if (transactionId) params.set("highlight", transactionId);
  return buildHref(params);
}
