import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  submitApplication,
  saveDraft,
  getAllApplications,
  getApplicationDetail,
  updateStatus,
} from "../controllers/admin/danaDarurat.controller.js";

const router = express.Router();
router.use(verifyToken);

router.post("/submit", submitApplication);
router.post("/draft", saveDraft);
router.get("/", getAllApplications);
router.get("/:id", getApplicationDetail);
router.patch("/:id/status", updateStatus);

export default router;
