# API Route Definitions — Koperasi EKS (MERN)

> **Generated:** 2026-06-09
> **Base URL:** All routes under `/api` unless noted

---

## Route Mounting Architecture (app.js)

```
app.use("/api", Routes)          → index.js (member, admin, public)
app.use("/api", adminRoutes)      → admin.routes.js (auth, dashboard, CRUD)
app.use("/api/webhook", webhookRoutes)
```

### Note: Dual Mounting
`admin.routes.js` is mounted **twice**:
1. Via `routes/index.js` → `/api/admin/...`
2. Directly at `/api/...`

This means BOTH `/api/admin/products` AND `/api/products` serve the same controller.

---

## Middleware Reference

| Middleware | Source | Description |
|---|---|---|
| `verifyToken` | `auth.middleware.js` | JWT Bearer token → admin user lookup |
| `verifyMemberToken` | `memberAuth.middleware.js` | JWT → member lookup |
| `requireAdmin` | `auth.middleware.js` | Role check: `admin` only |
| `requireAdminOrStaff` | `auth.middleware.js` | Role check: `admin` or `staff` |
| `validate(schema)` | `validate.middleware.js` | Joi schema validation |
| `upload.single("proofFile")` | multer | Single file upload |
| `uploadReceipt` | multer | Multi-field receipt upload |

---

## 1. AUTH ROUTES (admin.routes.js — mounted at `/api` and `/api/admin`)

### Public (No Auth)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/auth/login` | `loginUser` | none |
| POST | `/api/auth/register` | `registerUser` | none |

### Protected (Auth Required)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/auth/logout` | `logoutUser` | verifyToken |
| GET | `/api/auth/me` | `getCurrentUser` | verifyToken |

---

## 2. DASHBOARD

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/dashboard` | `getDashboardStats` | verifyToken |

---

## 3. PRODUCT MANAGEMENT (admin)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/products` | `getAllProducts` | verifyToken |
| GET | `/api/products/:id` | `getProductById` | verifyToken |
| POST | `/api/products` | `createProduct` | verifyToken |
| PUT | `/api/products/:id` | `updateProduct` | verifyToken |
| DELETE | `/api/products/:id` | `deleteProduct` | verifyToken |
| PATCH | `/api/products/:id/toggle-status` | `toggleProductStatus` | verifyToken |

---

## 4. MEMBER MANAGEMENT (admin)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/members` | `getAllMembers` | verifyToken |
| GET | `/api/members/pending-count` | `getPendingCount` | verifyToken |
| POST | `/api/members/migrate-verified` | `migrateExistingMembers` | verifyToken |
| GET | `/api/members/:uuid` | `getMemberByUuid` | verifyToken |
| POST | `/api/members` | `createMember` | verifyToken |
| PUT | `/api/members/:uuid` | `updateMember` | verifyToken |
| DELETE | `/api/members/:uuid` | `deleteMember` | verifyToken |
| PATCH | `/api/members/:uuid/complete` | `markAsCompleted` | verifyToken |
| PATCH | `/api/members/:uuid/uncomplete` | `unmarkAsCompleted` | verifyToken |
| PATCH | `/api/members/:uuid/verify` | `verifyMember` | verifyToken |
| PATCH | `/api/members/:uuid/unverify` | `unverifyMember` | verifyToken |
| PATCH | `/api/members/:uuid/address/approve` | `approveMemberAddress` | verifyToken |

---

