import { Invoice } from "../../../models/invoice.model.js";

const startOfDate = (value) => new Date(`${value}T00:00:00.000Z`);

const dayAfter = (value) => {
  const date = startOfDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
};

const invoiceReportFields = {
  invoiceNumber: 1,
  "customerSnapshot.name": 1,
  currency: 1,
  status: 1,
  dueDate: 1,
  total: 1,
  totalPaid: 1,
  projections: 1,
  "payments._id": 1,
  "payments.paymentDate": 1,
  "payments.amount": 1,
  "payments.projectionId": 1,
  "payments.projectionIndex": 1,
  "payments.coveredProjectionIds": 1,
  "payments.coveredProjectionBreakdown": 1,
};

export const buildInvoiceProjectionQuery = (filters) => {
  const query = filters.invoiceStatuses?.length
    ? {}
    : { status: { $ne: "draft" } };

  if (filters.mode === "monthly") {
    const start = startOfDate(filters.startDate);
    const endExclusive = dayAfter(filters.endDate);
    query.$or = [
      { "projections.estimateDate": { $gte: start, $lt: endExclusive } },
      { "payments.paymentDate": { $gte: start, $lt: endExclusive } },
    ];
  } else {
    query["projections.estimateDate"] = {
      $gte: startOfDate(`${filters.startYear}-01-01`),
      $lt: startOfDate(`${filters.endYear + 1}-01-01`),
    };
  }

  return query;
};

export const buildAvailableInvoiceYearsMatch = (filters = {}) => {
  const match = { "projections.estimateDate": { $type: "date" } };
  if (!filters.invoiceStatuses?.length) {
    match.status = { $ne: "draft" };
  }
  return match;
};

export const invoiceProjectionReportRepository = {
  findReportInvoices(filters) {
    return Invoice.find(buildInvoiceProjectionQuery(filters))
      .select(invoiceReportFields)
      .sort({ "customerSnapshot.name": 1, invoiceNumber: 1 })
      .lean();
  },

  async listAvailableYears(filters = {}) {
    const rows = await Invoice.aggregate([
      { $match: buildAvailableInvoiceYearsMatch(filters) },
      { $unwind: "$projections" },
      { $group: { _id: { $year: "$projections.estimateDate" } } },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((row) => Number(row._id)).filter(Number.isInteger);
  },
};
