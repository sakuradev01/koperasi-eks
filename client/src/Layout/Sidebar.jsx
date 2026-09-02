/* eslint-disable react/prop-types */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import PropTypes from "prop-types";

// Inline SVG icons (Lucide-style, stroke = currentColor). No emoji in UI chrome.
const Icon = ({ paths, size = 18, className = "" }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

const icons = {
  dashboard: ["M3 12h7V3H3v9Z", "M14 21h7v-9h-7v9Z", "M3 21h7v-6H3v6Z", "M14 8h7V3h-7v5Z"],
  savings: [
    "M19 5c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3",
    "M12.5 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4",
    "M2 10h13",
  ],
  gift: [
    "M20 12v10H4V12",
    "M2 7h20v5H2z",
    "M12 22V7",
    "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z",
    "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z",
  ],
  bank: ["M3 22h18", "M6 18v-7", "M10 18v-7", "M14 18v-7", "M18 18v-7", "M12 2 3 7h18l-9-5Z"],
  emergency: [
    "M12 9v4",
    "M12 17h.01",
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
  ],
  report: ["M3 3v18h18", "M7 15v-4", "M12 15V7", "M17 15v-8"],
  invoice: [
    "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z",
    "M8 7h8",
    "M8 11h8",
    "M8 15h5",
  ],
  master: [
    "M8 3h8l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M13 3v5h5",
    "M9 13h6",
    "M9 17h6",
  ],
  expense: ["M12 2v20", "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  accounting: [
    "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z",
    "M8 8h.01",
    "M12 8h.01",
    "M16 8h.01",
    "M8 12h.01",
    "M12 12h.01",
    "M16 12h.01",
    "M8 16h.01",
    "M12 16h.01",
    "M16 16h.01",
  ],
  reports: [
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
    "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
  ],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  ],
  operator: [
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  ],
};

const menuIconMap = {
  Dashboard: "dashboard",
  Simpanan: "savings",
  Donasi: "gift",
  "Manajemen Pinjaman": "bank",
  "Dana Darurat": "emergency",
  Laporan: "report",
  Invoice: "invoice",
  "Master Data": "master",
  Expenses: "expense",
  Akuntansi: "accounting",
  Reports: "reports",
  Pengaturan: "settings",
  Operator: "operator",
};

