import express from "express";
const router = express.Router();

import {
  getAllOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  toggleOperatorStatus,
} from "../controllers/admin/operator.controller.js";

router.get("/", getAllOperators);
router.post("/", createOperator);
router.put("/:id", updateOperator);
router.delete("/:id", deleteOperator);
router.patch("/:id/toggle-status", toggleOperatorStatus);

export default router;
