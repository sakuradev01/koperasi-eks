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

  fs.mkdirSync(simpanan, { recursive: true });
  fs.mkdirSync(pinjaman, { recursive: true });

  return { base, simpanan, pinjaman };
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
