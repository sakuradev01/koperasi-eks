export const MEMBER_INVOICE_STATUS_ORDER = ["draft", "sent", "partial", "paid", "overdue"];

export function getMemberInvoiceStatusEntries(statusCounts = {}) {
  return MEMBER_INVOICE_STATUS_ORDER
    .filter((status) => Number(statusCounts[status]) > 0)
    .map((status) => ({ status, count: Number(statusCounts[status]) }));
}

export function matchesMemberInvoiceStatus(statusCounts = {}, requestedStatus = "all") {
  if (!requestedStatus || requestedStatus === "all") return true;
  const entries = getMemberInvoiceStatusEntries(statusCounts);
  if (requestedStatus === "none") return entries.length === 0;
  return entries.some((entry) => entry.status === requestedStatus);
}
