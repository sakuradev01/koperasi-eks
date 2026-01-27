import express from "express";
import multer from "multer";
import path from "path";
import { ensureUploadsSubdirs } from "../../utils/uploadsDir.js";
import {
  getAvailableLoanProducts,
  getMemberLoans,
  applyForLoan,
  makeLoanPayment,
  getMemberLoanPayments,
  getLoanPaymentSchedule,
  calculateLoanSimulation,
} from "../../controllers/member/loan.controller.js";
import { verifyMemberToken } from "../../middlewares/memberAuth.middleware.js";

const router = express.Router();

// Configure multer for file uploads
const { pinjaman: pinjamanDir } = ensureUploadsSubdirs();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pinjamanDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "member-loan-" + uniqueSuffix + path.extname(file.originalname));
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
router.use(verifyMemberToken);

// Get available loan products
router.get("/products", getAvailableLoanProducts);

// Get member's loans
router.get("/my-loans", getMemberLoans);

// Apply for loan
router.post("/apply", applyForLoan);

// Calculate loan simulation
router.post("/calculate", calculateLoanSimulation);

// Make loan payment with file upload
router.post("/payment", upload.single("proofFile"), makeLoanPayment);

// Get member's loan payments
router.get("/payments", getMemberLoanPayments);

// Get loan payment schedule
router.get("/schedule/:loanId", getLoanPaymentSchedule);

export default router;
