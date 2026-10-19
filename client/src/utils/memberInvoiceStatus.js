export const MEMBER_INVOICE_STATUS_ORDER = ["draft", "sent", "partial", "paid", "overdue"];

export function getMemberInvoiceStatusEntries(statusCounts = {}) {
  return MEMBER_INVOICE_STATUS_ORDER
    .filter((status) => Number(statusCounts[status]) > 0)
    .map((status) => ({ status, count: Number(statusCounts[status]) }));
}

export function matchesMemberInvoiceStatus(statusCounts = {}, requestedStatus = "all") {
  const entries = getMemberInvoiceStatusEntries(statusCounts);
  const selectedStatuses = (Array.isArray(requestedStatus) ? requestedStatus : [requestedStatus])
    .map((status) => String(status || "").trim().toLowerCase())
    .filter((status) => status && status !== "all");

  if (selectedStatuses.length === 0) return true;

  return selectedStatuses.some((status) => {
    if (status === "none") return entries.length === 0;
    return MEMBER_INVOICE_STATUS_ORDER.includes(status)
      && entries.some((entry) => entry.status === status);
  });
}
