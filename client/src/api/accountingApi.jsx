import axios from "axios";
import { API_URL } from "./config";

const api = axios.create({
  baseURL: `${API_URL}/api/admin`,
  withCredentials: true,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ========================
// Chart of Accounts
// ========================

export const getAccountsByType = async (type = "Assets") => {
  const res = await api.get(`/coa/${type}`);
  return res.data;
};

export const getAccountDetail = async (id) => {
  const res = await api.get(`/coa/account/${id}`);
  return res.data;
};

export const createAccount = async (data) => {
  const res = await api.post("/coa/account", data);
  return res.data;
};

export const updateAccount = async (id, data) => {
  const res = await api.put(`/coa/account/${id}`, data);
  return res.data;
};

export const deleteAccount = async (id) => {
  const res = await api.delete(`/coa/account/${id}`);
  return res.data;
};

export const getSubmenusByMasterType = async (masterType) => {
  const res = await api.get(`/coa/submenus/${masterType}`);
  return res.data;
};

export const getAllCategories = async () => {
  const res = await api.get("/coa/categories");
  return res.data;
};

export const getAssetsAccounts = async () => {
  const res = await api.get("/coa/assets-accounts");
  return res.data;
};

export const getMembers = async (verified = "") => {
  const params = verified ? `?verified=${verified}` : "";
  const res = await api.get(`/members${params}`);
  return res.data;
};

// ========================
// Transactions
// ========================

export const getTransactions = async (accountId = null, query = {}) => {
  const params = { ...query };
  if (accountId) params.account = accountId;
  const res = await api.get("/transactions", { params });
  return res.data;
};

export const getTransaction = async (id) => {
  const res = await api.get(`/transactions/${id}`);
  return res.data;
};

export const createTransaction = async (data) => {
  const res = await api.post("/transactions", data, {
    headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return res.data;
};

export const updateTransaction = async (id, data) => {
  const res = await api.put(`/transactions/${id}`, data, {
    headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return res.data;
};

export const deleteTransaction = async (id) => {
  const res = await api.delete(`/transactions/${id}`);
  return res.data;
};

export const toggleTransactionReviewed = async (id) => {
  const res = await api.patch(`/transactions/${id}/toggle-reviewed`);
  return res.data;
};

export const uploadTransactions = async (data) => {
  const res = await api.post("/transactions/upload", data);
  return res.data;
};

export const getAccountCurrency = async (id) => {
  const res = await api.get(`/transactions/account-currency/${id}`);
  return res.data;
};

// ========================
// Reports
// ========================

export const getProfitLossReport = async (params = {}) => {
  const res = await api.get("/reports/profit-loss", { params });
  return res.data;
};

export const filterProfitLossReport = async (payload = {}) => {
  const res = await api.post("/reports/profit-loss/filter", payload);
  return res.data;
};

export const exportProfitLossCsv = async (params = {}) => {
  const res = await api.get("/reports/profit-loss/export-csv", {
    params,
    responseType: "blob",
  });
  return res;
};

export const getBalanceSheetReport = async (params = {}) => {
  const res = await api.get("/reports/balance-sheet", { params });
  return res.data;
};

export const filterBalanceSheetReport = async (payload = {}) => {
  const res = await api.post("/reports/balance-sheet/filter", payload);
  return res.data;
};

export const exportBalanceSheetCsv = async (params = {}) => {
  const res = await api.get("/reports/balance-sheet/export-csv", {
    params,
    responseType: "blob",
  });
  return res;
};

export const checkBalanceSheetSplitIssues = async () => {
  const res = await api.get("/reports/balance-sheet/check-splits");
  return res.data;
};

export const getAccountTransactionsReport = async (params = {}) => {
  const res = await api.get("/reports/account-transactions", { params });
  return res.data;
};

export const filterAccountTransactionsReport = async (payload = {}) => {
  const res = await api.post("/reports/account-transactions/filter", payload);
  return res.data;
};

export const exportAccountTransactionsCsv = async (params = {}) => {
  const res = await api.get("/reports/account-transactions/export-csv", {
    params,
    responseType: "blob",
  });
  return res;
};

export const getAgedReceivablesReport = async (params = {}) => {
  const res = await api.get("/reports/aged-receivables", { params });
  return res.data;
};

// ========================
// Expenses
// ========================

export const getExpenseAdminDashboard = async (params = {}) => {
  const res = await api.get("/expenses/admin", { params });
  return res.data;
};

export const getExpenseReportData = async (params = {}) => {
  const res = await api.get("/expenses/report", { params });
  return res.data;
};

export const getExpenseDetailApi = async (id) => {
  const res = await api.get(`/expenses/${id}`);
  return res.data;
};

export const createExpenseApi = async (data) => {
  const res = await api.post("/expenses", data, {
    headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return res.data;
};

export const updateExpenseApi = async (id, data) => {
  const res = await api.put(`/expenses/${id}`, data, {
    headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return res.data;
};

export const approveExpenseApi = async (id) => {
  const res = await api.post(`/expenses/${id}/approve`);
  return res.data;
};

export const rejectExpenseApi = async (id, payload) => {
  const res = await api.post(`/expenses/${id}/reject`, payload);
  return res.data;
};

export const markExpensePaidApi = async (id, data) => {
  const res = await api.post(`/expenses/${id}/mark-paid`, data, {
    headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
  });
  return res.data;
};

export const deleteExpenseApi = async (id) => {
  const res = await api.delete(`/expenses/${id}`);
  return res.data;
};

export const deleteExpenseAttachmentApi = async (id) => {
  const res = await api.delete(`/expenses/attachments/${id}`);
  return res.data;
};

export const deleteExpensePaymentProofApi = async (id) => {
  const res = await api.delete(`/expenses/payment-proofs/${id}`);
  return res.data;
};

// ========================
// Finance Export
// ========================

export const getFinanceExportData = async (params = {}) => {
  const res = await api.get("/finance/export", { params });
  return res.data;
};

export const exportFinanceExcelApi = async (params = {}) => {
  const res = await api.get("/finance/export/excel", {
    params,
    responseType: "blob",
  });
  return res;
};

export const exportFinancePdfApi = async (params = {}) => {
  const res = await api.get("/finance/export/pdf", {
    params,
    responseType: "blob",
  });
  return res;
};

// ========================
// Bank Reconciliation
// ========================

export const getReconciliation = async (accountId = null) => {
  const params = accountId ? `?accountId=${accountId}` : "";
  const res = await api.get(`/reconciliation${params}`);
  return res.data;
};

export const startReconciliation = async (data) => {
  const res = await api.post("/reconciliation/start", data);
  return res.data;
};

export const processReconciliation = async (id) => {
  const res = await api.get(`/reconciliation/${id}`);
  return res.data;
};

export const toggleMatch = async (data) => {
  const res = await api.post("/reconciliation/toggle-match", data);
  return res.data;
};

export const completeReconciliation = async (id) => {
  const res = await api.post(`/reconciliation/${id}/complete`);
  return res.data;
};

export const cancelReconciliation = async (id) => {
  const res = await api.post(`/reconciliation/${id}/cancel`);
  return res.data;
};

export const removeReconciliationItems = async (data) => {
  const res = await api.post("/reconciliation/remove-items", data);
  return res.data;
};

export const updateClosingBalance = async (data) => {
  const res = await api.put("/reconciliation/update-closing-balance", data);
  return res.data;
};

export const viewReconciliation = async (id) => {
  const res = await api.get(`/reconciliation/${id}/view`);
  return res.data;
};

// ========================
// Sales Taxes
// ========================

export const getSalesTaxes = async (filter = "active") => {
  const res = await api.get(`/sales-tax?filter=${filter}`);
  return res.data;
};

export const getSalesTax = async (id) => {
  const res = await api.get(`/sales-tax/${id}`);
  return res.data;
};

export const createSalesTax = async (data) => {
  const res = await api.post("/sales-tax", data);
  return res.data;
};

export const updateSalesTax = async (id, data) => {
  const res = await api.put(`/sales-tax/${id}`, data);
  return res.data;
};

export const deleteSalesTaxApi = async (id) => {
  const res = await api.delete(`/sales-tax/${id}`);
  return res.data;
};

export const toggleSalesTax = async (id) => {
  const res = await api.patch(`/sales-tax/${id}/toggle`);
  return res.data;
};
