import express from "express";
import {
  getProfitLoss,
  filterProfitLoss,
  exportProfitLossCsv,
  getBalanceSheet,
  filterBalanceSheet,
  exportBalanceSheetCsv,
  checkBalanceSheetSplits,
  getAccountTransactionsReport,
  filterAccountTransactionsReport,
  exportAccountTransactionsCsv,
  getAgedReceivables,
} from "../controllers/admin/reports.controller.js";
import {
  getInvoiceProjectionReport,
} from "../controllers/admin/invoiceProjectionReport.controller.js";
import { requireFeaturePermission } from "../middlewares/permission.middleware.js";

const router = express.Router();

// Profit & Loss
router.get("/profit-loss", getProfitLoss);
router.post("/profit-loss/filter", filterProfitLoss);
router.get("/profit-loss/export-csv", exportProfitLossCsv);

// Balance Sheet
router.get("/balance-sheet", getBalanceSheet);
router.post("/balance-sheet/filter", filterBalanceSheet);
router.get("/balance-sheet/export-csv", exportBalanceSheetCsv);
router.get("/balance-sheet/check-splits", checkBalanceSheetSplits);

// Account Transactions
router.get("/account-transactions", getAccountTransactionsReport);
router.post("/account-transactions/filter", filterAccountTransactionsReport);
router.get("/account-transactions/export-csv", exportAccountTransactionsCsv);

// Aged Receivables
router.get("/aged-receivables", getAgedReceivables);

// Invoice payment projections
router.get(
  "/invoice-projections",
  requireFeaturePermission("reports", "view"),
  getInvoiceProjectionReport,
);

export default router;
