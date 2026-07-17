import express from "express";
import multer from "multer";
import path from "path";
import {
  addInvoicePayment,
  approveInvoiceDraft,
  createInvoice,
  deleteInvoice,
  deleteInvoicePayment,
  exportAllInvoices,
  getAllInvoices,
  getInvoiceByNumber,
  getInvoiceMeta,
  updateInvoicePayment,
  updateInvoice,
  validateInvoiceNumber,
} from "../controllers/admin/invoice.controller.js";
import { ensureUploadsSubdirs } from "../utils/uploadsDir.js";

const router = express.Router();
const { transactions: transactionsUploadDir } = ensureUploadsSubdirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, transactionsUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(
      null,
      `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`,
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpg|jpeg|png|gif|pdf|tiff|tif|bmp|heic/;
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"), false);
    }
  },
});

const uploadPaymentAttachment = upload.fields([
  { name: "proofAttachment", maxCount: 1 },
  { name: "receiptFile", maxCount: 1 },
  { name: "receipt_file", maxCount: 1 },
]);

router.get("/meta", getInvoiceMeta);
router.get("/validate-number", validateInvoiceNumber);
router.get("/export", exportAllInvoices);
router.get("/", getAllInvoices);
router.get("/:invoiceNumber", getInvoiceByNumber);
router.post("/", createInvoice);
router.put("/:invoiceNumber", updateInvoice);
router.patch("/:invoiceNumber/approve", approveInvoiceDraft);
router.delete("/:invoiceNumber", deleteInvoice);
router.post(
  "/:invoiceNumber/payments",
  uploadPaymentAttachment,
  addInvoicePayment,
);
router.put(
  "/:invoiceNumber/payments/:paymentId",
  uploadPaymentAttachment,
  updateInvoicePayment,
);
router.delete("/:invoiceNumber/payments/:paymentId", deleteInvoicePayment);

export default router;
