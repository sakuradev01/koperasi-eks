import {
  createBrowserRouter,
  Route,
  createRoutesFromElements,
} from "react-router-dom";
import MainLayout from "../Layout/MainLayout";
import AuthLayout from "../Layout/AuthLayout";
import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Members from "../pages/Members.jsx";
import MemberDetail from "../pages/MemberDetail.jsx";
import Products from "../pages/Products.jsx";
import Savings from "../pages/Savings.jsx";
import Loans from "../pages/Loans.jsx";
import Donations from "../pages/Donations.jsx";
import LoanProducts from "../pages/LoanProducts.jsx";
import LoanManagement from "../pages/LoanManagement.jsx";
import DanaDarurat from "../pages/DanaDarurat.jsx";
import Settings from "../pages/Settings.jsx";
import Reports from "../pages/Reports.jsx";
import PrivateRoute from "../utils/PrivateRoute.jsx";
import ChartOfAccounts from "../pages/accounting/ChartOfAccounts.jsx";
import Transactions from "../pages/accounting/Transactions.jsx";
import ReconciliationPage from "../pages/accounting/Reconciliation.jsx";
import SalesTaxes from "../pages/accounting/SalesTaxes.jsx";
import ProfitLoss from "../pages/accounting/reports/ProfitLoss.jsx";
import BalanceSheet from "../pages/accounting/reports/BalanceSheet.jsx";
import AccountTransactions from "../pages/accounting/reports/AccountTransactions.jsx";
import AgedReceivables from "../pages/accounting/reports/AgedReceivables.jsx";
import ExpenseAdmin from "../pages/expense/ExpenseAdmin.jsx";
import ExpenseCreate from "../pages/expense/ExpenseCreate.jsx";
import ExpenseReport from "../pages/expense/ExpenseReport.jsx";
import ExpenseDetail from "../pages/expense/ExpenseDetail.jsx";
import ExpenseEdit from "../pages/expense/ExpenseEdit.jsx";
import FinanceExport from "../pages/expense/FinanceExport.jsx";
import Invoices from "../pages/invoice/Invoices.jsx";
import InvoiceForm from "../pages/invoice/InvoiceForm.jsx";
import InvoiceDetail from "../pages/invoice/InvoiceDetail.jsx";
import InvoiceProducts from "../pages/invoice/InvoiceProducts.jsx";
import TermOfServices from "../pages/invoice/TermOfServices.jsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      {/* Auth Layout - untuk halaman login tanpa sidebar/header */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Public invoice preview - untuk link WhatsApp/Email customer */}
      <Route
        path="/public/invoice/:invoiceNumber"
        element={<InvoiceDetail publicView initialPrintVariant="standard" />}
      />
      <Route
        path="/public/invoice-japan/:invoiceNumber"
        element={<InvoiceDetail publicView initialPrintVariant="japan" />}
      />

      {/* Main Layout - untuk halaman dengan sidebar/header (Protected) */}
      <Route
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/master/anggota" element={<Members />} />
        <Route path="/master/anggota/:uuid" element={<MemberDetail />} />
        <Route path="/master/produk" element={<Products />} />
        <Route path="/master/loan-products" element={<LoanProducts />} />
        <Route path="/simpanan" element={<Savings />} />
        <Route path="/pinjaman" element={<Loans />} />
        <Route path="/donasi" element={<Donations />} />
        <Route path="/loan-management" element={<LoanManagement />} />
        <Route path="/dana-darurat" element={<DanaDarurat />} />
        <Route path="/laporan" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/akuntansi/transaksi" element={<Transactions />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/transactions/upload" element={<Transactions />} />
        <Route path="/reports/profit-loss" element={<ProfitLoss />} />
        <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
        <Route path="/reports/aged-receivables" element={<AgedReceivables />} />
        <Route
          path="/reports/account-transactions"
          element={<AccountTransactions />}
        />
        <Route path="/expense/admin" element={<ExpenseAdmin />} />
        <Route path="/expense/new" element={<ExpenseCreate />} />
        <Route path="/expense/report" element={<ExpenseReport />} />
        <Route path="/expense/detail/:id" element={<ExpenseDetail />} />
        <Route path="/expense/edit/:id" element={<ExpenseEdit />} />
        <Route path="/finance/export" element={<FinanceExport />} />
        <Route path="/invoice" element={<Invoices />} />
        <Route path="/invoice-products" element={<InvoiceProducts />} />
        <Route path="/invoice/new" element={<InvoiceForm />} />
        <Route
          path="/invoice/print/:invoiceNumber"
          element={<InvoiceDetail printOnly initialPrintVariant="standard" />}
        />
        <Route
          path="/invoice/print-japan/:invoiceNumber"
          element={<InvoiceDetail printOnly initialPrintVariant="japan" />}
        />
        <Route
          path="/payment/:invoiceNumber"
          element={<InvoiceDetail initialDetailTab="payment" />}
        />
        <Route path="/invoice/:invoiceNumber/edit" element={<InvoiceForm />} />
        <Route path="/invoice/:invoiceNumber" element={<InvoiceDetail />} />
        <Route path="/tos" element={<TermOfServices />} />
        <Route
          path="/akuntansi/rekonsiliasi"
          element={<ReconciliationPage />}
        />
        <Route path="/akuntansi/coa" element={<ChartOfAccounts />} />
        <Route
          path="/akuntansi/chart-of-accounts"
          element={<ChartOfAccounts />}
        />
        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/chart-of-accounts/create" element={<ChartOfAccounts />} />
        <Route
          path="/chart-of-accounts/edit/:id"
          element={<ChartOfAccounts />}
        />
        <Route
          path="/chart-of-accounts/delete/:id"
          element={<ChartOfAccounts />}
        />
        <Route path="/chart-of-accounts/:type" element={<ChartOfAccounts />} />
        <Route path="/akuntansi/pajak" element={<SalesTaxes />} />
      </Route>
    </Route>,
  ),
);

export { router };
