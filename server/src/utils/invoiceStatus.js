export const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "overdue"];

export const INVOICE_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
};

function clampMoney(value) {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getEffectiveInvoiceStatus(statusInput, dueDate, total, totalPaid, now = new Date()) {
  const status = statusInput || "draft";
  const paid = Number(totalPaid) || 0;
  if (status === "draft" && paid <= 0) return "draft";

  if (clampMoney(paid) >= clampMoney(total)) return "paid";

  if (startOfDay(dueDate) < startOfDay(now)) return "overdue";
  if (paid > 0) return "partial";
  return "sent";
}

function toId(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function buildInvoiceStatusCountsByMember(invoices = [], now = new Date()) {
  const countsByMember = new Map();

  for (const invoice of invoices) {
    const memberId = toId(invoice.memberId);
    if (!memberId) continue;

    const status = getEffectiveInvoiceStatus(
      invoice.status,
      invoice.dueDate,
      invoice.total,
      invoice.totalPaid,
      now,
    );
    const counts = countsByMember.get(memberId) || {};
    counts[status] = (counts[status] || 0) + 1;
    countsByMember.set(memberId, counts);
  }

  return countsByMember;
}

export function matchesInvoiceStatusFilter(statusCounts = {}, requestedStatus = "all") {
  const statuses = (Array.isArray(requestedStatus) ? requestedStatus : [requestedStatus])
    .flatMap((value) => String(value || "").split(","))
    .map((status) => status.trim().toLowerCase())
    .filter((status) => status && status !== "all");
  if (statuses.length === 0) return true;

  const hasInvoices = Object.values(statusCounts).some((count) => Number(count) > 0);
  return statuses.some((status) => {
    if (status === "none") return !hasInvoices;
    if (!INVOICE_STATUSES.includes(status)) return false;
    return Number(statusCounts[status] || 0) > 0;
  });
}

export function formatInvoiceStatusCounts(statusCounts = {}) {
  const statuses = INVOICE_STATUSES
    .filter((status) => Number(statusCounts[status]) > 0)
    .map((status) => {
      const count = Number(statusCounts[status]);
      const label = INVOICE_STATUS_LABELS[status];
      return count > 1 ? `${label} (${count})` : label;
    });

  return statuses.length ? statuses.join(", ") : "Belum Ada Invoice";
}
