import { INVOICE_STATUSES } from "../../../utils/invoiceStatus.js";

const ALLOWED_MONTHLY_STATUSES = new Set([
  "all", "paid", "partial", "overdue", "sent", "unallocated",
]);
const MAX_MONTHLY_RANGE_DAYS = 366 * 10;
const MAX_YEAR_RANGE = 10;

const parseInvoiceStatuses = (value) => {
  const values = (Array.isArray(value) ? value : [value ?? ""])
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(values)];
  if (unique.some((status) => !INVOICE_STATUSES.includes(status))) {
    throw new RangeError("Status invoice projection tidak valid.");
  }
  return unique;
};

const jakartaDateParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

const validDateString = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateAtEndOfDay = (value) => new Date(`${value}T23:59:59.999Z`);
const asIso = (value) => value.toISOString();

const currentJakartaYear = (now) =>
  Number(jakartaDateParts(now).year);

const currentJakartaMonthRange = (now) => {
  const { year, month } = jakartaDateParts(now);
  const startDate = `${year}-${month}-01`;
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
};

const parseYear = (value, fallback) => {
  const year = Number(value ?? fallback);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RangeError("Tahun proyeksi harus di antara 2000 dan 2100.");
  }
  return year;
};

export function parseInvoiceProjectionReportFilters(query = {}, now = new Date()) {
  const mode = String(query.mode || "").trim().toLowerCase();
  if (mode !== "monthly" && mode !== "yearly") {
    throw new RangeError("Mode laporan invoice projection wajib monthly atau yearly.");
  }

  if (mode === "monthly") {
    const invoiceStatuses = parseInvoiceStatuses(query.invoiceStatuses);
    const defaultRange = currentJakartaMonthRange(now);
    const startDate = query.startDate || defaultRange.startDate;
    const endDate = query.endDate || defaultRange.endDate;
    if (!validDateString(startDate) || !validDateString(endDate)) {
      throw new RangeError("Tanggal laporan tidak valid.");
    }
    if (startDate > endDate) {
      throw new RangeError("Tanggal mulai tidak boleh melewati tanggal selesai.");
    }
    const rangeDays =
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
      86_400_000;
    if (rangeDays > MAX_MONTHLY_RANGE_DAYS) {
      throw new RangeError("Rentang laporan bulanan maksimal 10 tahun.");
    }

    const status = String(query.status || "all").trim().toLowerCase();
    if (!ALLOWED_MONTHLY_STATUSES.has(status)) {
      throw new RangeError("Status laporan bulanan tidak valid.");
    }

    const periodEnd = dateAtEndOfDay(endDate);
    const asOfDate = new Date(Math.min(periodEnd.getTime(), now.getTime()));
    return { mode, startDate, endDate, asOfDate: asIso(asOfDate), status, invoiceStatuses };
  }

  const invoiceStatuses = parseInvoiceStatuses(query.invoiceStatuses);

  const currentYear = currentJakartaYear(now);
  let startYear = parseYear(query.fromYear, currentYear);
  let endYear = parseYear(query.toYear, startYear);
  if (startYear > endYear) [startYear, endYear] = [endYear, startYear];
  if (endYear - startYear + 1 > MAX_YEAR_RANGE) {
    throw new RangeError("Rentang laporan tahunan maksimal 10 tahun.");
  }

  const periodEnd = new Date(Date.UTC(endYear, 11, 31, 23, 59, 59, 999));
  const asOfDate = new Date(Math.min(periodEnd.getTime(), now.getTime()));
  return { mode, startYear, endYear, asOfDate: asIso(asOfDate), invoiceStatuses };
}
