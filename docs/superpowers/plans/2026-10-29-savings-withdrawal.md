# Savings Withdrawal Implementation Plan

> **For agentic workers:** Implement task-by-task inline. Each task must pass its focused tests before proceeding.

**Goal:** Add student-initiated and legacy-admin savings closure/withdrawal across Koperasi and Student Dashboard, with eligibility from Finance-approved paid periods and one Expense-backed payout ledger.

**Implementation status:** Implemented and verified in both repositories. Finance review uses the existing Koperasi Expense lifecycle; historical closures are recorded as paid only when Finance supplies transfer proof and the accounting transaction succeeds.

**Architecture:** Koperasi owns settings, eligibility, withdrawal request state, Expense linkage, and accounting completion. A focused `savings-withdrawal` module owns policy/use cases and repository adapters; controllers remain HTTP adapters. Student Dashboard obtains current state and submits through authenticated Koperasi member endpoints, never calculating amounts as authority. Existing Expense workflow remains the Finance workflow and becomes the only source of payout transaction creation.

**Tech Stack:** Node.js ES modules, Express, Mongoose, React/Vite; CodeIgniter 4 PHP Student Dashboard; existing Node test runner, PHPUnit, ESLint, Vite build.

**Operational prerequisite:** Student-initiated payout and historical closure use MongoDB transactions so an Expense, accounting transaction/splits, account balance, request state, and member closure commit together. The production MongoDB deployment must support sessions/transactions (replica set or sharded cluster); when it does not, payout fails closed with a clear 503 and stores no payment state.

## Global Constraints

- Only edit `koperasi-eks` and `student-dashboard`; do not edit `uat-fin1`, Finance production, `.env`, `app/Config/App.php`, database config, or unrelated dirty files.
- An eligible paid period is one distinct installment period fully covered by savings records approved by Finance; multiple partial/approved rows in one period count once only when the period is fully covered.
- Minimum request eligibility is 12 approved-paid periods; early withdrawal is 12-35; completed contract is at least 36.
- Student submissions are hidden until the global Koperasi setting is enabled; it defaults to disabled.
- Block new savings submissions while a withdrawal is open; restore access after rejection and close savings only after successful payout.
- Student submission creates one linked Koperasi Expense in `uncategorized`; only the existing Expense mark-paid flow creates the accounting transaction.
- The 6% early penalty is server-calculated from the gross balance. Do not invent an interbank fee; Finance records the actual fee before payout and the net transfer is the ledger outflow.
- Preserve all pre-existing dirty changes; stage only feature files.

---

## File and Boundary Map

### Koperasi (`koperasi-eks`)

- `server/src/modules/savings-withdrawal/domain/withdrawalPolicy.js`: pure eligibility, gross-balance, penalty, and state-transition rules.
- `server/src/modules/savings-withdrawal/application/submitWithdrawal.js`: validates policy and orchestrates one request + linked Expense.
- `server/src/modules/savings-withdrawal/application/syncWithdrawalExpense.js`: Finance decision/rejection synchronization through the existing Expense lifecycle.
- `server/src/modules/savings-withdrawal/application/recordLegacyWithdrawal.js`: historical Finance closure and compensating cleanup if ledger posting fails.
- `server/src/modules/savings-withdrawal/infrastructure/mongooseWithdrawalRepository.js`: Mongoose persistence, member/savings lookups, idempotency.
- `server/src/models/savingsWithdrawal.model.js`: separate audited request aggregate and lifecycle state.
- `server/src/models/savingsWithdrawalSetting.model.js`: persisted toggle, default disabled.
- `server/src/models/expense.model.js`: optional link to withdrawal request and withdrawal source marker.
- `server/src/controllers/member/savingsWithdrawal.controller.js`, `server/src/controllers/admin/savingsWithdrawal.controller.js`: request parsing/response mapping only.
- `server/src/routes/member.routes.js`, `server/src/routes/admin.routes.js`: authenticated student/admin routes.
- `server/src/controllers/admin/expense.controller.js`: synchronize request state after Expense transitions; close member only after mark-paid transaction succeeds.
- `server/src/controllers/admin/member.controller.js`: membership/withdrawal query filters and response data.
- `server/src/controllers/admin/dashboard.controller.js`: pending withdrawal count and amount.
- `client/src/pages/Settings.jsx`: default-off student submission toggle.
- `client/src/pages/SavingsWithdrawals.jsx`: Finance queue, status filter, fee confirmation, and Expense links.
- `client/src/Layout/Topbar.jsx`: pending request notification with navigation.
- `client/src/pages/Members.jsx`: withdrawal status filter/indicator.
- `client/src/pages/MemberDetail.jsx`: legacy manual closure action and history/summary.
- Tests: `server/test/savings-withdrawal-policy.test.js`, `server/test/savings-withdrawal-submit.test.js`, `server/test/savings-withdrawal-expense-sync.test.js`, `server/test/savings-withdrawal-legacy.test.js`, and savings submission regression tests.

