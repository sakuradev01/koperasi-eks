import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountTransactionsRowHref,
  buildBalanceSheetTransactionHref,
  buildProfitLossTransactionHref,
} from "../src/utils/accountingReportLinks.js";

test("Profit and Loss drill-down uses the selected COA category and date range", () => {
  const href = buildProfitLossTransactionHref({
    id: "income-account-id",
    account_name: "Bunga Dana Talangan",
  }, "2026-01-01", "2026-10-06");
  const url = new URL(href, "https://admin.samitcoop.com");

  assert.equal(url.searchParams.get("filter_category_id"), "income-account-id");
  assert.equal(url.searchParams.get("filter_category_type"), "account");
  assert.equal(url.searchParams.get("filter_category"), "Bunga Dana Talangan");
  assert.equal(url.searchParams.get("filter_date_from"), "2026-01-01");
  assert.equal(url.searchParams.get("filter_date_to"), "2026-10-06");
  assert.equal(url.searchParams.has("filter_account"), false);
});

test("Balance Sheet non-cash accounts drill down by category instead of bank account", () => {
  const href = buildBalanceSheetTransactionHref({
    id: "receivable-account-id",
    account_name: "Pinjaman Tiket Pesawat",
    is_cash_flow: false,
  }, "2026-10-06");
  const url = new URL(href, "https://admin.samitcoop.com");

  assert.equal(url.searchParams.get("filter_category_id"), "receivable-account-id");
  assert.equal(url.searchParams.get("filter_category_type"), "account");
  assert.equal(url.searchParams.get("filter_date_to"), "2026-10-06");
  assert.equal(url.searchParams.has("filter_account"), false);
});

test("Balance Sheet cash account drill-down continues to filter by cash account", () => {
  const href = buildBalanceSheetTransactionHref({
    account_name: "Bank Koperasi SAMIT *596",
    is_cash_flow: true,
  }, "2026-10-06");
  const url = new URL(href, "https://admin.samitcoop.com");

  assert.equal(url.searchParams.get("filter_account"), "Bank Koperasi SAMIT *596");
  assert.equal(url.searchParams.get("filter_date_to"), "2026-10-06");
  assert.equal(url.searchParams.has("filter_category_id"), false);
});

test("Account Transactions row opens its category ledger and highlights the source transaction", () => {
  const href = buildAccountTransactionsRowHref({
    account_id: "liability-account-id",
    account_name: "Paket Kouhai",
  }, "transaction-id");
  const url = new URL(href, "https://admin.samitcoop.com");

  assert.equal(url.searchParams.get("filter_category_id"), "liability-account-id");
  assert.equal(url.searchParams.get("filter_category_type"), "account");
  assert.equal(url.searchParams.get("highlight"), "transaction-id");
  assert.equal(url.searchParams.has("filter_account"), false);
});

test("direct submenu report rows preserve the submenu category type", () => {
  const href = buildProfitLossTransactionHref({
    id: "direct-submenu-submenu-id",
    category_id: "submenu-id",
    category_type: "submenu",
    account_name: "Income (Direct Posting)",
  }, "2026-01-01", "2026-12-31");
  const url = new URL(href, "https://admin.samitcoop.com");

  assert.equal(url.searchParams.get("filter_category_id"), "submenu-id");
  assert.equal(url.searchParams.get("filter_category_type"), "submenu");
});
