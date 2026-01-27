import express from "express";
import multer from "multer";
import path from "path";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";
import {
  createPayment,
  approvePayment,
  rejectPayment,
  getPaymentHistory,
  getPaymentsByLoan,
  bulkApprovePayments,
  getOverduePayments,
  deletePayment,
  updatePayment,
} from "../controllers/admin/loanPayment.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createPaymentValidation,
  processPaymentValidation,
  bulkApproveValidation,
  getPaymentsQueryValidation,
} from "../validations/loan.validation.js";

const router = express.Router();

// Configure multer for file uploads
const { pinjaman: pinjamanDir } = ensureUploadsSubdirs();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pinjamanDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "loan-payment-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images and PDF files are allowed"));
    }
  },
});

// Apply authentication middleware to all routes
router.use(verifyToken);

// Payment creation with file upload
router.post(
  "/",
  upload.single("proofFile"),
  validate(createPaymentValidation),
  createPayment
);

// Payment management routes
router.get(
  "/",
  validate(getPaymentsQueryValidation),
  getPaymentHistory
);

router.get("/loan/:loanId", getPaymentsByLoan);

router.get("/overdue", getOverduePayments);

router.post(
  "/:id/approve",
  validate(processPaymentValidation),
  approvePayment
);

router.post(
  "/:id/reject",
  validate(processPaymentValidation),
  rejectPayment
);

router.post(
  "/bulk-approve",
  validate(bulkApproveValidation),
  bulkApprovePayments
);

// Delete payment
router.delete("/:id", deletePayment);

// Update payment
router.put("/:id", updatePayment);

export default router;
