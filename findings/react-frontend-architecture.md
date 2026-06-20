# React Frontend Architecture — koperasi-eks

## Stack
- **Build**: Vite (vite.config.js)
- **Framework**: React 18 (JSX, no TypeScript)
- **State**: Redux Toolkit (auth only), local state (useState) for everything else
- **Storage**: redux-persist (auth slice → localStorage)
- **Routing**: React Router v6 (createBrowserRouter)
- **HTTP**: Axios with interceptors
- **CSS**: Tailwind CSS
- **UI Patterns**: Modal-based CRUD, toasts (react-toastify)
- **Charts**: chart.js (via wrapper components)
- **PDF**: jsPDF + jspdf-autotable
- **Date**: date-fns (id locale)

## Entry Point
`client/src/main.jsx` → renders `<App>` inside `<Provider store={store}>`

## App Root (App.jsx)
- Wraps app in `<Provider>` + `<PersistGate>` (from redux-persist)
- On mount: checks localStorage for existing auth token → dispatches `login()` to Redux
- Renders `<RouterProvider router={router} />`

## Routing (routes/index.jsx)
Two layouts:
1. **AuthLayout** — bare wrapper for `/login`
2. **MainLayout** — sidebar + topbar + `<Outlet>`, protected by `<PrivateRoute>`

Public routes (no auth):
- `/login`
- `/public/invoice/:invoiceNumber` (customer invoice preview via WhatsApp/Email)
- `/public/invoice-japan/:invoiceNumber`

Protected routes (require auth):
- `/`, `/dashboard` → Dashboard
- `/simpanan` → Savings (main feature, ~2362 lines)
- `/pinjaman` → Loans
- `/donasi` → Donations
- `/loan-management` → LoanManagement
- `/dana-darurat` → DanaDarurat
- `/laporan` → Reports
- `/master/anggota`, `/master/anggota/:uuid` → Members, MemberDetail
- `/master/produk` → Products (savings products)
- `/master/loan-products` → LoanProducts
- `/settings` → Settings
- `/akuntansi/*` → Accounting (COA, Transactions, Reconciliation, SalesTaxes)
- `/reports/profit-loss`, `/reports/balance-sheet`, etc. → Financial reports
- `/expense/*` → Expense management
- `/invoice/*` → Invoicing (create, edit, detail, print, payment)
- `/transactions`, `/transactions/upload` → Transactions
- `/chart-of-accounts`, `/chart-of-accounts/*` → ChartOfAccounts

## Layout Structure
```
MainLayout
├── Sidebar (desktop: fixed left, mobile: slide-out overlay)
├── Topbar (header with: hamburger menu, logo, notification bell, user avatar, logout)
└── <Outlet /> (page content)
```

## State Management
- **Redux store**: Single `auth` slice with `status` (boolean) and `userData` (object)
- **Persisted to localStorage** via redux-persist (only auth slice)
- **All other state**: local useState inside components (data fetched per-page)
- No React Query, no SWR — manual useEffect + axios calls

## Auth Flow
1. Login form calls `logIn()` → stores token + user in localStorage
2. `api/authApi.jsx` axios interceptor attaches `Bearer` token to all requests
3. 401 response interceptor clears localStorage → redirects to `/login`
4. `PrivateRoute.jsx` checks Redux status + localStorage token
5. `App.jsx` useEffect restores Redux state from localStorage on page refresh

## API Layer
- `api/authApi.jsx` — main axios instance with interceptors; auth functions (login, register, logout, getCurrentUser)
- `api/savingsApi.jsx` — axios instance for savings with FormData support
- `api/loanApi.jsx` — loan API
- `api/accountingApi.jsx`, `api/invoiceApi.jsx`, `api/invoiceProductApi.jsx`, `api/tosApi.jsx`
- `api/config.js` — API_URL constant
- `conf/conf.js` — server URL config

## Key Pages
| Page | File | Notable |
|------|------|---------|
| Dashboard | `pages/Dashboard.jsx` | Stat cards, recent activity, monthly chart |
| Members | `pages/Members.jsx` | CRUD table + modal form |
| MemberDetail | `pages/MemberDetail.jsx` | Individual member view |
| Savings | `pages/Savings.jsx` | 2362 lines — most complex page. Period calculation, proof upload, modals, export PDF |
| Loans | `pages/Loans.jsx` | Loan list + detail |
| Settings | `pages/Settings.jsx` | App settings |
| Login | `pages/Login.jsx` | Auth form |

## Components
- `components/savings/SavingsModal.jsx` — complex modal with auto-fill member→product, period checking
- `components/savings/SavingsTable.jsx` — savings data table
- `components/Pagination.jsx` — pagination component
- `components/ConfirmDialog.jsx` — confirmation dialog
- `components/charts/` — chart wrappers
- `components/auth/Login.jsx` — login form

## Sidebar Menu Structure
```
Dashboard
Simpanan
Donasi
Manajemen Pinjaman
Dana Darurat
Laporan
Invoice (collapsible: Pinjaman, Invoice, Invoice Product, Tos)
Master Data (collapsible: Anggota, Produk Simpanan, Produk Pinjaman)
Expenses (collapsible: Management, Create, Report, Export)
Akuntansi (collapsible: Transaksi, Rekonsiliasi, COA, Pajak)
Reports (collapsible: P&L, Balance Sheet, Aged Receivables, Account Transactions)
Pengaturan
```

## Notifications (Topbar)
- Polls every 30s: pending members, pending address updates, pending savings
- Dropdown with read/unread tracking (localStorage)
- Links to relevant filtered pages

## Patterns Used
- Modal-based CRUD (no separate edit pages for most features)
- Controlled forms with useState
- useEffect + axios for data fetching (no React Query)
- Tailwind CSS with pink/rose theme ("Sakura Mitra")
- Mobile-responsive sidebar (overlay on mobile, fixed on desktop)
- Toast notifications (react-toastify)