## 5. SAVINGS MANAGEMENT (admin)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/savings` | `getAllSavings` | verifyToken |
| GET | `/api/savings/:id` | `getSavingsById` | verifyToken |
| POST | `/api/savings` | `createSavings` | verifyToken + upload.single("proofFile") |
| PUT | `/api/savings/:id` | `updateSavings` | verifyToken + upload.single("proofFile") |
| DELETE | `/api/savings/:id` | `deleteSavings` | verifyToken |
| GET | `/api/savings/check-period/:memberId/:productId` | `getLastInstallmentPeriod` | verifyToken |
| PATCH | `/api/savings/:id/approve` | `approveSavings` | verifyToken |
| PATCH | `/api/savings/:id/reject` | `rejectSavings` | verifyToken |
| PATCH | `/api/savings/:id/partial` | `markAsPartial` | verifyToken |
| GET | `/api/savings/period-summary/:memberId/:productId/:installmentPeriod` | `getSavingsPeriodSummary` | verifyToken |

---

## 6. DONATION MANAGEMENT (admin)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/donations/overview` | `getDonationOverview` | verifyToken |
| GET | `/api/donations` | `getDonations` | verifyToken |
| PATCH | `/api/donations/:id/approve` | `approveDonation` | verifyToken |
| PATCH | `/api/donations/:id/reject` | `rejectDonation` | verifyToken |
| DELETE | `/api/donations/:id` | `deleteDonation` | verifyToken |
| GET | `/api/donation-campaigns` | `getDonationCampaigns` | verifyToken |
| POST | `/api/donation-campaigns` | `createDonationCampaign` | verifyToken |
| PUT | `/api/donation-campaigns/:id` | `updateDonationCampaign` | verifyToken |
| PATCH | `/api/donation-campaigns/:id/activate` | `activateDonationCampaign` | verifyToken |
| DELETE | `/api/donation-campaigns/:id` | `deleteDonationCampaign` | verifyToken |

---

## 7. LOANS (admin) — `/api/loans` and `/api/admin/loans`

**File:** `routes/loan.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/loans/upload-document` | `uploadLoanDocument` | verifyToken + upload.single("file") |
| POST | `/api/loans/apply` | `createLoanApplication` | verifyToken + validate(createLoanApplicationValidation) |
| POST | `/api/loans/calculate` | `calculateInstallment` | verifyToken + validate(calculateInstallmentValidation) |
| GET | `/api/loans` | `getAllLoans` | verifyToken + validate(getLoansQueryValidation) |
| GET | `/api/loans/member/:memberId` | `getLoansByMember` | verifyToken |
| GET | `/api/loans/:id` | `getLoanDetail` | verifyToken |
| POST | `/api/loans/:id/approve` | `approveLoan` | verifyToken + validate(processLoanValidation) |
| POST | `/api/loans/:id/reject` | `rejectLoan` | verifyToken + validate(processLoanValidation) |
| PATCH | `/api/loans/:id/status` | `updateLoanStatus` | verifyToken + validate(updateLoanStatusValidation) |
| PUT | `/api/loans/:id` | `updateLoan` | verifyToken |
| DELETE | `/api/loans/:id` | `deleteLoan` | verifyToken |
| POST | `/api/loans/check-overdue` | `checkOverdueLoans` | verifyToken |

---

## 8. LOAN PAYMENTS (admin) — `/api/loan-payments` and `/api/admin/loan-payments`

**File:** `routes/loanPayment.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/loan-payments` | `createPayment` | verifyToken + upload.single("proofFile") + validate |
| GET | `/api/loan-payments` | `getPaymentHistory` | verifyToken + validate |
| GET | `/api/loan-payments/loan/:loanId` | `getPaymentsByLoan` | verifyToken |
| GET | `/api/loan-payments/overdue` | `getOverduePayments` | verifyToken |
| POST | `/api/loan-payments/:id/approve` | `approvePayment` | verifyToken + validate |
| POST | `/api/loan-payments/:id/reject` | `rejectPayment` | verifyToken + validate |
| POST | `/api/loan-payments/bulk-approve` | `bulkApprovePayments` | verifyToken + validate |
| DELETE | `/api/loan-payments/:id` | `deletePayment` | verifyToken |
| PUT | `/api/loan-payments/:id` | `updatePayment` | verifyToken |

---

