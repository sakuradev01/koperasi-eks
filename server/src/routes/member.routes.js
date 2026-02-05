import express from "express";
import fs from "fs";
import { 
  loginMember, 
  getCurrentMember, 
  logoutMember 
} from "../controllers/member/auth.controller.js";
import { 
  getMemberSavings, 
  createMemberSaving, 
  getMemberSavingById,
  getMemberSavingsSummary 
} from "../controllers/member/savings.controller.js";
import { verifyMemberToken } from "../middlewares/memberAuth.middleware.js";
import multer from "multer";
import loanRoutes from "./member/loan.routes.js";

const router = express.Router();

import path from "path";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";

// Ensure upload directory exists
const { simpanan: simpananDir } = ensureUploadsSubdirs();

// Configure multer for file uploads (same as admin savings)
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

// Authentication routes
router.post("/auth/login", loginMember);
router.post("/auth/logout", verifyMemberToken, logoutMember);
router.get("/auth/me", verifyMemberToken, getCurrentMember);

// Savings routes
router.get("/savings", verifyMemberToken, getMemberSavings);
router.post("/savings", verifyMemberToken, upload.single("proofFile"), createMemberSaving);
router.get("/savings/summary", verifyMemberToken, getMemberSavingsSummary);
router.get("/savings/:id", verifyMemberToken, getMemberSavingById);

// Loan routes
router.use("/loans", loanRoutes);

export default router;