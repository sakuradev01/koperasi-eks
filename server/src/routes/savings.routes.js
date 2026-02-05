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

// File filter - Accept images, PDF, and Word documents
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const mimetype = allowedMimes.includes(file.mimetype);

  if (extname || mimetype) {
    return cb(null, true);
  }
  cb(new Error("Only images (JPG, PNG, GIF), PDF, and Word documents are allowed"));
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

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
