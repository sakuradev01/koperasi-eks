import fs from "fs";
import { resolveUploadedFilePath } from "./uploadsDir.js";

export function normalizeMoney(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

export function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseJsonArray(rawValue) {
  if (Array.isArray(rawValue)) return rawValue;
  if (!rawValue || typeof rawValue !== "string") return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseExpenseLines(body = {}) {
  const source = body.expense_lines ?? body.expenseLine ?? body.lines ?? body.expenseLines;
  return parseJsonArray(source)
    .map((row) => ({
      categoryId: row.categoryId ?? row.category_id ?? row.category ?? null,
      description: normalizeText(row.description ?? row.notes ?? ""),
      amount: normalizeMoney(row.amount),
    }))
    .filter((row) => row.categoryId && row.amount > 0);
}

export function getLineAmountTotal(lines = []) {
  return lines.reduce((sum, line) => sum + normalizeMoney(line.amount), 0);
}

export function hasExpenseLinesInput(body = {}) {
  return ["expense_lines", "expenseLine", "lines", "expenseLines"]
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

export function getUploadedFieldFiles(req, fieldNames = []) {
  const files = [];
  for (const fieldName of fieldNames) {
    if (Array.isArray(req.files?.[fieldName])) files.push(...req.files[fieldName]);
  }
  return files;
}

export function removeUploadedFile(storedName, defaultSubdir) {
  if (!storedName) return;
  const fullPath = resolveUploadedFilePath(storedName, { defaultSubdir });
  if (!fullPath) return;

  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // A failed best-effort cleanup must not mask the primary request error.
  }
}
