import express from "express";
import fs from "fs";
import {
  getAllSavings,
  getSavingsById,
  createSavings,
  updateSavings,
  deleteSavings,
  getSavingsByMember,
  getSavingsSummary,
  getLastInstallmentPeriod,
  getStudentDashboardSavings,
} from "../controllers/savings.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import multer from "multer";
import path from "path";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";

const router = express.Router();

// Ensure upload directory exists
const { simpanan: simpananDir } = ensureUploadsSubdirs();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, simpananDir + path.sep);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Format: bukti-{timestamp}-{random}-{originalname}
    cb(
      null,
      "bukti-" +
        uniqueSuffix +
        "-" +
        file.originalname
    );
  },
});

const upload = multer({ storage: storage });

// Public routes (with authentication)
router.use(verifyToken);

// Routes
router
  .route("/")
  .get(getAllSavings)
  .post(upload.single("proofFile"), createSavings);

router
  .route("/:id")
  .get(getSavingsById)
  .put(upload.single("proofFile"), updateSavings)
  .delete(deleteSavings);

router.route("/member/:memberId").get(getSavingsByMember);
router.route("/summary").get(getSavingsSummary);
router
  .route("/check-period/:memberId/:productId")
  .get(getLastInstallmentPeriod);
router.route("/student-dashboard/:memberUuid").get(getStudentDashboardSavings);

export default router;
