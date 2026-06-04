import express from "express";
import multer from "multer";
import path from "path";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";
import {
  createLoanApplication,
  calculateInstallment,
  approveLoan,
  rejectLoan,
  getAllLoans,
  getLoansByMember,
  getLoanDetail,
  updateLoanStatus,
  checkOverdueLoans,
  updateLoan,
  deleteLoan,
  uploadLoanDocument,
} from "../controllers/admin/loan.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createLoanApplicationValidation,
  calculateInstallmentValidation,
  processLoanValidation,
  getLoansQueryValidation,
  updateLoanStatusValidation,
} from "../validations/loan.validation.js";

const router = express.Router();

// Multer config for loan document uploads (same pattern as savings)
const { pinjaman: pinjamanDir } = ensureUploadsSubdirs();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, pinjamanDir),
    filename: (req, file, cb) => {
      const prefix = req.body?.docType || 'loan-doc';
      cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|webp|bmp|heic/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, (mime && ext) || file.mimetype.startsWith('image/'));
  },
});

// Apply authentication middleware to all routes
router.use(verifyToken);

// Document upload (multer handles multipart)
router.post("/upload-document", upload.single("file"), uploadLoanDocument);

// Loan application routes
router.post(
  "/apply",
  validate(createLoanApplicationValidation),
  createLoanApplication
);

router.post(
  "/calculate",
  validate(calculateInstallmentValidation),
  calculateInstallment
);

// Loan management routes
router.get(
  "/",
  validate(getLoansQueryValidation),
  getAllLoans
);

router.get("/member/:memberId", getLoansByMember);

router.get("/:id", getLoanDetail);

router.post(
  "/:id/approve",
  validate(processLoanValidation),
  approveLoan
);

router.post(
  "/:id/reject",
  validate(processLoanValidation),
  rejectLoan
);

router.patch(
  "/:id/status",
  validate(updateLoanStatusValidation),
  updateLoanStatus
);

// Update and delete routes
router.put("/:id", updateLoan);
router.delete("/:id", deleteLoan);

// Maintenance routes
router.post("/check-overdue", checkOverdueLoans);

export default router;
