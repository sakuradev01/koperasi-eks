import express from "express";
import {
  calculateUpgradeCompensation,
  executeProductUpgrade,
  getMemberUpgradeHistory,
  cancelProductUpgrade
} from "../../controllers/admin/productUpgrade.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Product upgrade routes
router.post("/calculate", verifyToken, requireAdmin, calculateUpgradeCompensation);
router.post("/execute", verifyToken, requireAdmin, executeProductUpgrade);
router.get("/history/:memberId", verifyToken, requireAdmin, getMemberUpgradeHistory);
router.patch("/cancel/:upgradeId", verifyToken, requireAdmin, cancelProductUpgrade);

export default router;
