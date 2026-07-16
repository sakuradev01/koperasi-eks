import fs from "fs";
import path from "path";

/**
 * Single source of truth for where uploaded files live on disk.
 *
 * - If UPLOADS_DIR is set, we use it (recommended in containers: e.g. /data/uploads)
 * - Otherwise fallback to <process.cwd()>/uploads
 */
export function getUploadsDir() {
  const envDir = process.env.UPLOADS_DIR;
  return envDir && envDir.trim() ? envDir.trim() : path.join(process.cwd(), "uploads");
}

export function ensureUploadsSubdirs() {
  const base = getUploadsDir();
  const simpanan = path.join(base, "simpanan");
  const pinjaman = path.join(base, "pinjaman");
  const donasi = path.join(base, "donasi");
  const transactions = path.join(base, "transactions");
  const expenses = path.join(base, "expenses");
  const expensePaymentProofs = path.join(base, "expense-payment-proofs");
  const danaDarurat = path.join(base, "dana-darurat");
  const members = path.join(base, "members");

  fs.mkdirSync(simpanan, { recursive: true });
  fs.mkdirSync(pinjaman, { recursive: true });
  fs.mkdirSync(donasi, { recursive: true });
  fs.mkdirSync(transactions, { recursive: true });
  fs.mkdirSync(expenses, { recursive: true });
  fs.mkdirSync(expensePaymentProofs, { recursive: true });
  fs.mkdirSync(danaDarurat, { recursive: true });
  fs.mkdirSync(members, { recursive: true });

  return { base, simpanan, pinjaman, donasi, transactions, expenses, expensePaymentProofs, danaDarurat, members };
}

function getExtFromMime(mime) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime.toLowerCase()] || "jpg";
}

/**
 * Save base64 data:image to disk under /uploads/<subdir>/
 * Returns stored path like /uploads/members/xxx.jpg
 * If input is already /uploads/... path or empty, returns as-is.
 * Supports long-term migration: base64 in DB -> file path.
 */
export function saveBase64ImageToFile(base64Data, subdirName, fileNamePrefix) {
  if (!base64Data || typeof base64Data !== "string") return base64Data || "";
  const trimmed = base64Data.trim();
  if (!trimmed) return "";
  // Already a file path / URL path
  if (trimmed.startsWith("/uploads/")) return trimmed;
  // Not a data URL -> keep as is (might be https URL from student dashboard)
  if (!trimmed.startsWith("data:")) {
    // If it's already http(s) URL, keep for backward compat (don't save)
    return trimmed;
  }
  const match = trimmed.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (!match) return trimmed; // unknown format, keep

  const mime = match[1];
  const b64 = match[2];
  const ext = getExtFromMime(mime);
  const base = getUploadsDir();
  const dir = path.join(base, subdirName);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  const safePrefix = String(fileNamePrefix || "file")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${safePrefix}-${Date.now()}-${rand}.${ext}`;
  const fullPath = path.join(dir, filename);
  try {
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(fullPath, buf);
    return `/uploads/${subdirName}/${filename}`;
  } catch (e) {
    console.error("saveBase64ImageToFile failed", e.message);
    return trimmed; // fallback keep original to not lose data
  }
}

/**
 * Convert a stored DB value to an absolute file path under UPLOADS_DIR.
 *
 * Supported stored formats:
 * - savings.proofFile: "bukti-xxx.png" (filename only)
 * - loanPayment.proofFile: "/uploads/pinjaman/loan-payment-xxx.png" (URL-like)
 */
export function resolveUploadedFilePath(storedValue, opts = {}) {
  const { defaultSubdir } = opts;
  if (!storedValue) return null;

  const uploadsDir = getUploadsDir();

  // If value looks like a URL path e.g. /uploads/pinjaman/abc.png
  const normalized = String(storedValue);
  if (normalized.startsWith("/uploads/")) {
    const rel = normalized.replace(/^\/uploads\//, ""); // -> pinjaman/abc.png
    return path.join(uploadsDir, rel);
  }

  // filename-only (savings)
  if (defaultSubdir) {
    return path.join(uploadsDir, defaultSubdir, normalized);
  }

  // last resort: treat as relative path under uploads
  return path.join(uploadsDir, normalized.replace(/^\/+/, ""));
}
