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
  unmarkAsCompleted
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
import { clearAllData } from "../controllers/admin/system.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import multer from "multer";
import productUpgradeRoutes from "./admin/productUpgrade.routes.js";
import loanRoutes from "./loan.routes.js";
import loanPaymentRoutes from "./loanPayment.routes.js";
import loanProductRoutes from "./loanProduct.routes.js";

// Ensure upload directory exists
const uploadDir = "uploads/simpanan";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir + '/')
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
router.get("/members/:uuid", verifyToken, getMemberByUuid);
router.post("/members", verifyToken, createMember);
router.put("/members/:uuid", verifyToken, updateMember);
router.delete("/members/:uuid", verifyToken, deleteMember);
router.patch("/members/:uuid/complete", verifyToken, markAsCompleted);
router.patch("/members/:uuid/uncomplete", verifyToken, unmarkAsCompleted);

// Savings management routes
router.get("/savings", verifyToken, getAllSavings);
router.get("/savings/:id", verifyToken, getSavingsById);
router.post("/savings", verifyToken, upload.single('proofFile'), createSavings);
router.put("/savings/:id", verifyToken, updateSavings);
router.delete("/savings/:id", verifyToken, deleteSavings);
router.get("/savings/check-period/:memberId/:productId", verifyToken, getLastInstallmentPeriod);

// Savings approval/rejection routes
router.patch("/savings/:id/approve", verifyToken, approveSavings);
router.patch("/savings/:id/reject", verifyToken, rejectSavings);
router.patch("/savings/:id/partial", verifyToken, markAsPartial);
router.get("/savings/period-summary/:memberId/:productId/:installmentPeriod", verifyToken, getSavingsPeriodSummary);

// Product upgrade routes
router.use("/product-upgrade", productUpgradeRoutes);

// Loan routes
router.use("/loans", loanRoutes);
router.use("/loan-payments", loanPaymentRoutes);
router.use("/loan-products", loanProductRoutes);

// System routes (danger zone)
router.post("/system/clear-all", verifyToken, clearAllData);

export default router;