## 9. LOAN PRODUCTS (admin) — `/api/loan-products` and `/api/admin/loan-products`

**File:** `routes/loanProduct.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/loan-products` | `getAllLoanProducts` |
| POST | `/api/loan-products` | `createLoanProduct` |
| GET | `/api/loan-products/:id` | `getLoanProductById` |
| PUT | `/api/loan-products/:id` | `updateLoanProduct` |
| DELETE | `/api/loan-products/:id` | `deleteLoanProduct` |
| PUT | `/api/loan-products/:id/toggle` | `toggleLoanProductStatus` |

---

## 10. PRODUCT UPGRADE (admin) — `/api/product-upgrade`

**File:** `routes/admin/productUpgrade.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| POST | `/api/product-upgrade/calculate` | `calculateUpgradeCompensation` |
| POST | `/api/product-upgrade/execute` | `executeProductUpgrade` |
| GET | `/api/product-upgrade/history/:memberId` | `getMemberUpgradeHistory` |
| PATCH | `/api/product-upgrade/cancel/:upgradeId` | `cancelProductUpgrade` |

---

## 11. DANA DARURAT (admin) — `/api/dana-darurat`

**File:** `routes/danaDarurat.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/dana-darurat/submit` | `submitApplication` | verifyToken |
| POST | `/api/dana-darurat/draft` | `saveDraft` | verifyToken |
| GET | `/api/dana-darurat` | `getAllApplications` | verifyToken |
| GET | `/api/dana-darurat/:id` | `getApplicationDetail` | verifyToken |
| PATCH | `/api/dana-darurat/:id/status` | `updateStatus` | verifyToken |
| POST | `/api/dana-darurat/upload` | `uploadDocument` | verifyToken + upload.single("file") |

---

## 12. ACCOUNTING — COA — `/api/coa` and `/api/admin/coa`

**File:** `routes/coa.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/coa/categories` | `getAllCategories` |
| GET | `/api/coa/assets-accounts` | `getAssetsAccounts` |
| GET | `/api/coa/submenus/:masterType` | `getSubmenusByMasterType` |
| POST | `/api/coa/getSubmenus` | `getSubmenusLegacy` |
| GET | `/api/coa/account/:id` | `getAccountDetail` |
| POST | `/api/coa/account` | `createAccount` |
| PUT | `/api/coa/account/:id` | `updateAccount` |
| DELETE | `/api/coa/account/:id` | `deleteAccount` |
| GET | `/api/coa/:type?` | `getAccountsByType` |

---

## 13. ACCOUNTING — TRANSACTIONS — `/api/transactions`

**File:** `routes/transaction.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/transactions` | `getTransactions` | verifyToken |
| GET | `/api/transactions/account-currency/:id` | `getAccountCurrency` | verifyToken |
| GET | `/api/transactions/:id` | `getTransaction` | verifyToken |
| POST | `/api/transactions` | `createTransaction` | verifyToken + uploadReceipt |
| PUT | `/api/transactions/:id` | `updateTransaction` | verifyToken + uploadReceipt |
| DELETE | `/api/transactions/:id` | `deleteTransaction` | verifyToken |
| PATCH | `/api/transactions/:id/toggle-reviewed` | `toggleReviewed` | verifyToken |
| POST | `/api/transactions/upload` | `uploadTransactions` | verifyToken |

---

## 14. ACCOUNTING — RECONCILIATION — `/api/reconciliation`

**File:** `routes/reconciliation.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/reconciliation` | `getReconciliation` |
| POST | `/api/reconciliation/start` | `startReconciliation` |
| POST | `/api/reconciliation/toggle-match` | `toggleMatch` |
| POST | `/api/reconciliation/remove-items` | `removeItems` |
| PUT | `/api/reconciliation/update-closing-balance` | `updateClosingBalance` |
| POST | `/api/reconciliation/:id/complete` | `completeReconciliation` |
| POST | `/api/reconciliation/:id/cancel` | `cancelReconciliation` |
| GET | `/api/reconciliation/:id/view` | `viewReconciliation` |
| GET | `/api/reconciliation/:id` | `processReconciliation` |

---

## 15. ACCOUNTING — SALES TAX — `/api/sales-tax`

**File:** `routes/salesTax.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/sales-tax` | `getSalesTaxes` |
| GET | `/api/sales-tax/:id` | `getSalesTax` |
| POST | `/api/sales-tax` | `createSalesTax` |
| PUT | `/api/sales-tax/:id` | `updateSalesTax` |
| DELETE | `/api/sales-tax/:id` | `deleteSalesTax` |
| PATCH | `/api/sales-tax/:id/toggle` | `toggleSalesTax` |

---

## 16. REPORTS — `/api/reports`

**File:** `routes/reports.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/reports/profit-loss` | `getProfitLoss` |
| POST | `/api/reports/profit-loss/filter` | `filterProfitLoss` |
| GET | `/api/reports/profit-loss/export-csv` | `exportProfitLossCsv` |
| GET | `/api/reports/balance-sheet` | `getBalanceSheet` |
| POST | `/api/reports/balance-sheet/filter` | `filterBalanceSheet` |
| GET | `/api/reports/balance-sheet/export-csv` | `exportBalanceSheetCsv` |
| GET | `/api/reports/balance-sheet/check-splits` | `checkBalanceSheetSplits` |
| GET | `/api/reports/account-transactions` | `getAccountTransactionsReport` |
| POST | `/api/reports/account-transactions/filter` | `filterAccountTransactionsReport` |
| GET | `/api/reports/account-transactions/export-csv` | `exportAccountTransactionsCsv` |
| GET | `/api/reports/aged-receivables` | `getAgedReceivables` |

---

## 17. EXPENSES — `/api/expenses`

**File:** `routes/expense.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/expenses/admin` | `getExpenseAdmin` | verifyToken |
| GET | `/api/expenses/report` | `getExpenseReport` | verifyToken |
| GET | `/api/expenses/:id` | `getExpenseDetail` | verifyToken |
| POST | `/api/expenses` | `createExpense` | verifyToken + uploadExpenseFiles |
| PUT | `/api/expenses/:id` | `updateExpense` | verifyToken + uploadExpenseFiles |
| POST | `/api/expenses/:id/approve` | `approveExpense` | verifyToken |
| POST | `/api/expenses/:id/reject` | `rejectExpense` | verifyToken |
| POST | `/api/expenses/:id/mark-paid` | `markExpensePaid` | verifyToken + uploadExpenseFiles |
| DELETE | `/api/expenses/:id` | `deleteExpense` | verifyToken |
| DELETE | `/api/expenses/attachments/:id` | `deleteExpenseAttachment` | verifyToken |
| DELETE | `/api/expenses/payment-proofs/:id` | `deleteExpensePaymentProof` | verifyToken |

---

## 18. FINANCE EXPORT — `/api/finance/export`

**File:** `routes/financeExport.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/finance/export` | `getFinanceExportIndex` |
| GET | `/api/finance/export/excel` | `exportFinanceExcel` |
| GET | `/api/finance/export/pdf` | `exportFinancePdf` |

---

## 19. INVOICES — `/api/invoices`

**File:** `routes/invoice.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/invoices/meta` | `getInvoiceMeta` | verifyToken |
| GET | `/api/invoices/validate-number` | `validateInvoiceNumber` | verifyToken |
| GET | `/api/invoices` | `getAllInvoices` | verifyToken |
| GET | `/api/invoices/:invoiceNumber` | `getInvoiceByNumber` | verifyToken |
| POST | `/api/invoices` | `createInvoice` | verifyToken |
| PUT | `/api/invoices/:invoiceNumber` | `updateInvoice` | verifyToken |
| PATCH | `/api/invoices/:invoiceNumber/approve` | `approveInvoiceDraft` | verifyToken |
| DELETE | `/api/invoices/:invoiceNumber` | `deleteInvoice` | verifyToken |
| POST | `/api/invoices/:invoiceNumber/payments` | `addInvoicePayment` | verifyToken + uploadPaymentAttachment |
| PUT | `/api/invoices/:invoiceNumber/payments/:paymentId` | `updateInvoicePayment` | verifyToken + uploadPaymentAttachment |
| DELETE | `/api/invoices/:invoiceNumber/payments/:paymentId` | `deleteInvoicePayment` | verifyToken |

---

## 20. INVOICE PRODUCTS — `/api/invoice-products`

**File:** `routes/invoiceProduct.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/invoice-products` | `getAllInvoiceProducts` |
| GET | `/api/invoice-products/:id` | `getInvoiceProductById` |
| POST | `/api/invoice-products` | `createInvoiceProduct` |
| PUT | `/api/invoice-products/:id` | `updateInvoiceProduct` |
| POST | `/api/invoice-products/:id/archive` | `archiveInvoiceProduct` |
| POST | `/api/invoice-products/:id/unarchive` | `unarchiveInvoiceProduct` |
| DELETE | `/api/invoice-products/:id` | `deleteInvoiceProduct` |

---

## 21. TOS (Terms of Service) — `/api/tos`

**File:** `routes/tos.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/tos` | `getAllTos` |
| GET | `/api/tos/:id` | `getTosById` |
| POST | `/api/tos` | `createTos` |
| PUT | `/api/tos/:id` | `updateTos` |
| POST | `/api/tos/:id/archive` | `archiveTos` |
| POST | `/api/tos/:id/unarchive` | `unarchiveTos` |
| DELETE | `/api/tos/:id` | `deleteTos` |

---

## 22. LEGACY CHART OF ACCOUNTS PATHS — `/api/chart-of-accounts`

**File:** `routes/admin.routes.js` | **All routes:** `verifyToken`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/chart-of-accounts` | `getAccountsByType` |
| GET | `/api/chart-of-accounts/create` | `getAccountsByType` |
| POST | `/api/chart-of-accounts/create` | `createAccount` |
| GET | `/api/chart-of-accounts/edit/:id` | `getAccountDetail` |
| POST | `/api/chart-of-accounts/edit/:id` | `updateAccount` |
| GET | `/api/chart-of-accounts/delete/:id` | `deleteAccount` |
| POST | `/api/chart-of-accounts/delete/:id` | `deleteAccount` |
| POST | `/api/chart-of-accounts/getSubmenus` | `getSubmenusLegacy` |
| GET | `/api/chart-of-accounts/:type` | `getAccountsByType` |

