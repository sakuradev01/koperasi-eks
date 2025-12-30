import {
  createBrowserRouter,
  Route,
  createRoutesFromElements,
} from "react-router-dom";
import MainLayout from "../Layout/MainLayout";
import AuthLayout from "../Layout/AuthLayout";
import Home from "../pages/Home.jsx";
import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Members from "../pages/Members.jsx";
import MemberDetail from "../pages/MemberDetail.jsx";
import Products from "../pages/Products.jsx";
import Savings from "../pages/Savings.jsx";
import Loans from "../pages/Loans.jsx";
import LoanProducts from "../pages/LoanProducts.jsx";
import LoanManagement from "../pages/LoanManagement.jsx";
import Settings from "../pages/Settings.jsx";
import PrivateRoute from "../utils/PrivateRoute.jsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      {/* Auth Layout - untuk halaman login tanpa sidebar/header */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Main Layout - untuk halaman dengan sidebar/header (Protected) */}
      <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/master/anggota" element={<Members />} />
        <Route path="/master/anggota/:uuid" element={<MemberDetail />} />
        <Route path="/master/produk" element={<Products />} />
        <Route path="/master/loan-products" element={<LoanProducts />} />
        <Route path="/simpanan" element={<Savings />} />
        <Route path="/pinjaman" element={<Loans />} />
        <Route path="/loan-management" element={<LoanManagement />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Route>
  )
);

export { router };
