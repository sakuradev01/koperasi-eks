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

// Ensure upload directory exists
const uploadDir = "uploads/simpanan";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads (same as admin savings)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir + "/");
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