---

## 23. SYSTEM (DANGER ZONE) — `/api/system`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/system/clear-all` | `clearAllData` | verifyToken |

---

## 24. MEMBER PORTAL ROUTES — `/api/member`

**File:** `routes/member.routes.js`

### Auth (Member)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/api/member/auth/login` | `loginMember` | none |
| POST | `/api/member/auth/logout` | `logoutMember` | verifyMemberToken |
| GET | `/api/member/auth/me` | `getCurrentMember` | verifyMemberToken |
| PATCH | `/api/member/profile/address` | `updateMemberAddress` | verifyMemberToken |

### Savings (Member)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/member/savings` | `getMemberSavings` | verifyMemberToken |
| POST | `/api/member/savings` | `createMemberSaving` | verifyMemberToken + upload.single("proofFile") |
| GET | `/api/member/savings/summary` | `getMemberSavingsSummary` | verifyMemberToken |
| GET | `/api/member/savings/:id` | `getMemberSavingById` | verifyMemberToken |

### Loans (Member) — `/api/member/loans`

**File:** `routes/member/loan.routes.js` | **All routes:** `verifyMemberToken`

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/api/member/loans/products` | `getAvailableLoanProducts` | verifyMemberToken |
| GET | `/api/member/loans/my-loans` | `getMemberLoans` | verifyMemberToken |
| POST | `/api/member/loans/apply` | `applyForLoan` | verifyMemberToken |
| POST | `/api/member/loans/calculate` | `calculateLoanSimulation` | verifyMemberToken |
| POST | `/api/member/loans/payment` | `makeLoanPayment` | verifyMemberToken + upload.single("proofFile") |
| GET | `/api/member/loans/payments` | `getMemberLoanPayments` | verifyMemberToken |
| GET | `/api/member/loans/schedule/:loanId` | `getLoanPaymentSchedule` | verifyMemberToken |

### Dana Darurat (Member) — `/api/member/dana-darurat`

**File:** `routes/member/danaDarurat.routes.js` | **All routes:** `verifyMemberToken`

| Method | Path | Handler |
|---|---|---|
| POST | `/api/member/dana-darurat/submit` | `memberSubmit` |
| POST | `/api/member/dana-darurat/draft` | `memberSaveDraft` |
| GET | `/api/member/dana-darurat` | `memberMyApplications` |
| GET | `/api/member/dana-darurat/:id` | `memberApplicationDetail` |

---

## 25. PUBLIC ROUTES (No Auth) — `/api/public`

**File:** `routes/public.routes.js`

| Method | Path | Handler |
|---|---|---|
| GET | `/api/public/savings` | `getPublicSavings` |
| GET | `/api/public/members` | `getPublicMembers` |
| GET | `/api/public/products` | `getPublicProducts` |
| GET | `/api/public/summary` | `getPublicSummary` |
| GET | `/api/public/member/:uuid` | `getMemberByUuid` |
| GET | `/api/public/student-dashboard/:uuid` | `getStudentDashboardSavings` |
| POST | `/api/public/register-koperasi` | `registerKoperasi` |
| GET | `/api/public/check-member/:uuid` | `checkMemberStatus` |
| GET | `/api/public/donations/overview/:studentUuid` | `getDonationOverview` |
| POST | `/api/public/donations` | `createDonation` + multer |
| POST | `/api/public/donations/checkout-intents` | `createCheckoutIntent` |
| GET | `/api/public/invoices/:invoiceNumber` | `getPublicInvoiceByNumber` |
| GET | `/api/public/member-invoices/:uuid` | `getPublicMemberInvoicesByUuid` |
| GET | `/api/public/migrate-members?key=samit-migrate-2026` | inline migration |

---

## 26. WEBHOOK ROUTES — `/api/webhook`

**File:** `routes/webhook.routes.js` | **No Auth** (externally called by DOKU)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/webhook/doku-checkout` | process DOKU checkout callback |
| POST | `/api/webhook/doku-qris` | process DOKU QRIS callback |

