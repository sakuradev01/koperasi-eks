# Accounting Reports and COA Balance Implementation Plan

> **For agentic workers:** Execute inline in this session, one task at a time. The user asked to continue the live audit and fix; do not pause for a subagent selection.

**Goal:** Make Profit & Loss, Balance Sheet, their filters/exports/drill-downs, and Chart of Accounts balances agree with the existing Koperasi ledger without mutating production MongoDB.

**Architecture:** Put report period/sign/balance calculations in deterministic helpers that can be tested without MongoDB. Keep persisted `CoaAccount.balance` as the cash-account running balance; calculate category balances from parent transactions and splits at read time, and include inactive historical COAs in financial statements.

**Tech Stack:** Express, Mongoose, React/Vite, Node built-in test runner.

## Global Constraints

- Read production MongoDB only; no production writes, migrations, or transaction repairs.
- Preserve existing unrelated dirty `server/src/controllers/member/danaDarurat.controller.js`.
- Leave legacy `/laporan` unchanged.
- Treat each split parent as one cash movement and split children as category movements; never add both parent and split amounts to one report total.
- Keep disabled COA categories with historical postings visible in statements.
- The current ledger represents cash/accounting transactions only. Do not claim Accrual and Cash are distinct; remove the unsupported report-type selector unless a real accrual source is implemented.
- The user explicitly requested commit and GitHub push after verification; do not manually deploy Podman. The user will handle the deploy/fork workflow.

## File Map

- `server/src/utils/accountingReportMath.js` — pure sign rules, date-filter resolution, and derived account balance calculation.
- `server/src/controllers/admin/reports.controller.js` — report loading, P&L/Balance Sheet assembly, split diagnostic, drill-down/CSV payloads.
- `server/src/controllers/admin/coa.controller.js` — attach computed current balances/activity counts to read-only COA responses.
- `client/src/pages/accounting/reports/ProfitLoss.jsx` — year/date filters, supported report controls, comparison/export.
- `client/src/pages/accounting/reports/BalanceSheet.jsx` — as-of/year filter, COA category drill-down, split diagnostic.
- `client/src/pages/accounting/reports/AccountTransactions.jsx` — remove unsupported basis filter and keep drill-down range coherent.
- `client/src/pages/accounting/ChartOfAccounts.jsx` — show computed balance precision and actual posting count.
- `server/test/accounting-reports.test.js` — regression tests for signs, year/date filters, inactive COA, split rounding, detail links, and export values.
- `server/test/coa-account-balances.test.js` — computed COA balance tests that preserve bank-account running balances.

## Task 1: Lock the financial invariants with failing tests

- [x] Add pure expected cases for asset-category cash counterpart signs, income/expense signs, contra balances, inactive account postings, split children, and parent-vs-split non-duplication.
- [x] Add filter cases: selecting year 2024 without explicit dates resolves to 2024-01-01 through 2024-12-31; explicit dates override the shortcut; invalid/reversed ranges fail; Balance Sheet year resolves to Dec 31 unless an as-of date is explicit; comparisons load through the later period end.
- [x] Add split diagnostic case proving one-cent parent/split difference is reported (the DB currently has two one-cent mismatches totaling Rp0.02).
- [x] Add COA cases showing bank balance from cash flow and non-cash COA balance from transaction/split category movements, with split parent never counted as category value.
- [x] Run focused Node tests; API regression tests now also cover GET/filter/CSV year behavior.

## Task 2: Fix calculation and filter sources

- [x] Add the pure helper signatures and deterministic calculation helpers.
- [x] Load all historical masters/submenus/accounts for report calculations so deactivating a COA does not erase its ledger history.
- [x] Preserve signed P&L totals; support account/submenu/master categories without multiplying parent transactions; load comparison data through the later comparison end date.
- [x] Calculate Balance Sheet cash, non-cash assets, liabilities/equity, and signed retained earnings from ledger postings.
- [x] Round to cents and retain/display actual balance difference; do not conceal or repair the DB's two-cent split residual.
- [x] Split checker reports cent mismatches and inactive/missing account-category references without editing records.
- [x] Run focused Node regression tests after changes.

## Task 3: Make report controls and details truthful

- [x] P&L year dropdown sets an exact year range; manual dates remain authoritative; exports use the same range. CSV includes comparison values when comparison is enabled.
- [x] Balance Sheet year dropdown sets Dec 31 for that year; manual as-of date wins. Remove unsupported Cash/Accrual controls from these ledger-only pages.
- [x] Route Balance Sheet details to their cash account or category ID/type; calculated prior-year retained-earnings detail includes the first posting date.
- [x] Keep report actions bound to active filters; legacy `/laporan` is unchanged.
- [x] COA displays derived balance to cents and ledger posting count.
- [x] Re-run server tests (37/37), client regression tests (20/20), client production build, and targeted ESLint (0 errors; one existing hook-dependency warning).
- [x] Whole-client lint was attempted; it remains red on existing errors across unrelated files (170 errors, 17 warnings). No unrelated lint cleanup was included.
- [x] Browser-harness is unavailable in the environment; authenticated visual UAT was not attempted. Endpoint, link, and build tests provide the verification instead.

## Task 4: Audit read-only production result and close

- [x] Read production through the existing API container and compare 2025/2026 results, COA hierarchy, inactive historical postings, split audit, and derived-vs-stored COA balances.
- [x] Verify the Balance Sheet has the documented Rp0.02 residual and do not mutate source rows.
- [x] Test P&L/Balance Sheet year filters and CSV export against the same payload calculation.
- [x] Review and commit only intended report/COA files and tests; preserve the unrelated Dana Darurat edit.
- [x] Push `main` as explicitly requested. GitHub Actions run `37574232881` failed before starting any job steps because the GitHub account is locked due to a billing issue; no deployment occurred and no manual deploy was run.
