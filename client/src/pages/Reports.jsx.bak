import { useEffect, useMemo, useRef, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { id } from "date-fns/locale";
import { Link } from "react-router-dom";
import api from "../api/index.jsx";
import { toast } from "react-toastify";
import jsPDF from "jspdf";
import "jspdf-autotable";

const ITEMS_PER_PAGE = 15;
const SAVINGS_FILTERS = ["paid", "partial", "pending", "rejected", "unpaid"];
const MEMBER_FILTERS = ["completed", "not_completed", "has_overdue", "has_partial", "all_paid"];

const STATUS_META = {
  paid: {
    label: "Paid",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  partial: {
    label: "Partial",
    badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  pending: {
    label: "Pending",
    badgeClass: "border border-sky-200 bg-sky-50 text-sky-700",
    dotClass: "bg-sky-500",
  },
  rejected: {
    label: "Rejected",
    badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
    dotClass: "bg-rose-500",
  },
  unpaid: {
    label: "Belum Bayar",
    badgeClass: "border border-slate-200 bg-slate-50 text-slate-700",
    dotClass: "bg-slate-500",
  },
  unknown: {
    label: "Belum Ambil Produk",
    badgeClass: "border border-slate-200 bg-slate-50 text-slate-600",
    dotClass: "bg-slate-400",
  },
};

const MEMBER_STATUS_META = {
  completed: {
    label: "Lunas (TF)",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  overdue: {
    label: "Overdue",
    badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
    dotClass: "bg-rose-500",
  },
  partial: {
    label: "Partial",
    badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  all_paid: {
    label: "All Paid",
    badgeClass: "border border-teal-200 bg-teal-50 text-teal-700",
    dotClass: "bg-teal-500",
  },
  active: {
    label: "Aktif",
    badgeClass: "border border-sky-200 bg-sky-50 text-sky-700",
    dotClass: "bg-sky-500",
  },
  no_product: {
    label: "Belum Ambil Produk",
    badgeClass: "border border-slate-200 bg-slate-50 text-slate-600",
    dotClass: "bg-slate-400",
  },
};

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("id-ID");

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const formatCurrency = (amount) => currencyFormatter.format(Number(amount) || 0);
const formatExcelNumber = (amount) => {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) ? String(numericAmount) : "0";
};

const formatLongDate = (value) => {
  if (!value) return "-";
  return format(new Date(value), "dd MMM yyyy", { locale: id });
};

const formatShortDate = (value) => {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy", { locale: id });
};

const formatMonthYear = (value) => {
  if (!value) return "-";
  return format(new Date(value), "MMM yyyy", { locale: id });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const matchesSearchKeyword = (keyword, ...values) => {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  if (!normalizedKeyword) return true;

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(normalizedKeyword)
  );
};

const getResolvedProduct = (member, productLookup) => {
  if (member?.product && typeof member.product === "object" && member.product._id) {
    return member.product;
  }

  const productId = normalizeId(member?.productId);
  if (!productId) return null;

  return productLookup.get(productId) || null;
};

const getMemberSavingsCollection = (member, savingsByMember) =>
  savingsByMember.get(String(member?._id)) || savingsByMember.get(member?.uuid) || [];

const getMemberProductSavings = (member, savingsByMember) => {
  const currentProductId = normalizeId(member?.product?._id || member?.productId);
  return getMemberSavingsCollection(member, savingsByMember).filter(
    (saving) => !currentProductId || normalizeId(saving.productId) === currentProductId
  );
};

const getRequiredAmountForPeriod = (member, fallbackProduct, installmentPeriod) => {
  const baseProduct = member?.product || fallbackProduct || {};
  const upgradeInfo = member?.currentUpgradeId;
  const period = Number(installmentPeriod) || 1;
  let requiredAmount = Number(baseProduct.depositAmount) || 0;

  if (member?.hasUpgraded && upgradeInfo && typeof upgradeInfo === "object") {
    const completedPeriodsAtUpgrade = Number(upgradeInfo.completedPeriodsAtUpgrade) || 0;
    const oldMonthlyDeposit = Number(upgradeInfo.oldMonthlyDeposit) || 0;
    const newPaymentWithCompensation =
      Number(upgradeInfo.newPaymentWithCompensation) || requiredAmount;

    if (period <= completedPeriodsAtUpgrade && oldMonthlyDeposit > 0) {
      requiredAmount = oldMonthlyDeposit;
    } else if (newPaymentWithCompensation > 0) {
      requiredAmount = newPaymentWithCompensation;
    }
  }

  return requiredAmount;
};

const getSavingActivityDate = (saving) =>
  saving?.savingsDate || saving?.paymentDate || saving?.createdAt || null;

const getMemberSavingsStartDate = (member, memberSavings = []) => {
  if (member?.savingsStartDate) {
    return new Date(member.savingsStartDate);
  }

  const inferredStarts = memberSavings
    .filter((saving) => saving.type === "Setoran" && Number(saving.installmentPeriod) > 0)
    .map((saving) => {
      const activityDate = new Date(getSavingActivityDate(saving));
      if (Number.isNaN(activityDate.getTime())) return null;

      activityDate.setHours(0, 0, 0, 0);
      activityDate.setDate(1);
      activityDate.setMonth(activityDate.getMonth() - (Number(saving.installmentPeriod) - 1));
      return activityDate;
    })
    .filter(Boolean);

  if (inferredStarts.length) {
    return new Date(Math.min(...inferredStarts.map((date) => date.getTime())));
  }

  return new Date(member?.createdAt || Date.now());
};

const getMemberPeriodDate = (member, installmentPeriod, memberSavings = []) => {
  const baseDate = getMemberSavingsStartDate(member, memberSavings);

  const dueDate = new Date(baseDate);
  dueDate.setHours(0, 0, 0, 0);
  dueDate.setMonth(dueDate.getMonth() + (Number(installmentPeriod) || 1) - 1);
  return dueDate;
};

const getMemberPaymentStatus = (member, memberSavings, fallbackProduct = null) => {
  const product = member?.product || fallbackProduct;
  if (!product) {
    return {
      totalPaid: 0,
      totalRequired: 0,
      paidPeriods: 0,
      partialPeriods: 0,
      overduePeriods: 0,
      unpaidPeriods: 0,
      progress: 0,
    };
  }

  const totalPeriods = Number(product.termDuration) || 0;
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let totalPaid = 0;
  let totalRequired = 0;
  let paidPeriods = 0;
  let partialPeriods = 0;
  let overduePeriods = 0;

  for (let period = 1; period <= totalPeriods; period += 1) {
    const periodSavings = memberSavings.filter(
      (saving) =>
        Number(saving.installmentPeriod) === period &&
        (saving.status === "Approved" || saving.status === "Partial")
    );
    const paid = periodSavings.reduce((sum, saving) => sum + (Number(saving.amount) || 0), 0);
    const required = getRequiredAmountForPeriod(member, product, period);
    const dueDate = getMemberPeriodDate(member, period, memberSavings);

    const isPastMonth =
      dueDate.getFullYear() < currentYear ||
      (dueDate.getFullYear() === currentYear && dueDate.getMonth() < currentMonth);
    const isCurrentMonth =
      dueDate.getFullYear() === currentYear && dueDate.getMonth() === currentMonth;

    if (paid >= required && required > 0) {
      paidPeriods += 1;
    } else if (paid > 0) {
      partialPeriods += 1;
      if (isPastMonth) overduePeriods += 1;
    } else if (required > 0 && (isPastMonth || isCurrentMonth)) {
      overduePeriods += 1;
    }

    totalPaid += paid;
    totalRequired += required;
  }

  const unpaidPeriods = Math.max(0, totalPeriods - paidPeriods - partialPeriods);
  const progress = totalRequired > 0 ? Math.min(100, (totalPaid / totalRequired) * 100) : 0;

  return {
    totalPaid,
    totalRequired,
    paidPeriods,
    partialPeriods,
    overduePeriods,
    unpaidPeriods,
    progress,
  };
};

const getDifferenceClass = (statusKey, differenceAmount) => {
  if (differenceAmount === 0) return "text-emerald-600";
  if (statusKey === "partial") return "text-amber-600";
  if (statusKey === "pending") return "text-sky-600";
  if (statusKey === "rejected") return "text-rose-600";
  if (statusKey === "unpaid") return "text-slate-600";
  return differenceAmount > 0 ? "text-rose-600" : "text-emerald-600";
};

const getRangeLabel = (dateFrom, dateTo) => {
  if (!dateFrom || !dateTo) return format(new Date(), "MMMM yyyy", { locale: id });

  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const sameMonth = format(start, "yyyy-MM") === format(end, "yyyy-MM");
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");

  if (sameDay) return format(start, "dd MMMM yyyy", { locale: id });
  if (sameMonth) return format(start, "MMMM yyyy", { locale: id });
  return `${format(start, "dd MMM yyyy", { locale: id })} - ${format(end, "dd MMM yyyy", {
    locale: id,
  })}`;
};

const buildSavingsExcelDocument = (rows, summary, rangeLabel) => {
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.invoiceNumber)}</td>
          <td>${escapeHtml(row.activityDateLabelLong)}</td>
          <td>${escapeHtml(row.customerName)}</td>
          <td>${escapeHtml(row.customerCode)}</td>
          <td>${escapeHtml(row.productTitle)}</td>
          <td>${escapeHtml(row.installmentPeriod)}</td>
          <td style="mso-number-format:'0';">${formatExcelNumber(row.projectionAmount)}</td>
          <td style="mso-number-format:'0';">${formatExcelNumber(row.realizedAmount)}</td>
          <td style="mso-number-format:'0';">${formatExcelNumber(row.differenceAmount)}</td>
          <td>${escapeHtml(row.statusLabel)}</td>
          <td>${escapeHtml(row.description)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          p { margin: 0 0 12px; color: #475569; }
          .summary { margin: 18px 0 24px; border-collapse: collapse; }
          .summary td { padding: 10px 12px; border: 1px solid #cbd5e1; }
          .summary td:first-child { font-weight: 700; background: #e0f2fe; }
          table.report { width: 100%; border-collapse: collapse; }
          table.report th { background: #111827; color: #ffffff; padding: 10px 12px; text-align: left; }
          table.report td { border: 1px solid #cbd5e1; padding: 9px 12px; vertical-align: top; }
        </style>
      </head>
      <body>
        <h1>Laporan Koperasi</h1>
        <p>Periode ${escapeHtml(rangeLabel)}</p>
        <table class="summary">
          <tr><td>Total Proyeksi</td><td style="mso-number-format:'0';">${formatExcelNumber(summary.totalProjection)}</td></tr>
          <tr><td>Total Realisasi</td><td style="mso-number-format:'0';">${formatExcelNumber(summary.totalRealization)}</td></tr>
          <tr><td>Total Selisih</td><td style="mso-number-format:'0';">${formatExcelNumber(summary.totalDifference)}</td></tr>
          <tr><td>Total Data</td><td>${escapeHtml(summary.totalRecords)}</td></tr>
        </table>
        <table class="report">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Tanggal Aktivitas</th>
              <th>Customer</th>
              <th>Kode</th>
              <th>Produk</th>
              <th>Periode</th>
              <th>Proyeksi</th>
              <th>Realisasi</th>
              <th>Selisih</th>
              <th>Status</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </body>
    </html>
  `;
};

const buildMembersExcelDocument = (rows, summary, rangeLabel) => {
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.uuid)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.productTitle)}</td>
          <td style="mso-number-format:'0';">${formatExcelNumber(row.totalPaid)}</td>
          <td style="mso-number-format:'0';">${formatExcelNumber(row.totalRequired)}</td>
          <td>${escapeHtml(row.progressText)}</td>
          <td>${escapeHtml(row.overduePeriods)}</td>
          <td>${escapeHtml(row.partialPeriods)}</td>
          <td>${escapeHtml(row.statusLabel)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          p { margin: 0 0 12px; color: #475569; }
          .summary { margin: 18px 0 24px; border-collapse: collapse; }
          .summary td { padding: 10px 12px; border: 1px solid #cbd5e1; }
          .summary td:first-child { font-weight: 700; background: #e0f2fe; }
          table.report { width: 100%; border-collapse: collapse; }
          table.report th { background: #111827; color: #ffffff; padding: 10px 12px; text-align: left; }
          table.report td { border: 1px solid #cbd5e1; padding: 9px 12px; vertical-align: top; }
        </style>
      </head>
      <body>
        <h1>Status Anggota Koperasi</h1>
        <p>Periode ${escapeHtml(rangeLabel)}</p>
        <table class="summary">
          <tr><td>Total Anggota</td><td>${escapeHtml(summary.totalMembers)}</td></tr>
          <tr><td>Lunas (TF)</td><td>${escapeHtml(summary.completedMembers)}</td></tr>
          <tr><td>Overdue</td><td>${escapeHtml(summary.membersWithOverdue)}</td></tr>
          <tr><td>Partial</td><td>${escapeHtml(summary.membersWithPartial)}</td></tr>
        </table>
        <table class="report">
          <thead>
            <tr>
              <th>UUID</th>
              <th>Anggota</th>
              <th>Produk</th>
              <th>Total Bayar</th>
              <th>Total Wajib</th>
              <th>Progress</th>
              <th>Overdue</th>
              <th>Partial</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </body>
    </html>
  `;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const HeroIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <path
      d="M4 18h16M7 15V9m5 6V6m5 9v-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
    <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.5v3M21.5 12h-3M12 18.5v3M5.5 12h-3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const CashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
    <path
      d="M3.5 7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M6.5 9.5h.01M17.5 14.5h.01"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const BalanceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
    <path
      d="M12 4v15m0-15 5 3m-5-3-5 3M5 9h14M7 9l-2.5 4.5A2.5 2.5 0 0 0 6.7 17h.6A2.5 2.5 0 0 0 9.5 13.5L7 9Zm10 0-2.5 4.5A2.5 2.5 0 0 0 16.7 17h.6a2.5 2.5 0 0 0 2.2-3.5L17 9Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StatusBadge = ({ statusKey }) => {
  const status = STATUS_META[statusKey] || STATUS_META.unknown;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.badgeClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
      {status.label}
    </span>
  );
};

const MemberStatusBadge = ({ statusKey }) => {
  const status = MEMBER_STATUS_META[statusKey] || MEMBER_STATUS_META.active;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.badgeClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
      {status.label}
    </span>
  );
};

const SummaryCard = ({ label, value, helper, valueClassName, accentClassName, icon }) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_-36px_rgba(15,23,42,0.7)]">
    <div className="grid min-h-[132px] grid-cols-[92px_1fr]">
      <div className={`flex items-center justify-center text-white ${accentClassName}`}>{icon}</div>
      <div className="flex flex-col justify-center px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
        <h3 className={`mt-2 text-xl font-bold sm:text-2xl ${valueClassName}`}>{value}</h3>
        <p className="mt-2 text-sm text-slate-500">{helper}</p>
      </div>
    </div>
  </div>
);

const MetricPill = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
    <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

const ReportPagination = ({ currentPage, totalPages, totalItems, onPageChange }) => {
  if (totalItems === 0 || totalPages <= 1) return null;

  const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
  const pages = [];

  for (
    let page = Math.max(1, currentPage - 2);
    page <= Math.min(totalPages, currentPage + 2);
    page += 1
  ) {
    pages.push(page);
  }

  if (!pages.includes(1)) pages.unshift(1);
  if (!pages.includes(totalPages)) pages.push(totalPages);

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Menampilkan <span className="font-semibold text-slate-900">{start}</span> -
        <span className="font-semibold text-slate-900"> {end}</span> dari{" "}
        <span className="font-semibold text-slate-900">{totalItems}</span> data
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Sebelumnya
        </button>
        {pages.map((page, index) => {
          const previousPage = pages[index - 1];
          const hasGap = previousPage && page - previousPage > 1;
          return (
            <div key={page} className="flex items-center gap-2">
              {hasGap ? <span className="px-1 text-sm text-slate-400">...</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(page)}
                className={`h-10 min-w-10 rounded-full px-3 text-sm font-semibold transition ${
                  page === currentPage
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/15"
                    : "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
};

const Reports = () => {
  const [members, setMembers] = useState([]);
  const [savings, setSavings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMember, setFilterMember] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("savings");
  const [currentPage, setCurrentPage] = useState(1);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tableContainerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const [membersRes, productsRes] = await Promise.all([
          api.get("/api/admin/members"),
          api.get("/api/admin/products"),
        ]);

        if (membersRes.data.success) {
          setMembers(membersRes.data.data || []);
        }

        if (productsRes.data.success) {
          setProducts(productsRes.data.data || []);
        }

        let allSavings = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const savingsRes = await api.get(`/api/admin/savings?limit=100&page=${page}`);

          if (!savingsRes.data.success) {
            hasMore = false;
            continue;
          }

          const pageSavings = Array.isArray(savingsRes.data.data)
            ? savingsRes.data.data
            : savingsRes.data.data?.savings || [];
          const totalItems =
            savingsRes.data.data?.pagination?.totalItems ||
            savingsRes.data.pagination?.totalItems ||
            0;

          allSavings = [...allSavings, ...pageSavings];
          hasMore = pageSavings.length > 0 && allSavings.length < totalItems;
          page += 1;

          if (page > 20) hasMore = false;
        }

        setSavings(allSavings);
      } catch (error) {
        toast.error(
          `Gagal memuat data laporan: ${error.response?.data?.message || error.message}`
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, filterStatus, filterMember, filterProduct, searchTerm, activeTab]);

  const normalizedSearchTerm = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const productLookup = useMemo(() => {
    const lookup = new Map();

    products.forEach((product) => {
      if (product?._id) lookup.set(String(product._id), product);
    });

    return lookup;
  }, [products]);

  const memberLookup = useMemo(() => {
    const lookup = new Map();

    members.forEach((member) => {
      const resolvedProduct = getResolvedProduct(member, productLookup);
      const normalizedMember = {
        ...member,
        product: resolvedProduct,
      };

      if (member?._id) lookup.set(String(member._id), normalizedMember);
      if (member?.uuid) lookup.set(member.uuid, normalizedMember);
    });

    return lookup;
  }, [members, productLookup]);

  const savingsByMember = useMemo(() => {
    const grouped = new Map();

    savings.forEach((saving) => {
      const keys = [normalizeId(saving.memberId), saving.memberId?.uuid].filter(Boolean);

      keys.forEach((key) => {
        const current = grouped.get(key) || [];
        current.push(saving);
        grouped.set(key, current);
      });
    });

    return grouped;
  }, [savings]);

  const memberMetrics = useMemo(() => {
    let membersWithOverdue = 0;
    let membersWithPartial = 0;
    let membersAllPaid = 0;

    members.forEach((rawMember) => {
      const member = {
        ...rawMember,
        product: getResolvedProduct(rawMember, productLookup),
      };
      const memberSavings = getMemberProductSavings(member, savingsByMember);
      const paymentStatus = getMemberPaymentStatus(member, memberSavings, member.product);

      if (paymentStatus.overduePeriods > 0) membersWithOverdue += 1;
      if (paymentStatus.partialPeriods > 0) membersWithPartial += 1;
      if (
        member.product &&
        paymentStatus.totalRequired > 0 &&
        paymentStatus.overduePeriods === 0 &&
        paymentStatus.totalPaid >= paymentStatus.totalRequired
      ) {
        membersAllPaid += 1;
      }
    });

    return {
      totalMembers: members.length,
      membersWithOverdue,
      membersWithPartial,
      membersAllPaid,
    };
  }, [members, savingsByMember, productLookup]);

  const dashboardStats = useMemo(() => {
    const totalSavingsAmount = savings
      .filter(
        (saving) =>
          saving.type === "Setoran" &&
          (saving.status === "Approved" || saving.status === "Partial")
      )
      .reduce((sum, saving) => sum + (Number(saving.amount) || 0), 0);

    const totalWithdrawals = savings
      .filter((saving) => saving.type === "Penarikan" && saving.status === "Approved")
      .reduce((sum, saving) => sum + (Number(saving.amount) || 0), 0);

    const pendingCount = savings.filter((saving) => saving.status === "Pending").length;
    const partialSavingsCount = savings.filter(
      (saving) => saving.status === "Partial" || saving.paymentType === "Partial"
    ).length;

    return {
      totalMembers: members.length,
      completedMembers: members.filter((member) => member.isCompleted).length,
      totalSavingsAmount,
      netSavings: totalSavingsAmount - totalWithdrawals,
      pendingCount,
      partialSavingsCount,
      membersWithOverdue: memberMetrics.membersWithOverdue,
      membersWithPartial: memberMetrics.membersWithPartial,
      membersAllPaid: memberMetrics.membersAllPaid,
    };
  }, [members, savings, memberMetrics]);

  const transactionRowsBase = useMemo(() => {
    const rows = [];
    const start = new Date(dateFrom);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);

    members.forEach((rawMember) => {
      const member = {
        ...rawMember,
        product: getResolvedProduct(rawMember, productLookup),
      };

      if (!matchesSearchKeyword(normalizedSearchTerm, member.name, member.uuid)) return;
      if (filterMember !== "all" && String(member._id) !== filterMember) return;
      if (
        filterProduct !== "all" &&
        normalizeId(member.product?._id || member.productId) !== filterProduct
      ) {
        return;
      }

      const memberSavings = getMemberProductSavings(member, savingsByMember).filter(
        (saving) => saving.type === "Setoran"
      );

      if (!member.product) {
        rows.push({
          id: `NO_PRODUCT_${member._id}`,
          memberId: String(member._id),
          invoiceNumber: `SAV-${member.uuid || "NA"}-NO-PRODUCT`,
          transactionDate: null,
          sortDate: new Date(start),
          activityDateLabel: "-",
          activityDateLabelLong: "-",
          customerName: member.name || "-",
          customerCode: member.uuid || "-",
          productTitle: "Belum Ambil Produk",
          installmentPeriod: "-",
          projectionAmount: 0,
          realizedAmount: 0,
          differenceAmount: 0,
          statusKey: "unknown",
          statusLabel: STATUS_META.unknown.label,
          description: "Member belum mengambil produk simpanan.",
        });
        return;
      }

      const totalPeriods = Number(member.product.termDuration) || 0;

      for (let period = 1; period <= totalPeriods; period += 1) {
        const periodDate = getMemberPeriodDate(member, period, memberSavings);

        if (periodDate < start || periodDate > end) continue;

        const attempts = memberSavings
          .filter((saving) => Number(saving.installmentPeriod) === period)
          .sort(
            (first, second) =>
              new Date(second.savingsDate || second.createdAt) -
              new Date(first.savingsDate || first.createdAt)
          );

        const approvedAttempts = attempts.filter((attempt) => attempt.status === "Approved");
        const partialAttempts = attempts.filter((attempt) => attempt.status === "Partial");
        const pendingAttempts = attempts.filter((attempt) => attempt.status === "Pending");
        const rejectedAttempts = attempts.filter((attempt) => attempt.status === "Rejected");

        const latestAttempt =
          approvedAttempts[0] ||
          partialAttempts[0] ||
          pendingAttempts[0] ||
          rejectedAttempts[0] ||
          attempts[0] ||
          null;

        const projectionAmount = getRequiredAmountForPeriod(member, member.product, period);
        const realizedAmount = [...approvedAttempts, ...partialAttempts].reduce(
          (sum, attempt) => sum + (Number(attempt.amount) || 0),
          0
        );
        const differenceAmount = projectionAmount - realizedAmount;

        let statusKey = "unpaid";
        if (realizedAmount >= projectionAmount && projectionAmount > 0) {
          statusKey = "paid";
        } else if (realizedAmount > 0) {
          statusKey = "partial";
        } else if (pendingAttempts.length > 0) {
          statusKey = "pending";
        } else if (rejectedAttempts.length > 0) {
          statusKey = "rejected";
        }

        const invoiceNumber =
          latestAttempt?.invoiceNumber ||
          latestAttempt?.uuid ||
          `SAV-${member.uuid || "NA"}-P${period}`;

        const transactionDate = latestAttempt?.savingsDate || latestAttempt?.createdAt || null;

        let description = latestAttempt?.description || "-";
        if (!latestAttempt && statusKey === "unpaid") {
          description = "Belum ada transaksi pada periode ini";
        } else if (!latestAttempt && statusKey === "pending") {
          description = "Belum ada approval";
        } else if (statusKey === "rejected" && (!description || description === "-")) {
          description = "Transaksi ditolak";
        }

        rows.push({
          id: latestAttempt?._id ? `${latestAttempt._id}-period` : `${member._id}-P${period}`,
          memberId: String(member._id),
          invoiceNumber,
          transactionDate,
          sortDate: transactionDate ? new Date(transactionDate) : new Date(periodDate),
          activityDateLabel: transactionDate
            ? formatShortDate(transactionDate)
            : formatMonthYear(periodDate),
          activityDateLabelLong: transactionDate
            ? formatLongDate(transactionDate)
            : formatMonthYear(periodDate),
          customerName: member.name || "-",
          customerCode: member.uuid || "-",
          productTitle: member.product?.title || "-",
          installmentPeriod: period,
          projectionAmount,
          realizedAmount,
          differenceAmount,
          statusKey,
          statusLabel: STATUS_META[statusKey]?.label || STATUS_META.unknown.label,
          description,
        });
      }
    });

    return rows.sort((first, second) => second.sortDate - first.sortDate);
  }, [
    members,
    productLookup,
    savingsByMember,
    dateFrom,
    dateTo,
    filterMember,
    filterProduct,
    normalizedSearchTerm,
  ]);

  const transactionRows = useMemo(() => {
    if (!SAVINGS_FILTERS.includes(filterStatus)) return transactionRowsBase;
    return transactionRowsBase.filter((row) => row.statusKey === filterStatus);
  }, [transactionRowsBase, filterStatus]);

  const reportSummary = useMemo(() => {
    const totalProjection = transactionRows.reduce((sum, row) => sum + row.projectionAmount, 0);
    const totalRealization = transactionRows.reduce((sum, row) => sum + row.realizedAmount, 0);
    const totalDifference = totalProjection - totalRealization;

    return {
      totalProjection,
      totalRealization,
      totalDifference,
      totalRecords: transactionRows.length,
      paidCount: transactionRows.filter((row) => row.statusKey === "paid").length,
      partialCount: transactionRows.filter((row) => row.statusKey === "partial").length,
      pendingCount: transactionRows.filter((row) => row.statusKey === "pending").length,
      rejectedCount: transactionRows.filter((row) => row.statusKey === "rejected").length,
      unpaidCount: transactionRows.filter((row) => row.statusKey === "unpaid").length,
    };
  }, [transactionRows]);

  const transactionOverview = useMemo(() => {
    return {
      totalRecords: transactionRowsBase.length,
      paidCount: transactionRowsBase.filter((row) => row.statusKey === "paid").length,
      partialCount: transactionRowsBase.filter((row) => row.statusKey === "partial").length,
      pendingCount: transactionRowsBase.filter((row) => row.statusKey === "pending").length,
      rejectedCount: transactionRowsBase.filter((row) => row.statusKey === "rejected").length,
      unpaidCount: transactionRowsBase.filter((row) => row.statusKey === "unpaid").length,
    };
  }, [transactionRowsBase]);

  const memberBaseRows = useMemo(() => {
    let rows = members.map((rawMember) => {
      const member = {
        ...rawMember,
        product: getResolvedProduct(rawMember, productLookup),
      };

      const memberSavings = getMemberProductSavings(member, savingsByMember);
      const paymentStatus = getMemberPaymentStatus(member, memberSavings, member.product);
      const product = member.product || {};
      const progressPercent = Number(paymentStatus.progress || 0);

      let statusKey = "active";
      if (!member.product) {
        statusKey = "no_product";
      } else if (member.isCompleted) {
        statusKey = "completed";
      } else if (paymentStatus.overduePeriods > 0) {
        statusKey = "overdue";
      } else if (paymentStatus.partialPeriods > 0) {
        statusKey = "partial";
      } else if (
        paymentStatus.totalRequired > 0 &&
        paymentStatus.totalPaid >= paymentStatus.totalRequired
      ) {
        statusKey = "all_paid";
      }

      return {
        id: member._id,
        memberId: String(member._id),
        uuid: member.uuid || "-",
        name: member.name || "-",
        productId: normalizeId(member.product?._id || member.productId),
        productTitle: product.title || "Belum Ambil Produk",
        totalPaid: paymentStatus.totalPaid,
        totalRequired: paymentStatus.totalRequired,
        paidPeriods: paymentStatus.paidPeriods,
        partialPeriods: paymentStatus.partialPeriods,
        overduePeriods: paymentStatus.overduePeriods,
        unpaidPeriods: paymentStatus.unpaidPeriods,
        progressPercent,
        progressText: `${Math.round(progressPercent)}%`,
        statusKey,
        statusLabel: MEMBER_STATUS_META[statusKey]?.label || "Aktif",
      };
    });

    if (normalizedSearchTerm) {
      rows = rows.filter((row) => matchesSearchKeyword(normalizedSearchTerm, row.name, row.uuid));
    }

    if (filterMember !== "all") {
      rows = rows.filter((row) => row.memberId === filterMember);
    }

    if (filterProduct !== "all") {
      rows = rows.filter((row) => row.productId === filterProduct);
    }

    return rows.sort((first, second) => first.name.localeCompare(second.name, "id-ID"));
  }, [members, savingsByMember, productLookup, filterMember, filterProduct, normalizedSearchTerm]);

  const memberStatusRows = useMemo(() => {
    if (filterStatus === "completed") {
      return memberBaseRows.filter((row) => row.statusKey === "completed");
    }
    if (filterStatus === "not_completed") {
      return memberBaseRows.filter((row) => row.statusKey !== "completed");
    }
    if (filterStatus === "has_overdue") {
      return memberBaseRows.filter((row) => row.overduePeriods > 0);
    }
    if (filterStatus === "has_partial") {
      return memberBaseRows.filter((row) => row.partialPeriods > 0);
    }
    if (filterStatus === "all_paid") {
      return memberBaseRows.filter((row) => row.statusKey === "all_paid");
    }
    return memberBaseRows;
  }, [memberBaseRows, filterStatus]);

  const savingsTabMemberCount = useMemo(() => {
    return transactionRowsBase.length;
  }, [transactionRowsBase]);

  const withdrawalAmount = useMemo(() => {
    let result = savings.filter(
      (saving) => saving.type === "Penarikan" && saving.status === "Approved"
    );

    if (dateFrom && dateTo) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);

      result = result.filter((saving) => {
        const activityDate = new Date(saving.savingsDate || saving.createdAt);
        return activityDate >= start && activityDate <= end;
      });
    }

    if (filterMember !== "all") {
      result = result.filter((saving) => normalizeId(saving.memberId) === filterMember);
    }

    if (filterProduct !== "all") {
      result = result.filter((saving) => normalizeId(saving.productId) === filterProduct);
    }

    if (normalizedSearchTerm) {
      result = result.filter((saving) => {
        const member =
          memberLookup.get(normalizeId(saving.memberId)) || memberLookup.get(saving.memberId?.uuid);
        return matchesSearchKeyword(normalizedSearchTerm, member?.name, member?.uuid);
      });
    }

    return result.reduce((sum, saving) => sum + (Number(saving.amount) || 0), 0);
  }, [
    savings,
    dateFrom,
    dateTo,
    filterMember,
    filterProduct,
    normalizedSearchTerm,
    memberLookup,
  ]);

  const activeRows = activeTab === "savings" ? transactionRows : memberStatusRows;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return activeRows.slice(start, start + ITEMS_PER_PAGE);
  }, [activeRows, currentPage]);

  const rangeLabel = useMemo(() => getRangeLabel(dateFrom, dateTo), [dateFrom, dateTo]);

  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) return undefined;

    const updateScrollState = () => {
      const hasOverflow = element.scrollWidth > element.clientWidth + 8;
      setCanScrollLeft(hasOverflow && element.scrollLeft > 8);
      setCanScrollRight(
        hasOverflow && element.scrollLeft + element.clientWidth < element.scrollWidth - 8
      );
    };

    updateScrollState();
    element.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [activeRows.length, activeTab]);

  const exportToPDF = () => {
    if (!activeRows.length) {
      toast.info("Tidak ada data laporan untuk diunduh.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = format(new Date(), "dd MMM yyyy HH:mm", { locale: id });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(activeTab === "savings" ? "LAPORAN KOPERASI" : "STATUS ANGGOTA KOPERASI", 40, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Periode: ${rangeLabel}`, 40, 60);
    doc.text(`Dicetak: ${generatedAt}`, pageWidth - 40, 60, { align: "right" });

    doc.setDrawColor(203, 213, 225);
    doc.line(40, 74, pageWidth - 40, 74);

    const summaryRows =
      activeTab === "savings"
        ? [
            ["Total Proyeksi", formatCurrency(reportSummary.totalProjection)],
            ["Total Realisasi", formatCurrency(reportSummary.totalRealization)],
            [
              "Total Selisih",
              `${reportSummary.totalDifference >= 0 ? "+" : "-"}${formatCurrency(
                Math.abs(reportSummary.totalDifference)
              )}`,
            ],
            ["Total Data", compactNumberFormatter.format(reportSummary.totalRecords)],
          ]
        : [
            ["Total Anggota", compactNumberFormatter.format(memberStatusRows.length)],
            ["Lunas (TF)", compactNumberFormatter.format(dashboardStats.completedMembers)],
            ["Overdue", compactNumberFormatter.format(dashboardStats.membersWithOverdue)],
            ["Partial", compactNumberFormatter.format(dashboardStats.membersWithPartial)],
          ];

    doc.autoTable({
      startY: 92,
      head: [["Ringkasan", "Nilai"]],
      body: summaryRows,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 8 },
      margin: { left: 40, right: pageWidth - 300 },
    });

    if (activeTab === "savings") {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 18,
        head: [[
          "Invoice",
          "Tanggal Aktivitas",
          "Customer",
          "Produk",
          "Periode",
          "Proyeksi",
          "Realisasi",
          "Selisih",
          "Status",
        ]],
        body: transactionRows.map((row) => [
          row.invoiceNumber,
          row.activityDateLabel,
          `${row.customerName} (${row.customerCode})`,
          row.productTitle,
          String(row.installmentPeriod),
          formatCurrency(row.projectionAmount),
          formatCurrency(row.realizedAmount),
          `${row.differenceAmount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(row.differenceAmount))}`,
          row.statusLabel,
        ]),
        theme: "striped",
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 6, valign: "middle" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
    } else {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 18,
        head: [[
          "UUID",
          "Anggota",
          "Produk",
          "Total Bayar",
          "Total Wajib",
          "Progress",
          "Overdue",
          "Partial",
          "Status",
        ]],
        body: memberStatusRows.map((row) => [
          row.uuid,
          row.name,
          row.productTitle,
          formatCurrency(row.totalPaid),
          formatCurrency(row.totalRequired),
          row.progressText,
          String(row.overduePeriods),
          String(row.partialPeriods),
          row.statusLabel,
        ]),
        theme: "striped",
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 6, valign: "middle" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
    }

    doc.save(`Laporan_Koperasi_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast.success("PDF laporan berhasil diunduh.");
  };

  const exportToExcel = () => {
    if (!activeRows.length) {
      toast.info("Tidak ada data laporan untuk diunduh.");
      return;
    }

    const documentHtml =
      activeTab === "savings"
        ? buildSavingsExcelDocument(transactionRows, reportSummary, rangeLabel)
        : buildMembersExcelDocument(memberStatusRows, dashboardStats, rangeLabel);

    const blob = new Blob([`\ufeff${documentHtml}`], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });

    downloadBlob(blob, `Laporan_Koperasi_${format(new Date(), "yyyyMMdd_HHmm")}.xls`);
    toast.success("Excel laporan berhasil diunduh.");
  };

  const resetFilters = () => {
    setDateFrom(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setDateTo(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    setFilterStatus("all");
    setFilterMember("all");
    setFilterProduct("all");
    setSearchTerm("");
    setActiveTab("savings");
    setCurrentPage(1);
  };

  const switchTab = (nextTab, nextStatus = "all") => {
    setActiveTab(nextTab);
    setFilterStatus(nextStatus);
    setCurrentPage(1);
  };

  const scrollTable = (direction) => {
    const element = tableContainerRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-sky-100 border-t-sky-600" />
          <p className="mt-5 text-sm font-medium tracking-[0.18em] text-slate-500">
            MEMUAT LAPORAN
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-sky-50 shadow-[0_24px_55px_-40px_rgba(14,116,144,0.45)]">
        <div className="absolute inset-y-0 right-0 hidden w-80 bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.18),_transparent_70%)] lg:block" />
        <div className="relative grid gap-8 px-6 py-7 lg:grid-cols-[1.25fr_0.75fr] lg:px-8">
          <div>
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm shadow-sky-100/60">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <HeroIcon />
              </span>
              Laporan Bulanan
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[2rem]">
              Dashboard laporan koperasi dengan format yang fokus ke realisasi periode.
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>Dashboard</span>
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              <span className="font-semibold text-slate-700">Laporan</span>
            </div>
          </div>

          <div className="hidden lg:flex lg:justify-end">
            <div className="relative w-full max-w-sm rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_30px_65px_-48px_rgba(14,116,144,0.8)] backdrop-blur">
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Periode aktif</p>
                  <p className="mt-2 text-lg font-semibold">{rangeLabel}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Data tampil</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {compactNumberFormatter.format(activeRows.length)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      {activeTab === "savings" ? "Status paid" : "Lunas (TF)"}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-emerald-600">
                      {compactNumberFormatter.format(
                        activeTab === "savings"
                          ? reportSummary.paidCount
                          : dashboardStats.completedMembers
                      )}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-sky-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Ekspor cepat
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={exportToExcel}
                      disabled={!activeRows.length}
                      className="inline-flex flex-1 items-center justify-center rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={exportToPDF}
                      disabled={!activeRows.length}
                      className="inline-flex flex-1 items-center justify-center rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.75)] sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
              Filter Laporan
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Atur periode dan scope data</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportToExcel}
              disabled={!activeRows.length}
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={exportToPDF}
              disabled={!activeRows.length}
              className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              PDF
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Tanggal Mulai</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Tanggal Selesai</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Status</span>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">Semua Status</option>
              {activeTab === "savings" ? (
                <>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="unpaid">Belum Bayar</option>
                </>
              ) : (
                <>
                  <option value="completed">Lunas (TF)</option>
                  <option value="not_completed">Belum Lunas</option>
                  <option value="has_overdue">Ada Overdue</option>
                  <option value="has_partial">Ada Partial</option>
                  <option value="all_paid">All Paid</option>
                </>
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Anggota</span>
            <select
              value={filterMember}
              onChange={(event) => setFilterMember(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">Semua Anggota</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_280px]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Produk Simpanan</span>
            <select
              value={filterProduct}
              onChange={(event) => setFilterProduct(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              <option value="all">Semua Produk</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-600">Cari Nama / UUID</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari nama anggota atau UUID..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="rounded-[22px] border border-sky-100 bg-sky-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Snapshot cepat
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Filter akan langsung memperbarui kartu ringkasan, tab cepat, tabel, dan file export.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricPill
            label="Total anggota"
            value={compactNumberFormatter.format(memberMetrics.totalMembers)}
          />
          <MetricPill
            label="Overdue anggota"
            value={compactNumberFormatter.format(memberMetrics.membersWithOverdue)}
          />
          <MetricPill
            label="Partial anggota"
            value={compactNumberFormatter.format(memberMetrics.membersWithPartial)}
          />
          <MetricPill
            label="Semua lunas"
            value={compactNumberFormatter.format(memberMetrics.membersAllPaid)}
          />
          <MetricPill
            label="Pending transaksi"
            value={compactNumberFormatter.format(transactionOverview.pendingCount)}
          />
          <MetricPill label="Penarikan" value={formatCurrency(withdrawalAmount)} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <button
            type="button"
            onClick={() => switchTab("members")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50"
          >
            <p className="text-xs text-slate-500">Total Anggota</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.totalMembers}</p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("members", "completed")}
            className="rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
          >
            <p className="text-xs text-slate-500">Lunas (TF)</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {dashboardStats.completedMembers}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings")}
            className="rounded-2xl border border-sky-100 bg-white px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50"
          >
            <p className="text-xs text-slate-500">Total Simpanan</p>
            <p className="mt-2 text-base font-bold text-sky-600">
              {formatCurrency(dashboardStats.totalSavingsAmount)}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings")}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
          >
            <p className="text-xs text-slate-500">Saldo Bersih</p>
            <p className="mt-2 text-base font-bold text-violet-600">
              {formatCurrency(dashboardStats.netSavings)}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings", "pending")}
            className="rounded-2xl border border-amber-100 bg-white px-4 py-4 text-left transition hover:border-amber-200 hover:bg-amber-50"
          >
            <p className="text-xs text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">
              {transactionOverview.pendingCount}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("members", "has_partial")}
            className="rounded-2xl border border-orange-100 bg-white px-4 py-4 text-left transition hover:border-orange-200 hover:bg-orange-50"
          >
            <p className="text-xs text-slate-500">Partial (Bulan Ini)</p>
            <p className="mt-2 text-2xl font-bold text-orange-600">
              {dashboardStats.membersWithPartial}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("members", "has_overdue")}
            className="rounded-2xl border border-rose-100 bg-white px-4 py-4 text-left transition hover:border-rose-200 hover:bg-rose-50"
          >
            <p className="text-xs text-slate-500">Overdue</p>
            <p className="mt-2 text-2xl font-bold text-rose-600">
              {dashboardStats.membersWithOverdue}
            </p>
          </button>
          <button
            type="button"
            onClick={() => switchTab("members", "all_paid")}
            className="rounded-2xl border border-teal-100 bg-white px-4 py-4 text-left transition hover:border-teal-200 hover:bg-teal-50"
          >
            <p className="text-xs text-slate-500">All Paid</p>
            <p className="mt-2 text-2xl font-bold text-teal-600">
              {dashboardStats.membersAllPaid}
            </p>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => switchTab("savings")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "savings" && filterStatus === "all"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            💰 Transaksi Simpanan ({savingsTabMemberCount})
          </button>
          <button
            type="button"
            onClick={() => switchTab("members")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "members" && filterStatus === "all"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            👥 Status Anggota ({memberBaseRows.length})
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings", "partial")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "savings" && filterStatus === "partial"
                ? "bg-amber-500 text-white"
                : "border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
            }`}
          >
            🟠 Partial ({transactionOverview.partialCount})
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings", "pending")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "savings" && filterStatus === "pending"
                ? "bg-sky-500 text-white"
                : "border border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
            }`}
          >
            ⏳ Pending ({transactionOverview.pendingCount})
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings", "rejected")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "savings" && filterStatus === "rejected"
                ? "bg-rose-500 text-white"
                : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
            }`}
          >
            ❌ Rejected ({transactionOverview.rejectedCount})
          </button>
          <button
            type="button"
            onClick={() => switchTab("savings", "unpaid")}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "savings" && filterStatus === "unpaid"
                ? "bg-slate-700 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            📌 Belum Bayar ({transactionOverview.unpaidCount})
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <SummaryCard
          label="Total Proyeksi"
          value={formatCurrency(reportSummary.totalProjection)}
          helper="Target setoran yang terbaca pada periode terfilter"
          valueClassName="text-slate-900"
          accentClassName="bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600"
          icon={<TargetIcon />}
        />
        <SummaryCard
          label="Total Realisasi"
          value={formatCurrency(reportSummary.totalRealization)}
          helper="Nominal setoran yang benar-benar tercatat pada tabel"
          valueClassName="text-slate-900"
          accentClassName="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-500"
          icon={<CashIcon />}
        />
        <SummaryCard
          label="Total Selisih"
          value={`${reportSummary.totalDifference >= 0 ? "+" : "-"}${formatCurrency(
            Math.abs(reportSummary.totalDifference)
          )}`}
          helper={
            reportSummary.totalDifference <= 0
              ? "Realisasi sudah mencapai atau melampaui target periode ini"
              : "Masih ada selisih target yang belum terealisasi"
          }
          valueClassName={
            reportSummary.totalDifference <= 0 ? "text-emerald-600" : "text-rose-600"
          }
          accentClassName={
            reportSummary.totalDifference <= 0
              ? "bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600"
              : "bg-gradient-to-br from-rose-500 via-rose-600 to-orange-500"
          }
          icon={<BalanceIcon />}
        />
      </section>

      <section className="rounded-[28px] border border-sky-200 bg-sky-50/80 p-5 shadow-[0_24px_50px_-42px_rgba(56,189,248,0.45)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm shadow-sky-100">
            <HeroIcon />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-sky-900">Logic Laporan</h3>
            <p className="text-sm leading-6 text-slate-600">
              Laporan tetap <strong>per periode / per bulan</strong>. Jadi sekarang yang tampil bukan
              cuma transaksi yang sudah ada, tapi juga <strong>periode jatuh tempo yang belum ada pembayaran</strong>.
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Untuk status <strong>Belum Bayar</strong>, tanggal aktivitas ditampilkan sebagai
              <strong> bulan dan tahun periode</strong>. Member yang periode pertamanya di luar range
              tanggal tidak dipaksa masuk sebagai belum bayar.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_70px_-55px_rgba(15,23,42,0.95)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
              Laporan Periode
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {activeTab === "savings" ? `Laporan ${rangeLabel}` : "Status Anggota Koperasi"}
              <span className="ml-2 text-sm font-medium text-slate-400">
                {activeTab === "savings"
                  ? "(berdasarkan aktivitas transaksi)"
                  : "(berdasarkan progress tabungan anggota)"}
              </span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollTable(-1)}
                disabled={!canScrollLeft}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Scroll kiri"
              >
                &#8592;
              </button>
              <button
                type="button"
                onClick={() => scrollTable(1)}
                disabled={!canScrollRight}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Scroll kanan"
              >
                &#8594;
              </button>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
              Total Data: {compactNumberFormatter.format(activeRows.length)}
            </div>
          </div>
        </div>

        <div ref={tableContainerRef} className="overflow-x-auto">
          {activeTab === "savings" ? (
            <table className="min-w-[1180px] w-full border-collapse">
              <thead className="bg-slate-900 text-white">
                <tr className="text-left text-sm">
                  <th className="px-5 py-4 text-center font-semibold">
                    Tanggal
                    <br />
                    <span className="text-xs font-medium text-slate-300">Aktivitas</span>
                  </th>
                  <th className="px-5 py-4 font-semibold">Customer</th>
                  <th className="px-5 py-4 text-right font-semibold">
                    Proyeksi
                    <br />
                    <span className="text-xs font-medium text-slate-300">(Periode)</span>
                  </th>
                  <th className="px-5 py-4 text-right font-semibold">
                    Realisasi
                    <br />
                    <span className="text-xs font-medium text-slate-300">(Periode)</span>
                  </th>
                  <th className="px-5 py-4 text-right font-semibold">
                    Selisih
                    <br />
                    <span className="text-xs font-medium text-slate-300">(Periode)</span>
                  </th>
                  <th className="px-5 py-4 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
                          &#128196;
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-slate-900">
                          Tidak ada data untuk filter ini
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Coba ubah tanggal, status, pilihan anggota, atau search supaya data lain ikut
                          tampil.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 text-sm transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4 text-center align-top text-slate-600">
                        {row.activityDateLabel}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                            {(row.customerName || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/master/anggota/${row.customerCode}`}
                              className="block truncate font-semibold text-sky-700 hover:text-sky-800 hover:underline"
                              title={row.customerName}
                            >
                              {row.customerName}
                            </Link>
                            <p className="truncate text-xs text-slate-500" title={row.customerCode}>
                              {row.customerCode} • {row.productTitle} • Periode {row.installmentPeriod}
                            </p>
                            {row.description && row.description !== "-" ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                                {row.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right align-top font-semibold text-slate-800">
                        {formatCurrency(row.projectionAmount)}
                      </td>
                      <td className="px-5 py-4 text-right align-top font-semibold text-slate-800">
                        {formatCurrency(row.realizedAmount)}
                      </td>
                      <td
                        className={`px-5 py-4 text-right align-top font-bold ${getDifferenceClass(
                          row.statusKey,
                          row.differenceAmount
                        )}`}
                      >
                        {row.differenceAmount >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(row.differenceAmount))}
                      </td>
                      <td className="px-5 py-4 text-center align-top">
                        <StatusBadge statusKey={row.statusKey} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[1120px] w-full border-collapse">
              <thead className="bg-slate-900 text-white">
                <tr className="text-left text-sm">
                  <th className="px-5 py-4 font-semibold">UUID</th>
                  <th className="px-5 py-4 font-semibold">Anggota</th>
                  <th className="px-5 py-4 font-semibold">Produk</th>
                  <th className="px-5 py-4 text-right font-semibold">Total Bayar</th>
                  <th className="px-5 py-4 text-right font-semibold">Total Wajib</th>
                  <th className="px-5 py-4 text-center font-semibold">Progress</th>
                  <th className="px-5 py-4 text-center font-semibold">Overdue</th>
                  <th className="px-5 py-4 text-center font-semibold">Partial</th>
                  <th className="px-5 py-4 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
                          &#128101;
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-slate-900">
                          Tidak ada status anggota untuk filter ini
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Coba ubah produk, anggota, status, atau search agar data anggota tampil.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 text-sm transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4 font-semibold text-sky-700">{row.uuid}</td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">{row.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Lunas {row.paidPeriods} periode • Belum lunas {row.unpaidPeriods} periode
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.productTitle}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-800">
                        {formatCurrency(row.totalPaid)}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-800">
                        {formatCurrency(row.totalRequired)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="mx-auto w-24">
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${Math.min(100, row.progressPercent)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs font-semibold text-slate-600">
                            {row.progressText}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center font-semibold text-rose-600">
                        {row.overduePeriods}
                      </td>
                      <td className="px-5 py-4 text-center font-semibold text-amber-600">
                        {row.partialPeriods}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <MemberStatusBadge statusKey={row.statusKey} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <ReportPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={activeRows.length}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
};

export default Reports;
