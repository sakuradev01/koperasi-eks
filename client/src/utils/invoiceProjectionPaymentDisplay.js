const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const safeDetails = (value) => (Array.isArray(value) ? value : []);

const formatDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value || "");
  const month = Number(match[2]);
  if (month < 1 || month > 12) return String(value);
  return `${Number(match[3])} ${MONTHS[month - 1]} ${match[1]}`;
};

const formatAmount = (value, currency) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${currency || "IDR"} ${amount.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatCoverage = (indexes = []) => {
  const uniqueIndexes = [...new Set(indexes.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);
  if (!uniqueIndexes.length) return "";

  const ranges = [];
  let start = uniqueIndexes[0];
  let end = start;
  const addRange = () => ranges.push(start === end ? String(start) : `${start}–${end}`);

  uniqueIndexes.slice(1).forEach((index) => {
    if (index === end + 1) {
      end = index;
      return;
    }
    addRange();
    start = index;
    end = index;
  });
  addRange();
  return `Cicilan ${ranges.join(", ")}`;
};

const formatTiming = (daysEarly) => {
  if (daysEarly === null || daysEarly === undefined || daysEarly === "") return "";
  if (!Number.isFinite(Number(daysEarly))) return "";
  const days = Number(daysEarly);
  if (days > 0) return `${days} hari lebih awal`;
  if (days < 0) return `${Math.abs(days)} hari terlambat`;
  return "Tepat tanggal jatuh tempo";
};

const formatPaymentDetail = (detail, currency) => {
  const coverageIndexes = safeDetails(detail.coveredProjectionIndexes);
  const coverageLabel = detail.coveredProjectionLabel || formatCoverage(coverageIndexes);
  const isBatch = coverageIndexes.length > 1;
  const parts = [];

  if (isBatch && coverageLabel) parts.push(`Batch ${coverageLabel}`);
  if (isBatch && Number(detail.transferAmount) > 0) {
    parts.push(`total transfer ${formatAmount(detail.transferAmount, currency)}`);
  }
  if (Number(detail.allocatedAmount) > 0) {
    parts.push(`alokasi ${formatAmount(detail.allocatedAmount, currency)}`);
  }
  const timing = formatTiming(detail.daysEarly);
  if (timing) parts.push(timing);
  return parts.join(" · ") || "Pembayaran tercatat";
};

const uniquePaymentDates = (details) => [...new Set(
  details.map((detail) => formatDate(detail.paymentDate)).filter(Boolean),
)];

export const formatInvoiceProjectionPaymentDates = (row = {}) => {
  const periodDetails = safeDetails(row.periodPaymentDetails);
  if (periodDetails.length) return uniquePaymentDates(periodDetails).join(", ");

  const priorDetails = safeDetails(row.priorPaymentDetails);
  if (priorDetails.length) return `${uniquePaymentDates(priorDetails).join(", ")} (sebelum periode)`;

  const legacyDates = safeDetails(row.paymentDates).map(formatDate).filter(Boolean);
  return legacyDates.length ? [...new Set(legacyDates)].join(", ") : "—";
};

export const formatInvoiceProjectionPaymentContext = (row = {}) => {
  if (row.rowType === "unallocated") return "Pembayaran belum dialokasikan ke cicilan";

  const periodDetails = safeDetails(row.periodPaymentDetails);
  if (periodDetails.length) {
    return periodDetails
      .map((detail) => formatPaymentDetail(detail, row.currency))
      .join("; ");
  }

  const priorDetails = safeDetails(row.priorPaymentDetails);
  if (priorDetails.length) {
    return `Pembayaran sebelum periode · ${priorDetails
      .map((detail) => formatPaymentDetail(detail, row.currency))
      .join("; ")}`;
  }

  if (safeDetails(row.paymentDates).length) return "Pembayaran tercatat pada periode ini";
  if (String(row.status || "").toLowerCase() === "paid") return "Sudah lunas sebelum periode";
  return "Belum ada pembayaran pada periode ini";
};
