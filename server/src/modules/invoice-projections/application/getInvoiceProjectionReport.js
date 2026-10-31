import { buildInvoiceProjectionReport } from "./buildInvoiceProjectionReport.js";
import { parseInvoiceProjectionReportFilters } from "./parseReportFilters.js";

const jakartaYear = (date) =>
  Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(date),
  );

export function createGetInvoiceProjectionReport({ repository, now = () => new Date() }) {
  if (
    !repository ||
    typeof repository.findReportInvoices !== "function" ||
    typeof repository.listAvailableYears !== "function"
  ) {
    throw new TypeError("Invoice projection report repository is required.");
  }

  return async function getInvoiceProjectionReport(query = {}) {
    const currentDate = now();
    const filters = parseInvoiceProjectionReportFilters(query, currentDate);
    const [invoices, rawAvailableYears] = await Promise.all([
      repository.findReportInvoices(filters),
      repository.listAvailableYears(filters),
    ]);
    const report = buildInvoiceProjectionReport(invoices, filters);
    const availableYears = new Set([
      jakartaYear(currentDate),
      ...(rawAvailableYears || []).map(Number).filter(Number.isInteger),
    ]);

    if (filters.mode === "yearly") {
      for (let year = filters.startYear; year <= filters.endYear; year += 1) {
        availableYears.add(year);
      }
    }

    return {
      ...report,
      availableYears: [...availableYears].sort((left, right) => left - right),
    };
  };
}
