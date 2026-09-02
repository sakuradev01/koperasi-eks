/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import api from "../api/index.jsx";
import { SavingsChart } from "../components/charts/index.jsx";

/* Inline stroke icons (Lucide-style) — replaces emoji */
const Icon = ({ paths, size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

const icons = {
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  wallet: ["M21 12V7H5a2 2 0 0 1 0-4h14v4", "M3 5v14a2 2 0 0 0 2 2h16v-5", "M18 12a2 2 0 0 0 0 4h4v-4z"],
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  checkCircle: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m9 11 3 3L22 4"],
  package: ["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.3 7 12 12l8.7-5", "M12 22V12"],
  creditCard: ["M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z", "M2 10h20"],
  alertTriangle: ["m10.29 3.86-8.46 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  userPlus: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M19 8v6", "M22 11h-6"],
  arrowUpCircle: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m8 12 4-4 4 4", "M12 16V8"],
  plusCircle: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 8v8", "M8 12h8"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
};

const formatIDR = (value) =>
  typeof value === "number"
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(value)
    : "Rp 0";

const Dashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalDeposits: 0,
    totalProducts: 0,
    activeSavingsCount: 0,
    recentTransactions: [],
    monthlyStats: [],
    // Loan statistics
    totalLoanProducts: 0,
    totalActiveLoans: 0,
    totalLoanDisbursed: 0,
    totalLoanCollected: 0,
    totalOutstanding: 0,
    overdueLoans: 0,
    recentLoanActivities: [],
    monthlyLoanStats: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await api.get("/api/admin/dashboard");
        if (response.data.success) {
          setStats({
            totalMembers: response.data.data.totalMembers,
            totalDeposits: response.data.data.totalSavings,
            totalProducts: response.data.data.totalProducts,
            activeSavingsCount: response.data.data.activeSavingsCount || 0,
            recentTransactions: response.data.data.recentTransactions,
            monthlyStats: response.data.data.monthlyStats || [],
            // Loan statistics
            totalLoanProducts: response.data.data.totalLoanProducts || 0,
            totalActiveLoans: response.data.data.totalActiveLoans || 0,
            totalLoanDisbursed: response.data.data.totalLoanDisbursed || 0,
            totalLoanCollected: response.data.data.totalLoanCollected || 0,
            totalOutstanding: response.data.data.totalOutstanding || 0,
            overdueLoans: response.data.data.overdueLoans || 0,
            recentLoanActivities: response.data.data.recentLoanActivities || [],
            monthlyLoanStats: response.data.data.monthlyLoanStats || [],
          });
        }
      } catch (err) {
        setError("Gagal memuat data dashboard");
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="h-8 w-64 rounded-lg bg-slate-200/70 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-lg bg-slate-200/70 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-slate-200/70 animate-pulse" />
                  <div className="h-5 w-20 rounded bg-slate-200/70 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="max-w-sm w-full rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Icon paths={icons.alertTriangle} size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Terjadi kesalahan
          </h2>
          <p className="mt-1 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="p-4 sm:p-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-5 sm:mb-7">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {todayLabel}
        </p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
          Selamat datang, {user?.name || "Admin"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ringkasan aktivitas Koperasi SAMIT hari ini.
        </p>
      </div>

      {/* Savings Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4 sm:mb-6">
        <StatCard
          title="Total Anggota"
          value={stats.totalMembers}
          icon={icons.users}
          tone="primary"
        />
        <StatCard
          title="Total Simpanan"
          value={formatIDR(stats.totalDeposits)}
          icon={icons.wallet}
          tone="slate"
        />
        <StatCard
          title="Produk Simpanan"
          value={stats.totalProducts}
          icon={icons.layers}
          tone="primary"
        />
        <StatCard
          title="Simpanan Aktif"
          value={stats.activeSavingsCount}
          icon={icons.checkCircle}
          tone="emerald"
        />
      </div>

      {/* Loan Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4 sm:mb-6">
        <StatCard
          title="Produk Pinjaman"
          value={stats.totalLoanProducts || 0}
          icon={icons.package}
          tone="slate"
        />
        <StatCard
          title="Pinjaman Aktif"
          value={stats.totalActiveLoans || 0}
          icon={icons.creditCard}
          tone="primary"
        />
        <StatCard
          title="Pinjaman Terbayar"
          value={formatIDR(stats.totalLoanCollected)}
          icon={icons.checkCircle}
          tone="emerald"
        />
        <StatCard
          title="Jatuh Tempo"
          value={stats.overdueLoans || 0}
          icon={icons.alertTriangle}
          tone={stats.overdueLoans > 0 ? "danger" : "slate"}
        />
      </div>

      {/* Quick Actions + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Aksi Cepat
          </h3>
          <div className="space-y-2">
            <QuickAction
              to="/master/anggota"
              icon={icons.userPlus}
              label="Tambah Anggota Baru"
              hint="Kelola data & registrasi anggota"
            />
            <QuickAction
              to="/simpanan"
              icon={icons.arrowUpCircle}
              label="Proses Setoran"
              hint="Catat setoran & penarikan simpanan"
            />
            <QuickAction
              to="/master/produk"
              icon={icons.plusCircle}
              label="Tambah Produk"
              hint="Buat produk simpanan atau pinjaman"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Aktivitas Terkini
          </h3>
          {stats.recentTransactions?.length ? (
            <div className="divide-y divide-slate-100">
              {stats.recentTransactions.map((transaction) => (
                <TransactionItem key={transaction.id} transaction={transaction} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Belum ada transaksi terbaru.
            </p>
          )}
        </section>
      </div>

      {/* Chart */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Statistik Bulanan
        </h3>
        <SavingsChart data={stats.monthlyStats} />
      </section>
    </div>
  );
};

const toneStyles = {
  primary: { chip: "bg-primary-50 text-primary-700", value: "text-slate-900" },
  slate: { chip: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  emerald: { chip: "bg-emerald-50 text-emerald-600", value: "text-slate-900" },
  danger: { chip: "bg-red-50 text-red-600", value: "text-red-600" },
};

// Stat Card Component
const StatCard = ({ title, value, icon, tone = "primary" }) => {
  const tone_ = toneStyles[tone] || toneStyles.primary;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-4 sm:p-5 min-w-0">
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <div className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg ${tone_.chip}`}>
          <Icon paths={icon} size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{title}</p>
          <p className={`mt-0.5 text-lg sm:text-xl font-semibold tracking-tight tnum num-safe ${tone_.value}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

// Quick Action Component
const QuickAction = ({ to, icon, label, hint }) => (
  <Link
    to={to}
    className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-primary-100 hover:bg-primary-50/60"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100">
      <Icon paths={icon} size={18} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-900">{label}</span>
      <span className="block truncate text-xs text-slate-500">{hint}</span>
    </span>
    <span className="shrink-0 text-slate-400 transition-colors group-hover:text-primary-600">
      <Icon paths={icons.arrowRight} size={16} />
    </span>
  </Link>
);

// Transaction Item Component
const TransactionItem = ({ transaction }) => {
  const isDeposit = transaction.type === "Setoran";
  const member = transaction.member || "-";
  return (
    <div className="flex items-center justify-between gap-3 py-3 min-w-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
          {member.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{member}</p>
          <p className="text-xs text-slate-500">{transaction.date}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-semibold tnum ${isDeposit ? "text-emerald-600" : "text-red-600"}`}
        >
          {isDeposit ? "+" : "−"}Rp{" "}
          {typeof transaction.amount === "number"
            ? transaction.amount.toLocaleString("id-ID")
            : "0"}
        </p>
        <p className="text-xs text-slate-500">{transaction.type}</p>
      </div>
    </div>
  );
};

export default Dashboard;