### Student Dashboard (`student-dashboard`)

- `app/Libraries/KoperasiSavingsWithdrawalGateway.php`: server-to-server member authentication/API adapter, including multipart proof retrieval proxy.
- `app/Controllers/Financial.php`: load withdrawal state for web savings page and handle form submission.
- `app/Controllers/Api/Financial.php`: authenticated JSON endpoints for native/web client status, submit, and proof proxy.
- `app/Config/Routes.php`: add only the scoped financial withdrawal routes; do not touch app config.
- `app/Views/pages/V_savings-backup.php`: close button, confirmation, request form, early/completed contract states, status timeline, and payment proof.
- `app/Views/pages/V_savings_closed.php`: closed-withdrawal summary and member-owned payout proof links.
- Tests: `tests/unit/KoperasiSavingsWithdrawalGatewayTest.php` verifies authenticated identity, payload, errors, and proof proxy.

## Task 1: Domain Policy and Red Tests

- Add tests first for 11/12/35/36 paid-period boundaries, multiple payments within one period, partial/pending/rejected exclusions, upgrades/carry-forward schedule behavior, 6% early penalty, rounding, and non-negative net amount.
- Run `cd koperasi-eks/server && node --test test/savings-withdrawal-policy.test.js`; confirm expected failing import before adding domain policy.
- Implement pure domain functions, reusing `shared/savingsSchedule.js` as the source of period math where possible.
- Run policy tests and existing `npm run test:accounting`.

## Task 2: Koperasi Request Aggregate, Settings, and Authenticated API

- Add model tests/use-case tests for default-off setting, valid submission, ineligible submission, duplicate open requests, setoran lock, rejection unlock, and admin legacy origin.
- Add request/settings models and repository/application services; use unique request/expense link fields to make retries idempotent.
- Add member GET current state, POST request, and GET own payment proof routes protected by `verifyMemberToken`.
- Add admin list/detail/review/settings routes protected by `verifyToken` and appropriate admin checks.
- Add expense link metadata; create student submission Expense as member applicant with no category lines and status `uncategorized`.
- Ensure failed Expense creation does not leave an active request; implement compensating cleanup and unique request/expense/member indexes.
- Run focused Node tests, API route checks, and lint on changed files.

## Task 3: Finance Expense Lifecycle and Ledger Integrity

- Add tests asserting Expense approval moves the linked request through review states, rejection records reason/restores savings, and mark-paid produces exactly one linked transaction and closes membership only on success.
- Update Expense lifecycle adapters to synchronize withdrawal state without changing ordinary Expense behavior.
- Populate only withdrawal-linked proof data in member-own API reads; enforce member ownership at file stream boundary.
- Confirm manual legacy close creates one paid Expense and accounting transaction only after Finance supplies account, category split, transfer date, and proof; compensate linked records if posting fails.
- Run full server accounting tests and targeted withdrawal tests; verify transaction retry has no duplicate effect.

## Task 4: Koperasi Admin UI

- Add Settings toggle UI and API handling; default disabled state must render clearly.
- Add member list filter/status summary and Member Detail legacy closure action/history.
- Add pending closure count/amount to dashboard and notification entry to existing topbar dropdown.
- Keep controller logic out of UI and keep all UI API calls in the dedicated API client.
- Run ESLint on changed files, Vite build, and relevant React tests.

## Task 5: Student Dashboard API Adapter and Student Experience

- Add failing PHP tests for using the authenticated student UUID, server-side member login, denial for mismatched identity, API error mapping, and proof proxy ownership.
- Implement Koperasi gateway methods for status, submit, and proof without exposing Koperasi credentials/token to the browser.
- Extend authenticated Student API routes and web POST route. Keep Student `app/Config/App.php`, environment files, and config untouched.
- Render the student journey: first confirmation; default/snapshot account and gross amount; month/year and reason; 12-35 early withdrawal terms; >=36 completion message; submit; statuses, gross/penalty/actual fees/net, timeline, proof.
- Ensure closed members reach the withdrawal summary before generic inactive-membership messaging, while unrelated inactive members retain the current closed-tabungan message.
- Match `main_layout` header/content/script sections and neighboring view asset parity.
- Run focused PHPUnit tests, route list/spark routes, PHP lint, and relevant view checks.

## Task 6: End-to-End Verification, Review, and Commits

- Run Koperasi focused tests plus `npm run test:accounting`, focused ESLint, and client build.
- Run Student focused PHPUnit suite, changed-file PHP lint, and `git diff --check` in both repositories.
- Inspect both complete diffs; verify no `.env`, app config, generated `dist/`, unrelated dirty file, or `uat-fin1` path is staged.
- Verify test cases for membership legacy behavior, overpayment carry-forward, early/completed withdrawal, rejection and resubmission, manual historical closure, payout fee and net amount, permissions, proof access, and idempotent ledger creation.
- Commit Koperasi and Student Dashboard changes separately with conventional commit messages. Do not push/deploy unless requested.