const menuItems = [
  { title: "Dashboard", path: "/dashboard", permissionKey: "dashboard" },
  { title: "Simpanan", path: "/simpanan", permissionKey: "simpanan" },
  { title: "Donasi", path: "/donasi", permissionKey: "donasi" },
  {
    title: "Manajemen Pinjaman",
    path: "/loan-management",
    permissionKey: "manajemenPinjaman",
  },
  { title: "Dana Darurat", path: "/dana-darurat", permissionKey: "danaDarurat" },
  { title: "Laporan", path: "/laporan", permissionKey: "laporan" },
  {
    title: "Invoice",
    permissionKey: "invoice",
    children: [
      { title: "Pinjaman", path: "/pinjaman", permissionKey: "pinjaman" },
      { title: "Invoice", path: "/invoice", permissionKey: "invoice" },
      {
        title: "Invoice Product",
        path: "/invoice-products",
        permissionKey: "invoice",
      },
      { title: "Tos", path: "/tos", permissionKey: "invoice" },
    ],
  },
  {
    title: "Master Data",
    permissionKey: "masterData",
    children: [
      { title: "Anggota", path: "/master/anggota", permissionKey: "anggota" },
      {
        title: "Produk Simpanan",
        path: "/master/produk",
        permissionKey: "produkSimpanan",
      },
      {
        title: "Produk Pinjaman",
        path: "/master/loan-products",
        permissionKey: "produkPinjaman",
      },
    ],
  },
  {
    title: "Expenses",
    permissionKey: "expenses",
    children: [
      {
        title: "Expenses Management",
        path: "/expense/admin",
        permissionKey: "expenses",
      },
      {
        title: "Create Expenses",
        path: "/expense/new",
        permissionKey: "expenses",
      },
      { title: "Report", path: "/expense/report", permissionKey: "expenses" },
      {
        title: "Export Transactions",
        path: "/finance/export",
        permissionKey: "expenses",
      },
    ],
  },
  {
    title: "Akuntansi",
    permissionKey: "akuntansi",
    children: [
      {
        title: "Transaksi",
        path: "/akuntansi/transaksi",
        permissionKey: "akuntansi",
      },
      {
        title: "Rekonsiliasi",
        path: "/akuntansi/rekonsiliasi",
        permissionKey: "akuntansi",
      },
      {
        title: "Chart of Accounts",
        path: "/akuntansi/coa",
        permissionKey: "akuntansi",
      },
      {
        title: "Pajak Penjualan",
        path: "/akuntansi/pajak",
        permissionKey: "akuntansi",
      },
    ],
  },
  {
    title: "Reports",
    permissionKey: "reports",
    children: [
      {
        title: "Profit & Loss",
        path: "/reports/profit-loss",
        permissionKey: "reports",
      },
      {
        title: "Balance Sheet",
        path: "/reports/balance-sheet",
        permissionKey: "reports",
      },
      {
        title: "Ages Receivable",
        path: "/reports/aged-receivables",
        permissionKey: "reports",
      },
      {
        title: "Account Transactions",
        path: "/reports/account-transactions",
        permissionKey: "reports",
      },
    ],
  },
  { title: "Pengaturan", path: "/settings", permissionKey: "pengaturan" },
  // Operator management — admin only
  { title: "Operator", path: "/operator", permissionKey: "operator" },
];

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { userData: user } = useSelector((state) => state.auth);
  const location = useLocation();

  // Filter menu items by role & permissions
  const canView = (item) => {
    if (!user) return false;
    // Admin sees everything
    if (user.role === "admin") return true;
    // Operator: check permissions
    const permKey = item.permissionKey;
    if (!permKey) return true; // fallback: show if no permission key
    const perms = user.permissions || {};
    const feature = perms[permKey];
    if (permKey === "simpanan" && feature?.editCoaOnly === true) return true;
    return feature?.view === true;
  };

  const filterMenuItems = (items) => {
    return items
      .filter((item) => {
        if (item.children) return true;
        return canView(item);
      })
      .map((item) => {
        if (item.children) {
          const filtered = item.children.filter(canView);
          return { ...item, children: filtered };
        }
        return item;
      })
      .filter((item) => {
        if (item.children) return item.children.length > 0;
        return true;
      });
  };

  const filteredMenuItems = filterMenuItems(menuItems);

  const isActive = (path) => location.pathname === path;

  const isItemActive = (item) => {
    if (item.path) return isActive(item.path);
    if (item.children) return item.children.some((child) => isItemActive(child));
    return false;
  };

  const isGroupActive = (children) => children?.some((child) => isItemActive(child));

  const [openMenus, setOpenMenus] = useState(() => {
    const initial = {};
    filteredMenuItems.forEach((item) => {
      if (item.children && isGroupActive(item.children)) {
        initial[item.title] = true;
      }
    });
    return initial;
  });

  const toggleMenu = (title) => {
    setOpenMenus((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const renderMenuItems = (items) => {
    return items.map((item) => {
      const iconPaths = icons[menuIconMap[item.title]] || icons.dashboard;
      if (item.children) {
        const isOpen = openMenus[item.title] || isGroupActive(item.children);
        return (
          <div key={item.title} className="mb-1">
            <button
              onClick={() => toggleMenu(item.title)}
              aria-expanded={isOpen}
              className={`group flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors duration-150 ${
                isGroupActive(item.children)
                  ? "bg-white/10 text-white"
                  : "text-primary-200 hover:text-white hover:bg-white/[.06]"
              }`}
            >
              <div className="flex items-center min-w-0">
                <span className="mr-3 flex-shrink-0">
                  <Icon paths={iconPaths} />
                </span>
                <span className="font-medium text-sm truncate">{item.title}</span>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`flex-shrink-0 ml-2 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ease-out ${
                isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="ml-7 mt-1">{renderMenuItems(item.children)}</div>
            </div>
          </div>
        );
      }

      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setSidebarOpen && setSidebarOpen(false)}
          className={`relative flex items-center px-3 py-2 mb-1 rounded-lg transition-colors duration-150 ${
            isActive(item.path)
              ? "bg-white/10 text-white"
              : "text-primary-200 hover:text-white hover:bg-white/[.06]"
          }`}
        >
          {isActive(item.path) && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-gold-500"
            />
          )}
          <span className="mr-3 flex-shrink-0">
            <Icon paths={iconPaths} />
          </span>
          <span className="text-sm truncate">{item.title}</span>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Desktop Sidebar — brand navy #04214A */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col h-screen min-h-0 bg-primary-900 border-r border-primary-800">
        <div className="flex flex-1 min-h-0 flex-col px-4 py-5">
          <div className="flex items-center gap-3 mb-7 px-2">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <img
                src="/logo-samit.png"
                alt="Logo SAMIT"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold leading-tight text-white">
                Koperasi SAMIT
              </h1>
              <p className="text-[11px] text-primary-300">LPK Sakura Mitra</p>
            </div>
          </div>

          <nav
            className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1"
            aria-label="Menu utama"
          >
            {renderMenuItems(filteredMenuItems)}
          </nav>
        </div>

        <div className="mt-auto px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">
                {user?.name?.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-primary-300 capitalize truncate">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar — drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-primary-900 shadow-xl transform transition-transform duration-300 ease-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-white/10 bg-primary-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                  <img
                    src="/logo-samit.png"
                    alt="Logo SAMIT"
                    className="w-6 h-6 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-white leading-tight">
                    Koperasi SAMIT
                  </h1>
                  <p className="text-[11px] text-primary-300">LPK Sakura Mitra</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Tutup menu"
                className="p-2 rounded-lg text-primary-200 hover:text-white hover:bg-white/10"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <nav className="space-y-1" aria-label="Menu utama">
              {renderMenuItems(filteredMenuItems)}
            </nav>
          </div>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-semibold">
                  {user?.name?.charAt(0)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-primary-300 capitalize truncate">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Sidebar.propTypes = {
  sidebarOpen: PropTypes.bool,
  setSidebarOpen: PropTypes.func,
};

export default Sidebar;
