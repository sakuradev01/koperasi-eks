import express from "express";
import fs from "fs";
import { 
  loginUser, 
  registerUser, 
  getCurrentUser, 
  logoutUser 
} from "../controllers/admin/auth.controller.js";
import { getDashboardStats } from "../controllers/admin/dashboard.controller.js";
import { 
  getAllProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  toggleProductStatus 
} from "../controllers/admin/product.controller.js";
import { 
  getAllMembers, 
  getMemberByUuid, 
  createMember, 
  updateMember, 
  deleteMember,
  markAsCompleted,
  unmarkAsCompleted,
  verifyMember,
  unverifyMember,
  approveMemberAddress,
  getPendingCount,
  migrateExistingMembers
} from "../controllers/admin/member.controller.js";
import { 
  getAllSavings, 
  getSavingsById, 
  createSavings, 
  updateSavings, 
  deleteSavings,
  getLastInstallmentPeriod 
} from "../controllers/admin/savings.controller.js";
import { 
  approveSavings, 
  rejectSavings, 
  markAsPartial,
  getSavingsPeriodSummary 
} from "../controllers/admin/savingsApproval.controller.js";
import {
  getDonationOverview,
  getDonationCampaigns,
  createDonationCampaign,
  updateDonationCampaign,
  activateDonationCampaign,
  deleteDonationCampaign,
  getDonations,
  approveDonation,
  rejectDonation,
  deleteDonation,
} from "../controllers/admin/donation.controller.js";
import { clearAllData } from "../controllers/admin/system.controller.js";
import { verifyToken, requireAdmin } from "../middlewares/auth.middleware.js";
import multer from "multer";
import productUpgradeRoutes from "./admin/productUpgrade.routes.js";
import loanRoutes from "./loan.routes.js";
import loanPaymentRoutes from "./loanPayment.routes.js";
import loanProductRoutes from "./loanProduct.routes.js";
import operatorRoutes from "./operator.routes.js";
import danaDaruratRoutes from "./danaDarurat.routes.js";
import coaRoutes from "./coa.routes.js";
import transactionRoutes from "./transaction.routes.js";
import reconciliationRoutes from "./reconciliation.routes.js";
import salesTaxRoutes from "./salesTax.routes.js";
import reportsRoutes from "./reports.routes.js";
import expenseRoutes from "./expense.routes.js";
import financeExportRoutes from "./financeExport.routes.js";
import invoiceRoutes from "./invoice.routes.js";
import invoiceProductRoutes from "./invoiceProduct.routes.js";
import tosRoutes from "./tos.routes.js";
import {
  getAccountsByType,
  getAccountDetail,
  createAccount,
  updateAccount,
  deleteAccount,
  getSubmenusLegacy,
} from "../controllers/admin/coa.controller.js";

import path from "path";
import { ensureUploadsSubdirs, getUploadsDir } from "../utils/uploadsDir.js";

// Ensure upload directory exists
const { simpanan: simpananDir } = ensureUploadsSubdirs();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, simpananDir + path.sep);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bukti-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

const router = express.Router();

// Authentication routes
router.post("/auth/login", loginUser);
router.post("/auth/register", registerUser);
router.post("/auth/logout", verifyToken, logoutUser);
router.get("/auth/me", verifyToken, getCurrentUser);

// Dashboard routes
router.get("/dashboard", verifyToken, getDashboardStats);

// Product management routes
router.get("/products", verifyToken, getAllProducts);
router.get("/products/:id", verifyToken, getProductById);
router.post("/products", verifyToken, createProduct);
router.put("/products/:id", verifyToken, updateProduct);
router.delete("/products/:id", verifyToken, deleteProduct);
router.patch("/products/:id/toggle-status", verifyToken, toggleProductStatus);

