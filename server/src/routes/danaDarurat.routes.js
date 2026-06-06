import express from "express";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  submitApplication,
  saveDraft,
  getAllApplications,
  getApplicationDetail,
  updateStatus,
  uploadDocument,
} from "../controllers/admin/danaDarurat.controller.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/dana-darurat"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `dd-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|doc|docx)$/i)) {
      return cb(new Error("Only JPG, PNG, PDF, DOC files allowed"), false);
    }
    cb(null, true);
  },
});

const router = express.Router();
router.use(verifyToken);

router.post("/submit", submitApplication);
router.post("/draft", saveDraft);
router.get("/", getAllApplications);
router.get("/:id", getApplicationDetail);
router.patch("/:id/status", updateStatus);
router.post("/upload", upload.single("file"), uploadDocument);

export default router;