---

## 27. OTHER ROUTES

| Method | Path | Source | Notes |
|---|---|---|---|
| GET | `/` | app.js | Welcome message |
| POST | `/testing` | app.js | Test endpoint |
| GET | `/uploads/*` | app.js | Static file serving (uploads) |
| GET | `/upload/*` | app.js | Legacy static file serving |

---

## 28. PRODUCT ROUTES (Legacy — from product.routes.js)

**File:** `routes/product.routes.js` — **NOT mounted in current app.js** (superseded by admin.routes.js)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/` | `getAllProducts` | none |
| GET | `/:id` | `getProductById` | none |
| POST | `/` | `createProduct` | verifyToken + requireAdmin |
| PUT | `/:id` | `updateProduct` | verifyToken + requireAdmin |
| DELETE | `/:id` | `deleteProduct` | verifyToken + requireAdmin |
| PUT | `/:id/toggle` | `toggleProductStatus` | verifyToken + requireAdmin |

## 29. SAVINGS ROUTES (Legacy — from savings.routes.js)

**File:** `routes/savings.routes.js` — **NOT mounted in current app.js** (superseded by admin.routes.js)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| GET | `/` | `getAllSavings` | verifyToken |
| POST | `/` | `createSavings` | verifyToken + upload.single("proofFile") |
| GET | `/:id` | `getSavingsById` | verifyToken |
| PUT | `/:id` | `updateSavings` | verifyToken + upload.single("proofFile") |
| DELETE | `/:id` | `deleteSavings` | verifyToken |
| GET | `/member/:memberId` | `getSavingsByMember` | verifyToken |
| GET | `/summary` | `getSavingsSummary` | verifyToken |
| GET | `/check-period/:memberId/:productId` | `getLastInstallmentPeriod` | verifyToken |
| GET | `/student-dashboard/:memberUuid` | `getStudentDashboardSavings` | verifyToken |

## 30. AUTH ROUTES (Legacy — from auth.routes.js)

**File:** `routes/auth.routes.js` — **NOT mounted in current app.js** (superseded by admin.routes.js)

| Method | Path | Handler | Middleware |
|---|---|---|---|
| POST | `/login` | `loginUser` | none |
| POST | `/register` | `registerUser` | none |
| GET | `/me` | `getCurrentUser` | verifyToken |
| POST | `/logout` | `logoutUser` | verifyToken |

---

## Summary Statistics

| Category | Active Endpoints | Mounted Paths |
|---|---|---|
| Admin Auth | 4 | `/api/auth/*`, `/api/admin/auth/*` |
| Dashboard | 1 | `/api/dashboard`, `/api/admin/dashboard` |
| Products | 6 | `/api/products/*`, `/api/admin/products/*` |
| Members | 12 | `/api/members/*`, `/api/admin/members/*` |
| Savings | 10 | `/api/savings/*`, `/api/admin/savings/*` |
| Donations | 10 | `/api/donations/*`, `/api/donation-campaigns/*` |
| Loans (admin) | 12 | `/api/loans/*`, `/api/admin/loans/*` |
| Loan Payments | 9 | `/api/loan-payments/*`, `/api/admin/loan-payments/*` |
| Loan Products | 6 | `/api/loan-products/*`, `/api/admin/loan-products/*` |
| Product Upgrade | 4 | `/api/product-upgrade/*`, `/api/admin/product-upgrade/*` |
| Dana Darurat (admin) | 6 | `/api/dana-darurat/*`, `/api/admin/dana-darurat/*` |
| COA | 9 | `/api/coa/*`, `/api/admin/coa/*` |
| Transactions | 8 | `/api/transactions/*`, `/api/admin/transactions/*` |
| Reconciliation | 9 | `/api/reconciliation/*`, `/api/admin/reconciliation/*` |
| Sales Tax | 6 | `/api/sales-tax/*`, `/api/admin/sales-tax/*` |
| Reports | 11 | `/api/reports/*`, `/api/admin/reports/*` |
| Expenses | 11 | `/api/expenses/*`, `/api/admin/expenses/*` |
| Finance Export | 3 | `/api/finance/export/*`, `/api/admin/finance/export/*` |
| Invoices | 11 | `/api/invoices/*`, `/api/admin/invoices/*` |
| Invoice Products | 7 | `/api/invoice-products/*`, `/api/admin/invoice-products/*` |
| TOS | 7 | `/api/tos/*`, `/api/admin/tos/*` |
| Legacy Chart of Accts | 9 | `/api/chart-of-accounts/*` |
| System | 1 | `/api/system/*` |
| Member Portal | 15 | `/api/member/*` |
| Public (no auth) | 14 | `/api/public/*` |
| Webhooks | 2 | `/api/webhook/*` |
| Other | 4 | `/`, `/testing`, `/uploads`, `/upload` |

**Total Active Endpoints: ~198** (including dual-mounted paths)