// Member management routes
router.get("/members", verifyToken, getAllMembers);
router.get("/members/pending-count", verifyToken, getPendingCount);
router.post("/members/migrate-verified", verifyToken, migrateExistingMembers);
router.get("/members/:uuid", verifyToken, getMemberByUuid);
router.post("/members", verifyToken, createMember);
router.put("/members/:uuid", verifyToken, updateMember);
router.delete("/members/:uuid", verifyToken, deleteMember);
router.patch("/members/:uuid/complete", verifyToken, markAsCompleted);
router.patch("/members/:uuid/uncomplete", verifyToken, unmarkAsCompleted);
router.patch("/members/:uuid/verify", verifyToken, verifyMember);
router.patch("/members/:uuid/unverify", verifyToken, unverifyMember);
router.patch("/members/:uuid/address/approve", verifyToken, approveMemberAddress);

// Savings management routes
router.get("/savings", verifyToken, getAllSavings);
router.get("/savings/:id", verifyToken, getSavingsById);
router.post("/savings", verifyToken, upload.single('proofFile'), createSavings);
router.put("/savings/:id", verifyToken, upload.single('proofFile'), updateSavings);
router.delete("/savings/:id", verifyToken, deleteSavings);
router.get("/savings/check-period/:memberId/:productId", verifyToken, getLastInstallmentPeriod);

// Savings approval/rejection routes
router.patch("/savings/:id/approve", verifyToken, approveSavings);
router.patch("/savings/:id/reject", verifyToken, rejectSavings);
router.patch("/savings/:id/partial", verifyToken, markAsPartial);
router.get("/savings/period-summary/:memberId/:productId/:installmentPeriod", verifyToken, getSavingsPeriodSummary);

// Donation routes
router.get("/donations/overview", verifyToken, getDonationOverview);
router.get("/donations", verifyToken, getDonations);
router.patch("/donations/:id/approve", verifyToken, approveDonation);
router.patch("/donations/:id/reject", verifyToken, rejectDonation);
router.delete("/donations/:id", verifyToken, deleteDonation);
router.get("/donation-campaigns", verifyToken, getDonationCampaigns);
router.post("/donation-campaigns", verifyToken, createDonationCampaign);
router.put("/donation-campaigns/:id", verifyToken, updateDonationCampaign);
router.patch("/donation-campaigns/:id/activate", verifyToken, activateDonationCampaign);
router.delete("/donation-campaigns/:id", verifyToken, deleteDonationCampaign);

// Product upgrade routes
router.use("/product-upgrade", productUpgradeRoutes);

// Loan routes
router.use("/loans", loanRoutes);
router.use("/loan-payments", loanPaymentRoutes);
router.use("/loan-products", loanProductRoutes);
router.use("/dana-darurat", danaDaruratRoutes);

// Operator management routes (admin only)
router.use("/operators", verifyToken, requireAdmin, operatorRoutes);


// Accounting routes
router.use("/coa", verifyToken, coaRoutes);
router.use("/transactions", verifyToken, transactionRoutes);
router.use("/reconciliation", verifyToken, reconciliationRoutes);
router.use("/sales-tax", verifyToken, salesTaxRoutes);
router.use("/reports", verifyToken, reportsRoutes);
router.use("/expenses", verifyToken, expenseRoutes);
router.use("/finance/export", verifyToken, financeExportRoutes);
router.use("/invoice-products", verifyToken, invoiceProductRoutes);
router.use("/invoices", verifyToken, invoiceRoutes);
router.use("/tos", verifyToken, tosRoutes);

// Legacy compatibility routes (samitbank-style path naming)
router.get("/chart-of-accounts", verifyToken, getAccountsByType);
router.get("/chart-of-accounts/create", verifyToken, getAccountsByType);
router.post("/chart-of-accounts/create", verifyToken, createAccount);
router.get("/chart-of-accounts/edit/:id", verifyToken, getAccountDetail);
router.post("/chart-of-accounts/edit/:id", verifyToken, updateAccount);
router.get("/chart-of-accounts/delete/:id", verifyToken, deleteAccount);
router.post("/chart-of-accounts/delete/:id", verifyToken, deleteAccount);
router.post("/chart-of-accounts/getSubmenus", verifyToken, getSubmenusLegacy);
router.get("/chart-of-accounts/:type", verifyToken, getAccountsByType);

// System routes (danger zone)
router.post("/system/clear-all", verifyToken, clearAllData);

export default router;
