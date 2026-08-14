import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  toggleTransactionReviewed,
  uploadTransactions,
  getAllCategories,
  getAssetsAccounts,
  getSalesTaxes,
  getMembers,
  getReconciliation,
  toggleMatch,
  completeReconciliation,
  updateClosingBalance,
} from "../../api/accountingApi";
import { API_URL } from "../../api/config";

// ==================== UTILITY FUNCTIONS ====================
function formatNumber(num) {
  return Number(num || 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseFormattedNumber(str) {
  if (!str) return 0;
  let cleaned = String(str).replace(/\./g, "").replace(",", ".");
  cleaned = cleaned.replace(/[^\d.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

function formatAmountInputValue(raw) {
  if (!raw) return "";
  let cleaned = raw.replace(/[^\d,]/g, "");
  let parts = cleaned.split(",");
  if (parts.length > 2) cleaned = parts[0] + "," + parts.slice(1).join("");
  parts = cleaned.split(",");
  if (parts[1] && parts[1].length > 2) parts[1] = parts[1].substring(0, 2);
  if (parts[0]) {
    const intPart = parts[0].replace(/\./g, "");
    const num = parseInt(intPart, 10) || 0;
    let formatted = num.toLocaleString("id-ID");
    if (parts.length > 1) formatted += "," + parts[1];
    return formatted;
  }
  return "";
}

function getAmountFloat(displayVal) {
  if (!displayVal) return 0;
  const parts = displayVal.split(",");
  const intPart = (parts[0] || "").replace(/\./g, "");
  return parseFloat(intPart + "." + (parts[1] || "0")) || 0;
}

function parseDateFilter(value, endOfDay = false) {
  if (!value) return null;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCurrency(amount, currency = "Rp") {
  const num = parseFloat(amount) || 0;
  return `${currency} ${formatNumber(num)}`;
}

function detectInvoiceId(description) {
  if (!description) return null;
  const match = description.match(/\b([A-Z]+\d{7,})\b/);
  return match ? match[1] : null;
}

// ==================== SEARCHABLE DROPDOWN COMPONENT ====================
function SearchableDropdown({ value, onChange, options, placeholder = "Select...", grouped = false, disabled = false, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const flatOptions = useMemo(() => {
    if (!grouped) return options;
    const flat = [];
    options.forEach((group) => {
      flat.push({ type: "header", label: group.label });
      (group.items || []).forEach((item) => flat.push(item));
    });
    return flat;
  }, [options, grouped]);

  const filteredOptions = useMemo(() => {
    if (!search) return flatOptions;
    const q = search.toLowerCase();
    return flatOptions.filter((opt) => {
      if (opt.type === "header") return true;
      return (opt.label || "").toLowerCase().includes(q) || (opt.sublabel || "").toLowerCase().includes(q);
    });
  }, [flatOptions, search]);

  const selectableOptions = filteredOptions.filter((o) => o.type !== "header" && !o.disabled);

  const selectedLabel = useMemo(() => {
    const found = flatOptions.find((o) => o.type !== "header" && o.value === value);
    return found ? found.label : "";
  }, [flatOptions, value]);

  const handleKeyDown = (e) => {
    if (!isOpen) { if (e.key === "ArrowDown" || e.key === "Enter") { setIsOpen(true); e.preventDefault(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, selectableOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (highlightIdx >= 0 && selectableOptions[highlightIdx]) { onChange(selectableOptions[highlightIdx].value); setIsOpen(false); setSearch(""); } }
    else if (e.key === "Escape") { setIsOpen(false); setSearch(""); }
  };

  useEffect(() => {
    if (isOpen && listRef.current && highlightIdx >= 0) {
      const items = listRef.current.querySelectorAll("[data-selectable]");
      if (items[highlightIdx]) items[highlightIdx].scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button type="button" onClick={() => { if (!disabled) { setIsOpen(!isOpen); setHighlightIdx(-1); setTimeout(() => inputRef.current?.focus(), 50); } }}
        disabled={disabled}
        className={`w-full flex items-center justify-between border border-blue-200 rounded-md px-3 py-2.5 text-sm text-left transition
          ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white hover:border-pink-300 cursor-pointer"}
          ${isOpen ? "ring-2 ring-pink-500 border-pink-500" : ""}`}>
        <span className={selectedLabel ? "text-gray-900" : "text-gray-400"}>{selectedLabel || placeholder}</span>
        <svg className={`w-4 h-4 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-64 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input ref={inputRef} type="text" value={search} onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
              onKeyDown={handleKeyDown} placeholder="Search..." className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm outline-none focus:border-pink-400" />
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 && <div className="px-3 py-4 text-sm text-gray-400 text-center">No results found</div>}
            {filteredOptions.map((opt, idx) => {
              if (opt.type === "header") {
                return <div key={`h-${idx}`} className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50">{opt.label}</div>;
              }
              if (opt.disabled) {
                return (
                  <div key={`d-${idx}`} className={`px-3 py-1.5 text-sm cursor-default ${opt.indent === 1 ? "pl-6 text-blue-600 font-medium bg-blue-50/40" : "font-bold text-gray-700 bg-gray-50"}`}>
                    {opt.label}
                  </div>
                );
              }
              const selectIdx = selectableOptions.indexOf(opt);
              const isHighlighted = selectIdx === highlightIdx;
              const isSelected = opt.value === value;
              return (
                <div key={opt.value || `o-${idx}`} data-selectable
                  onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }}
                  className={`px-3 py-2 text-sm cursor-pointer transition
                    ${opt.indent === 2 ? "pl-10" : opt.indent === 1 ? "pl-6" : ""}
                    ${isHighlighted ? "bg-pink-50" : ""} ${isSelected ? "text-pink-700 font-semibold bg-pink-50/50" : "text-gray-700"} hover:bg-pink-50`}>
                  {opt.label}
                  {opt.sublabel && <span className="ml-1 text-xs text-gray-400">{opt.sublabel}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== CUSTOMER COMBOBOX COMPONENT ====================
function CustomerCombobox({ value, onChange, customers = [] }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedCustomer = customers.find((c) => c.id === value);

  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [customers, search]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (highlightIdx >= 0 && filtered[highlightIdx]) { onChange(filtered[highlightIdx].id); setIsOpen(false); setSearch(""); } }
    else if (e.key === "Escape") { setIsOpen(false); }
  };

  if (selectedCustomer) {
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <div className="flex-1 border border-blue-200 rounded-md px-3 py-2.5 text-sm bg-gray-50 flex items-center justify-between">
          <span className="text-gray-900">{selectedCustomer.name}</span>
          <button type="button" onClick={() => onChange("")} className="text-pink-600 hover:text-pink-800 text-xs font-medium ml-2">Clear</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input ref={inputRef} type="text" value={search}
        onChange={(e) => { setSearch(e.target.value); setIsOpen(true); setHighlightIdx(-1); }}
        onFocus={() => { setIsOpen(true); setHighlightIdx(-1); }}
        onKeyDown={handleKeyDown}
        placeholder="Search or select customer..."
        className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500" />
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
          {filtered.map((c, idx) => (
            <div key={c.id}
              onClick={() => { onChange(c.id); setIsOpen(false); setSearch(""); }}
              className={`px-3 py-2 cursor-pointer transition ${idx === highlightIdx ? "bg-pink-50" : "hover:bg-gray-50"}`}>
              <div className="text-sm font-medium text-gray-900">{c.name}</div>
              {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== MAIN TRANSACTIONS COMPONENT ====================
export default function Transactions() {
  // ===== Core Data State =====
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionPagination, setTransactionPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 100,
  });
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const isLegacyTransactionsPath = location.pathname === "/transactions" || location.pathname === "/transactions/upload";
  const [assetsAccounts, setAssetsAccounts] = useState({});
  const [categories, setCategories] = useState([]);
  const [salesTaxes, setSalesTaxes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customVendors, setCustomVendors] = useState([]);

  const reportQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const query = {};
    [
      "filter_category",
      "filter_category_id",
      "filter_category_type",
      "filter_date_from",
      "filter_date_to",
    ].forEach((key) => {
      const value = params.get(key);
      if (value) query[key] = value;
    });
    return query;
  }, [location.search]);
  const hasReportCategoryFilter = Boolean(reportQuery.filter_category_id || reportQuery.filter_category);

  // ===== Dropdown Visibility =====
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const accountDropdownRef = useRef(null);
  const addDropdownRef = useRef(null);
  const moreDropdownRef = useRef(null);
  const filterPanelRef = useRef(null);
  const sortPanelRef = useRef(null);

  // ===== Search / Filter / Sort State =====
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [filters, setFilters] = useState({
    type: "", description: "", account: "", category: "", reviewed: "", dateFrom: "", dateTo: "", amountMin: "", amountMax: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    type: "", description: "", account: "", category: "", reviewed: "", dateFrom: "", dateTo: "", amountMin: "", amountMax: "",
  });
  const [reportHighlightId, setReportHighlightId] = useState("");
  const highlightedRowRef = useRef(null);

  // ===== Reconciliation State =====
  const [reconMode, setReconMode] = useState(false);
  const [activeRecon, setActiveRecon] = useState(null);
  const [reconTransactions, setReconTransactions] = useState([]);
  const [closingBalanceDisplay, setClosingBalanceDisplay] = useState("");
  const [reconStatus, setReconStatus] = useState("Not reconciled");

  // ===== Modal State =====
  const [showModal, setShowModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [form, setForm] = useState({
    transactionDate: new Date().toISOString().split("T")[0],
    description: "", accountId: "", transactionType: "Deposit",
    amountDisplay: "", amount: 0, categoryId: "", categoryType: "", notes: "", senderName: "",
    includeSalesTax: false, salesTaxId: "", vendorId: "", customerId: "",
  });

  // ===== Split Transaction State =====
  const [splits, setSplits] = useState([]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  // ===== Receipt State =====
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptDragActive, setReceiptDragActive] = useState(false);

  // ===== Upload Modal =====
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({ accountId: "", csvText: "" });

  // ===== Table State =====
  const [openRowDropdown, setOpenRowDropdown] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const rowDropdownRef = useRef(null);

  const syncLegacyAccountQuery = useCallback((accountId) => {
    if (!isLegacyTransactionsPath) return;
    const params = new URLSearchParams(location.search);
    if (accountId) params.set("account", accountId);
    else params.delete("account");
    setSearchParams(params, { replace: true });
  }, [isLegacyTransactionsPath, location.search, setSearchParams]);

  const handleSelectAccount = useCallback((accountId) => {
    setSelectedAccountId(accountId || "");
    setShowAccountDropdown(false);
    setReconMode(false);
    syncLegacyAccountQuery(accountId || "");
  }, [syncLegacyAccountQuery]);

  useEffect(() => {
    if (!isLegacyTransactionsPath) return;
    const params = new URLSearchParams(location.search);
    const accountFromQuery = params.get("account") || "";
    setSelectedAccountId((prev) => (prev === accountFromQuery ? prev : accountFromQuery));
  }, [isLegacyTransactionsPath, location.search]);

  useEffect(() => {
    if (location.pathname === "/transactions/upload") {
      setShowUploadModal(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filterByAccount = params.get("filter_account");
    const filterByCategory = params.get("filter_category");
    const filterDateFrom = params.get("filter_date_from");
    const filterDateTo = params.get("filter_date_to");
    const highlightId = params.get("highlight");

    setReportHighlightId(highlightId || "");

    if (!filterByAccount && !filterByCategory && !filterDateFrom && !filterDateTo) return;

    setFilters((prev) => ({
      ...prev,
      account: filterByAccount || prev.account,
      category: filterByCategory || prev.category,
      dateFrom: filterDateFrom || prev.dateFrom,
      dateTo: filterDateTo || prev.dateTo,
    }));

    setAppliedFilters((prev) => ({
      ...prev,
      account: filterByAccount || prev.account,
      category: filterByCategory || prev.category,
      dateFrom: filterDateFrom || prev.dateFrom,
      dateTo: filterDateTo || prev.dateTo,
    }));
  }, [location.search]);

  useEffect(() => {
    setTransactionPage(1);
  }, [location.search, selectedAccountId]);

  // ==================== DATA FETCHING ====================
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const promises = [
        getTransactions(selectedAccountId || null, {
          ...reportQuery,
          page: transactionPage,
          limit: 100,
        }),
        getAssetsAccounts(),
        getAllCategories(),
        getSalesTaxes("active"),
        getMembers(),
      ];
      if (selectedAccountId) {
        promises.push(getReconciliation(selectedAccountId));
      }
      const results = await Promise.all(promises);
      const [txnRes, assetsRes, catRes, taxRes, membersRes, reconRes] = results;
      if (txnRes.success) {
        setTransactions(txnRes.data || []);
        setTransactionPagination(txnRes.pagination || {
          currentPage: transactionPage,
          totalPages: 1,
          totalItems: (txnRes.data || []).length,
          itemsPerPage: 100,
        });
      }
      if (assetsRes.success) setAssetsAccounts(assetsRes.data || {});
      if (catRes.success) setCategories(catRes.data || []);
      if (taxRes.success) setSalesTaxes(taxRes.data || []);
      if (membersRes.success) {
        const mappedMembers = (membersRes.data || []).map((member) => ({
          id: member._id,
          name: member.name || "-",
          email: member.email || member.user?.email || "",
          uuid: member.uuid || "",
        }));
        setCustomers(mappedMembers);
      }
      if (selectedAccountId && reconRes) {
        if (reconRes.success && reconRes.data) {
          const active = reconRes.data.find?.((r) => r.status === "in_progress") || reconRes.data;
          if (active && active.status === "in_progress") {
            setActiveRecon(active);
            setReconStatus(`Unfinished for period ending ${new Date(active.statementEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
            setClosingBalanceDisplay(formatNumber(active.closingBalance || 0));
          } else {
            setActiveRecon(null);
            const last = Array.isArray(reconRes.data) ? reconRes.data.find?.((r) => r.status === "completed") : null;
            if (last) {
              setReconStatus(`Reconciled up to ${new Date(last.statementEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
            } else {
              setReconStatus("Not reconciled");
            }
          }
        } else {
          setActiveRecon(null);
          setReconStatus("Not reconciled");
        }
      } else {
        setActiveRecon(null);
        setReconStatus("Not reconciled");
      }
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [reportQuery, selectedAccountId, transactionPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ==================== OUTSIDE CLICK HANDLERS ====================
  useEffect(() => {
    const handleClick = (e) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) setShowAccountDropdown(false);
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target)) setShowAddDropdown(false);
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target)) setShowMoreDropdown(false);
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target)) setShowFilterPanel(false);
      if (sortPanelRef.current && !sortPanelRef.current.contains(e.target)) setShowSortPanel(false);
      if (rowDropdownRef.current && !rowDropdownRef.current.contains(e.target)) setOpenRowDropdown(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ==================== DERIVED DATA ====================
  const allAssetsAccounts = useMemo(() => Object.values(assetsAccounts).flat(), [assetsAccounts]);
  const selectedAccount = allAssetsAccounts.find((a) => a._id === selectedAccountId);
  const currencyPrefix = selectedAccount?.currency || "Rp";

  const totalBalance = useMemo(() => {
    return allAssetsAccounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  }, [allAssetsAccounts]);

  // Category options for SearchableDropdown
  const categoryDropdownOptions = useMemo(() => {
    const opts = [{ value: "", label: "Uncategorized Income" }];
    categories.forEach((cat) => {
      if (cat.type === "master") {
        opts.push({ label: cat.name, disabled: true, indent: 0 });
      } else if (cat.type === "submenu") {
        opts.push({ label: cat.name, disabled: true, indent: 1 });
      } else {
        opts.push({ value: `${cat.type}|${cat.id}`, label: cat.name, indent: 2 });
      }
    });
    return opts;
  }, [categories]);

  // Account options for SearchableDropdown
  const accountDropdownOptions = useMemo(() => {
    const groups = [];
    Object.entries(assetsAccounts).forEach(([groupName, accounts]) => {
      groups.push({
        label: groupName,
        items: accounts.map((a) => ({
          value: a._id,
          label: `${a.accountName} (${a.accountCode})`,
          sublabel: `${a.currency || "Rp"} ${formatNumber(a.balance)}`,
        })),
      });
    });
    return groups;
  }, [assetsAccounts]);

  const vendorOptions = useMemo(() => {
    const names = new Set(
      customVendors
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    );

    transactions.forEach((txn) => {
      const name = typeof txn.vendorId === "string" ? txn.vendorId.trim() : "";
      if (name) names.add(name);
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transactions, customVendors]);

  // Filter account options for filter dropdown
  const filterAccountOptions = useMemo(() => {
    const names = new Set();
    transactions.forEach((t) => { if (t.accountId?.accountName) names.add(t.accountId.accountName); });
    return [{ value: "", label: "All Accounts" }, ...Array.from(names).sort().map((n) => ({ value: n, label: n }))];
  }, [transactions]);

  // Filter category options for filter dropdown
  const filterCategoryOptions = useMemo(() => {
    const names = new Set();
    transactions.forEach((t) => { if (t.categoryName) names.add(t.categoryName); });
    return [{ value: "", label: "All Categories" }, ...Array.from(names).sort().map((n) => ({ value: n, label: n }))];
  }, [transactions]);

  // ==================== FILTER & SORT LOGIC ====================
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.type) count++;
    if (appliedFilters.description) count++;
    if (appliedFilters.account) count++;
    if (appliedFilters.category) count++;
    if (appliedFilters.reviewed) count++;
    if (appliedFilters.dateFrom || appliedFilters.dateTo) count++;
    if (appliedFilters.amountMin || appliedFilters.amountMax) count++;
    return count;
  }, [appliedFilters]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Apply filters
    const f = appliedFilters;
    if (f.type) result = result.filter((t) => t.transactionType === f.type);
    if (f.description) {
      const q = f.description.toLowerCase();
      result = result.filter((t) => (t.description || "").toLowerCase().includes(q));
    }
    if (f.account) {
      const q = f.account.toLowerCase();
      result = result.filter((t) => (t.accountId?.accountName || "").toLowerCase().includes(q));
    }
    if (f.category) {
      const q = f.category.toLowerCase();
      result = result.filter((t) => {
        if ((t.categoryName || "").toLowerCase().includes(q)) return true;
        if (t.isSplit && t.splitCategories) {
          return t.splitCategories.some((s) => (s.categoryName || "").toLowerCase().includes(q));
        }
        return false;
      });
    }
    if (f.reviewed === "1") result = result.filter((t) => t.reviewed);
    else if (f.reviewed === "0") result = result.filter((t) => !t.reviewed);
    if (f.dateFrom) {
      const from = parseDateFilter(f.dateFrom);
      if (from) result = result.filter((t) => new Date(t.transactionDate) >= from);
    }
    if (f.dateTo) {
      const to = parseDateFilter(f.dateTo, true);
      if (to) result = result.filter((t) => new Date(t.transactionDate) <= to);
    }
    if (f.amountMin) {
      const min = parseFloat(f.amountMin);
      result = result.filter((t) => Math.abs(t.amount || 0) >= min);
    }
    if (f.amountMax) {
      const max = parseFloat(f.amountMax);
      result = result.filter((t) => Math.abs(t.amount || 0) <= max);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        (t.description || "").toLowerCase().includes(q) ||
        (t.senderName || "").toLowerCase().includes(q) ||
        (t.accountId?.accountName || "").toLowerCase().includes(q) ||
        (t.categoryName || "").toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "date_asc": return new Date(a.transactionDate) - new Date(b.transactionDate);
        case "date_desc": return new Date(b.transactionDate) - new Date(a.transactionDate);
        case "amount_asc": return (a.amount || 0) - (b.amount || 0);
        case "amount_desc": return (b.amount || 0) - (a.amount || 0);
        case "desc_asc": return (a.description || "").localeCompare(b.description || "");
        case "desc_desc": return (b.description || "").localeCompare(a.description || "");
        case "reviewed_desc": return (b.reviewed ? 1 : 0) - (a.reviewed ? 1 : 0);
        case "reviewed_asc": return (a.reviewed ? 1 : 0) - (b.reviewed ? 1 : 0);
        default: return 0;
      }
    });

    return result;
  }, [transactions, appliedFilters, searchQuery, sortBy]);

  useEffect(() => {
    if (!reportHighlightId) return;
    const hasHighlightRow = filteredTransactions.some((txn) => String(txn._id) === String(reportHighlightId));
    if (!hasHighlightRow) return;
    const timer = setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [filteredTransactions, reportHighlightId]);

  // ==================== FILTER ACTIONS ====================
  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setShowFilterPanel(false);
  };

  const clearFilters = () => {
    const empty = { type: "", description: "", account: "", category: "", reviewed: "", dateFrom: "", dateTo: "", amountMin: "", amountMax: "" };
    setFilters(empty);
    setAppliedFilters(empty);

    const params = new URLSearchParams(location.search);
    [
      "filter_account",
      "filter_category",
      "filter_category_id",
      "filter_category_type",
      "filter_date_from",
      "filter_date_to",
    ].forEach((key) => params.delete(key));
    setSearchParams(params, { replace: true });
  };

  // ==================== SORT OPTIONS ====================
  const sortOptions = [
    { key: "date_desc", label: "Date", direction: "Newest first", icon: "↓" },
    { key: "date_asc", label: "Date", direction: "Oldest first", icon: "↑" },
    { key: "amount_desc", label: "Amount", direction: "Highest first", icon: "↓" },
    { key: "amount_asc", label: "Amount", direction: "Lowest first", icon: "↑" },
    { key: "desc_asc", label: "Description", direction: "A-Z", icon: "↑" },
    { key: "desc_desc", label: "Description", direction: "Z-A", icon: "↓" },
    { key: "reviewed_desc", label: "Review Status", direction: "Reviewed first", icon: "✓" },
    { key: "reviewed_asc", label: "Review Status", direction: "Not reviewed first", icon: "○" },
  ];

  // ==================== MODAL HANDLERS ====================
  const openCreateModal = (type = "Deposit") => {
    setEditingTxn(null);
    setForm({
      transactionDate: new Date().toISOString().split("T")[0],
      description: "", accountId: selectedAccountId || "", transactionType: type,
      amountDisplay: "", amount: 0, categoryId: "", categoryType: "", notes: "", senderName: "",
      includeSalesTax: false, salesTaxId: "", vendorId: "", customerId: "",
    });
    setSplits([]);
    setIsSplitMode(false);
    setReceiptFile(null);
    setShowAddDropdown(false);
    setShowModal(true);
  };

  const openEditModal = (txn) => {
    setEditingTxn(txn);
    const amt = parseFloat(txn.amount) || 0;
    setForm({
      transactionDate: txn.transactionDate ? new Date(txn.transactionDate).toISOString().split("T")[0] : "",
      description: txn.description || "",
      accountId: txn.accountId?._id || txn.accountId || "",
      transactionType: txn.transactionType || "Deposit",
      amountDisplay: formatNumber(amt),
      amount: amt,
      categoryId: txn.categoryId || "",
      categoryType: txn.categoryType || "",
      notes: txn.notes || "",
      senderName: txn.senderName || "",
      includeSalesTax: !!txn.salesTaxId,
      salesTaxId: txn.salesTaxId || "",
      vendorId: txn.vendorId || "",
      customerId: txn.customerId?._id || txn.customerId || "",
    });
    if (txn.isSplit && txn.splitCategories) {
      setSplits(txn.splitCategories.map((s) => ({
        amount: parseFloat(s.amount) || 0,
        amountDisplay: formatNumber(parseFloat(s.amount) || 0),
        categoryId: s.categoryId || "", categoryType: s.categoryType || "account",
      })));
      setIsSplitMode(true);
    } else {
      setSplits([]);
      setIsSplitMode(false);
    }
    setReceiptFile(null);
    setOpenRowDropdown(null);
    setShowModal(true);
  };

  const handleAddVendor = () => {
    const value = window.prompt("Masukkan nama vendor:");
    if (value === null) return;

    const normalized = value.trim();
    if (!normalized) {
      toast.error("Nama vendor tidak boleh kosong");
      return;
    }

    setCustomVendors((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setForm((prev) => ({ ...prev, vendorId: normalized }));
  };

  // ==================== FORM SUBMISSION ====================
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate split amounts
    if (isSplitMode && splits.length > 0) {
      const totalAmt = form.amount;
      const usedAmt = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      const remaining = totalAmt - usedAmt;
      if (Math.abs(remaining) > 0.01) {
        toast.error(`Split amounts don't balance. Remaining: ${formatCurrency(remaining, currencyPrefix)}`);
        return;
      }
    }
    try {
      const payload = {
        transactionDate: form.transactionDate,
        description: form.description,
        accountId: form.accountId,
        transactionType: form.transactionType,
        amount: form.amount,
        categoryId: form.categoryId,
        categoryType: form.categoryType,
        notes: form.notes,
        senderName: form.senderName,
      };
      if (form.includeSalesTax && form.salesTaxId) payload.salesTaxId = form.salesTaxId;
      if (form.vendorId) payload.vendorId = form.vendorId;
      if (form.customerId) payload.customerId = form.customerId;
      if (isSplitMode && splits.length > 0) {
        payload.splits = splits.map((s) => ({
          amount: parseFloat(s.amount) || 0,
          categoryId: s.categoryId,
          categoryType: s.categoryType,
        }));
      }

      // Use FormData if receipt file
      let data = payload;
      if (receiptFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (k === "splits") fd.append(k, JSON.stringify(v));
          else if (v !== undefined && v !== null) fd.append(k, v);
        });
        fd.append("receiptFile", receiptFile);
        data = fd;
      }

      if (editingTxn) {
        const res = await updateTransaction(editingTxn._id, data);
        if (res.success) toast.success("Transaction updated");
      } else {
        const res = await createTransaction(data);
        if (res.success) toast.success("Transaction created");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    }
  };

  // ==================== DELETE / REVIEW HANDLERS ====================
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted");
      setOpenRowDropdown(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const handleToggleReviewed = async (id) => {
    try {
      await toggleTransactionReviewed(id);
      fetchData();
    } catch {
      toast.error("Failed to update status");
    }
  };

  // ==================== SPLIT TRANSACTION LOGIC ====================
  const initSplit = () => {
    if (form.amount <= 0) {
      toast.error("Please enter an amount first before splitting");
      return;
    }
    setIsSplitMode(true);
    if (splits.length < 2) {
      setSplits([
        { amount: 0, amountDisplay: "", categoryId: "", categoryType: "account" },
        { amount: 0, amountDisplay: "", categoryId: "", categoryType: "account" },
      ]);
    }
  };

  const cancelSplit = () => {
    setIsSplitMode(false);
    setSplits([]);
  };

  const addSplitItem = () => {
    setSplits([...splits, { amount: 0, amountDisplay: "", categoryId: "", categoryType: "account" }]);
  };

  const removeSplitItem = (idx) => {
    const updated = splits.filter((_, i) => i !== idx);
    if (updated.length < 2) {
      updated.push({ amount: 0, amountDisplay: "", categoryId: "", categoryType: "account" });
    }
    setSplits(updated);
  };

  const updateSplitAmount = (idx, displayVal) => {
    const formatted = formatAmountInputValue(displayVal);
    const floatVal = getAmountFloat(formatted);
    const updated = [...splits];
    updated[idx] = { ...updated[idx], amountDisplay: formatted, amount: floatVal };
    setSplits(updated);
  };

  const updateSplitCategory = (idx, val) => {
    const [type, id] = (val || "|").split("|");
    const updated = [...splits];
    updated[idx] = { ...updated[idx], categoryType: type || "account", categoryId: id || "" };
    setSplits(updated);
  };

  const splitUsedAmount = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const splitRemaining = (form.amount || 0) - splitUsedAmount;

  // ==================== RECEIPT HANDLERS ====================
  const handleReceiptSelect = (file) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { toast.error("File size must be 6MB or smaller"); return; }
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/tiff", "image/bmp", "application/pdf", "image/heic"];
    if (!allowed.includes(file.type)) { toast.error("Invalid file type. Allowed: JPG, PNG, GIF, TIFF, BMP, PDF, HEIC"); return; }
    setReceiptFile(file);
  };

  const handleReceiptDrop = (e) => {
    e.preventDefault();
    setReceiptDragActive(false);
    if (e.dataTransfer.files.length > 0) handleReceiptSelect(e.dataTransfer.files[0]);
  };

  // ==================== UPLOAD HANDLER ====================
  const handleUpload = async () => {
    try {
      const lines = uploadData.csvText.trim().split("\n");
      if (lines.length < 2) return toast.error("CSV must have at least 2 rows (header + data)");
      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const obj = {};
        header.forEach((h, i) => { obj[h] = vals[i] || ""; });
        return obj;
      });
      const res = await uploadTransactions({ accountId: uploadData.accountId, transactions: rows });
      if (res.success) {
        toast.success(res.message);
        setShowUploadModal(false);
        setUploadData({ accountId: "", csvText: "" });
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    }
  };

  // ==================== RECONCILIATION HANDLERS ====================
  const handleReconToggle = () => {
    if (!selectedAccountId) {
      toast.error("Please select an account first");
      return;
    }
    if (!reconMode) {
      if (activeRecon) {
        setReconMode(true);
      } else {
        // Redirect to reconciliation page to start one
        window.location.href = `/akuntansi/rekonsiliasi?accountId=${selectedAccountId}`;
      }
    } else {
      setReconMode(false);
    }
  };

  const handleToggleMatch = async (txnId) => {
    if (!activeRecon) return;
    try {
      const res = await toggleMatch({ reconciliationId: activeRecon._id, transactionId: txnId });
      if (res.success) {
        fetchData();
      }
    } catch {
      toast.error("Failed to toggle match");
    }
  };

  const handleEndReconciliation = async () => {
    if (!activeRecon) return;
    try {
      const res = await completeReconciliation(activeRecon._id);
      if (res.success) {
        toast.success("Your books are now reconciled!");
        setReconMode(false);
        fetchData();
      } else {
        toast.error(res.message || "Failed to complete reconciliation");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to complete reconciliation");
    }
  };

  const handleClosingBalanceChange = async (val) => {
    setClosingBalanceDisplay(val);
    if (!activeRecon) return;
    const numVal = parseFormattedNumber(val);
    try {
      await updateClosingBalance({ reconciliationId: activeRecon._id, closingBalance: numVal });
      fetchData();
    } catch {
      toast.error("Failed to update closing balance");
    }
  };

  // ==================== TABLE SELECTION ====================
  const toggleSelectAll = () => {
    if (selectedRows.size === filteredTransactions.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filteredTransactions.map((t) => t._id)));
  };

  const toggleRowSelect = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRows(next);
  };

  // ==================== AMOUNT INPUT HANDLER ====================
  const handleAmountDisplayChange = (val) => {
    const formatted = formatAmountInputValue(val);
    const floatVal = getAmountFloat(formatted);
    setForm((prev) => ({ ...prev, amountDisplay: formatted, amount: floatVal }));
  };

  // ==================== RENDER ====================
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="flex items-center gap-2">
          {/* Add Transaction Dropdown */}
          <div className="relative" ref={addDropdownRef}>
            <button onClick={() => { setShowAddDropdown(!showAddDropdown); setShowMoreDropdown(false); }}
              className="px-5 py-2.5 bg-pink-600 text-white rounded-full hover:bg-pink-700 text-sm font-medium transition shadow-sm flex items-center gap-1.5">
              Add transaction
              <svg className={`w-4 h-4 transition ${showAddDropdown ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showAddDropdown && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-30 min-w-[200px]">
                <button onClick={() => openCreateModal("Deposit")}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-pink-50 transition flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add Deposit
                </button>
                <button onClick={() => openCreateModal("Withdrawal")}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-pink-50 transition flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                  </svg>
                  Add Withdrawal
                </button>
                <button onClick={() => { setShowAddDropdown(false); alert('Scan receipt feature coming soon'); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-pink-50 transition flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Scan Receipt
                </button>
              </div>
            )}
          </div>

          {/* More Dropdown */}
          <div className="relative" ref={moreDropdownRef}>
            <button onClick={() => { setShowMoreDropdown(!showMoreDropdown); setShowAddDropdown(false); }}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50 text-sm font-medium transition flex items-center gap-1.5">
              More
              <svg className={`w-4 h-4 transition ${showMoreDropdown ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showMoreDropdown && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-30 min-w-[200px]">
                <button onClick={() => { setShowUploadModal(true); setShowMoreDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-pink-50 transition flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload Transactions
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== ACCOUNT DROPDOWN + RECON TOGGLE ==================== */}
      <div className="flex flex-col sm:flex-row gap-4 mb-5">
        {/* Account Dropdown */}
        <div className="relative flex-1" ref={accountDropdownRef}>
          <button onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className="w-full sm:w-96 flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3.5 shadow-sm hover:border-pink-300 transition text-left">
            <div className="flex items-center gap-3">
              {selectedAccount && (
                <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {selectedAccount ? selectedAccount.accountName : "All accounts"}
                </div>
                {selectedAccount && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {selectedAccount.currency || "Rp"} {formatNumber(selectedAccount.balance)}
                  </div>
                )}
              </div>
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition ${showAccountDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAccountDropdown && (
            <div className="absolute top-full left-0 mt-2 w-full sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-96 overflow-y-auto">
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-400">All balances as of today&apos;s date</p>
              </div>
              {/* Account groups */}
              {Object.entries(assetsAccounts).map(([group, accounts]) => (
                <div key={group}>
                  <div className="px-5 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{group}</div>
                  {accounts.map((a) => (
                    <button key={a._id}
                      onClick={() => handleSelectAccount(a._id)}
                      className={`w-full text-left px-5 py-2.5 text-sm hover:bg-pink-50 transition flex items-center gap-3 ${
                        selectedAccountId === a._id ? "text-pink-700 font-semibold bg-pink-50/50" : "text-gray-700"
                      }`}>
                      <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v6m0 6v6" />
                      </svg>
                      <div className="flex-1 flex justify-between items-center">
                        <span>{a.accountName}</span>
                        <span className="text-xs text-gray-400 font-mono font-semibold">{a.currency || "Rp"} {formatNumber(a.balance)}</span>
                      </div>
                    </button>
                  ))}
                  <div className="border-b border-gray-100 mx-3" />
                </div>
              ))}
              {/* All accounts summary */}
              <button onClick={() => handleSelectAccount("")}
                className={`w-full text-left px-5 py-3 text-sm hover:bg-pink-50 transition flex justify-between ${
                  !selectedAccountId ? "text-pink-700 font-semibold bg-pink-50/50" : "text-gray-700"
                }`}>
                <span className="font-bold">All accounts</span>
                <span className="text-xs text-gray-500 font-mono font-bold">{formatNumber(totalBalance)}</span>
              </button>
            </div>
          )}
        </div>

        {/* Reconciliation Toggle Box */}
        <div className={`flex items-center gap-3 bg-white border rounded-xl px-5 py-3 shadow-sm transition ${
          reconMode ? "border-pink-300 bg-pink-50/30" : "border-gray-200"
        }`}>
          <svg className="w-[18px] h-[18px] text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-700">Reconciliation</span>
            <span className="text-[11px] text-gray-400 truncate">{reconStatus}</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-2">
            <input type="checkbox" checked={reconMode} onChange={handleReconToggle} disabled={!selectedAccountId}
              className="sr-only peer" />
            <div className={`w-10 h-5 rounded-full transition-colors peer-checked:bg-pink-600 ${
              !selectedAccountId ? "bg-gray-200 cursor-not-allowed" : "bg-gray-300"
            } after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-5 after:shadow`} />
          </label>
        </div>
      </div>

      {/* ==================== RECONCILIATION MODE - BACK LINK + STATS BAR ==================== */}
      {reconMode && activeRecon && (
        <>
          <a href={`/akuntansi/rekonsiliasi?accountId=${selectedAccountId}`}
            className="inline-flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-800 mb-4 font-medium">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to reconciliation history
          </a>

          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap items-center gap-4 shadow-sm">
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-medium">Unmatched transactions</span>
              <span className="text-lg font-bold text-gray-900">
                {filteredTransactions.filter((t) => !t.isMatched).length}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-medium">Closing balance</span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{currencyPrefix}</span>
                <input type="text" value={closingBalanceDisplay}
                  onChange={(e) => handleClosingBalanceChange(e.target.value)}
                  className="w-32 text-lg font-bold text-gray-900 border-b border-dashed border-gray-300 outline-none focus:border-pink-500 bg-transparent" />
                <span className="text-gray-400 text-sm">✏️</span>
              </div>
              <span className="text-[11px] text-gray-400">
                Reconciling up to {new Date(activeRecon.statementEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="text-xl font-bold text-gray-300">=</div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-medium">Matched balance</span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(activeRecon.matchedBalance || 0, currencyPrefix)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-medium">Difference</span>
              <span className={`text-lg font-bold ${
                Math.abs(activeRecon.difference || 0) < 0.01 ? "text-emerald-600" : "text-red-600"
              }`}>
                {formatCurrency(activeRecon.difference || 0, currencyPrefix)}
              </span>
            </div>
            <button onClick={handleEndReconciliation}
              disabled={Math.abs(activeRecon.difference || 0) > 0.01}
              className="ml-auto px-5 py-2.5 bg-pink-600 text-white rounded-full text-sm font-medium hover:bg-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              End reconciliation
            </button>
          </div>
        </>
      )}

      {/* ==================== FILTER / SORT / SEARCH BAR ==================== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Button */}
          <div className="relative" ref={filterPanelRef}>
            <button onClick={() => { setShowFilterPanel(!showFilterPanel); setShowSortPanel(false); }}
              className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h18M10 11l2 2 2-2M7 11l2 2 2-2M3 20h18" />
              </svg>
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 bg-pink-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Panel */}
            {showFilterPanel && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-40 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400">
                    <option value="">All Types</option>
                    <option value="Deposit">Deposit</option>
                    <option value="Withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input type="text" value={filters.description} onChange={(e) => setFilters({ ...filters, description: e.target.value })}
                    placeholder="Filter by description..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
                  <SearchableDropdown value={filters.account} onChange={(v) => setFilters({ ...filters, account: v })}
                    options={filterAccountOptions} placeholder="All Accounts" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <SearchableDropdown value={filters.category} onChange={(v) => setFilters({ ...filters, category: v })}
                    options={filterCategoryOptions} placeholder="All Categories" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Review Status</label>
                  <select value={filters.reviewed} onChange={(e) => setFilters({ ...filters, reviewed: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400">
                    <option value="">All Transactions</option>
                    <option value="1">Reviewed</option>
                    <option value="0">Not Reviewed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
                  <div className="flex items-center gap-2">
                    <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-pink-400" />
                    <span className="text-xs text-gray-400">to</span>
                    <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-pink-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount Range</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={filters.amountMin} onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })}
                      placeholder="Min" step="0.01" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-pink-400" />
                    <span className="text-xs text-gray-400">to</span>
                    <input type="number" value={filters.amountMax} onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })}
                      placeholder="Max" step="0.01" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-pink-400" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button onClick={applyFilters}
                    className="flex-1 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 transition">
                    Apply Filter
                  </button>
                  <button onClick={clearFilters}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sort Button */}
          <div className="relative" ref={sortPanelRef}>
            <button onClick={() => { setShowSortPanel(!showSortPanel); setShowFilterPanel(false); }}
              className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6-6 6 6M18 15l-6 6-6-6" />
              </svg>
              Sort
            </button>

            {showSortPanel && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-40 py-1">
                {sortOptions.map((opt) => (
                  <button key={opt.key} onClick={() => { setSortBy(opt.key); setShowSortPanel(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition hover:bg-pink-50 ${
                      sortBy === opt.key ? "text-pink-700 font-semibold bg-pink-50/50" : "text-gray-700"
                    }`}>
                    <span>{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.icon} {opt.direction}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions"
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none" />
        </div>
      </div>

      {/* ==================== TRANSACTIONS TABLE ==================== */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-[3px] border-pink-200 border-t-pink-600 rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-gray-500">No transactions yet.</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-gray-500">No transactions match your filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-[0_0_10px_rgba(0,0,0,0.06)] border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selectedRows.size === filteredTransactions.length && filteredTransactions.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  {reconMode && activeRecon ? (
                    <>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deposit</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Withdrawal</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Match</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Running Balance</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((txn, txnIdx) => {
                  const isDeposit = txn.transactionType === "Deposit";
                  const invoiceId = detectInvoiceId(txn.description);
                  const isJournalEntry = txn.entryType === "journal_entry";
                  const isReportHighlighted = reportHighlightId && String(txn._id) === String(reportHighlightId);
                  const visibleSplitCategories = hasReportCategoryFilter
                    ? (txn.drilldownSplits || [])
                    : (txn.splitCategories || []);
                  const displayAmount = hasReportCategoryFilter && Number.isFinite(Number(txn.drilldownAmount))
                    ? txn.drilldownAmount
                    : txn.amount;
                  const displaySplitNames = visibleSplitCategories
                    .map((split) => split.categoryName)
                    .filter(Boolean)
                    .join(", ");

                  if (reconMode && activeRecon) {
                    // ===== RECONCILIATION MODE ROW =====
                    return (
                      <tr
                        key={txn._id}
                        ref={isReportHighlighted ? highlightedRowRef : null}
                        className={`border-b border-gray-50 transition ${
                          txn.isMatched ? "bg-pink-50/40 shadow-[inset_3px_0_0_theme(colors.pink.500)]" : "hover:bg-gray-50"
                        } ${isReportHighlighted ? "bg-amber-50 shadow-[inset_3px_0_0_theme(colors.amber.500)]" : ""}`}>
                        <td className="px-4 py-3.5">
                          <input type="checkbox" checked={!!txn.isMatched} onChange={() => handleToggleMatch(txn._id)}
                            className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                        </td>
                        <td className="px-3 py-3.5 text-gray-600 whitespace-nowrap text-xs font-semibold">
                          {new Date(txn.transactionDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-3 py-3.5 text-gray-900 font-medium max-w-xs truncate">{txn.description || "-"}</td>
                        <td className="px-3 py-3.5 text-right font-mono text-sm text-emerald-600">
                          {isDeposit ? formatCurrency(txn.amount, txn.accountId?.currency) : ""}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-sm text-red-600">
                          {!isDeposit ? formatCurrency(txn.amount, txn.accountId?.currency) : ""}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono text-sm text-gray-700">
                          {/* Running balance - simplified */}
                          -
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <button onClick={() => handleToggleMatch(txn._id)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition ${
                              txn.isMatched
                                ? "border-pink-600 bg-pink-600 text-white"
                                : "border-gray-300 text-transparent hover:border-pink-400"
                            }`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // ===== NORMAL MODE ROW =====
                  return (
                    <tr
                      key={txn._id}
                      ref={isReportHighlighted ? highlightedRowRef : null}
                      className={`border-b border-gray-50 hover:bg-pink-50/20 transition ${
                        txn.isReconciled ? "shadow-[inset_3px_0_0_theme(colors.pink.500)] bg-pink-50/30" : ""
                      } ${isReportHighlighted ? "bg-amber-50 shadow-[inset_3px_0_0_theme(colors.amber.500)]" : ""}`}>
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={selectedRows.has(txn._id)}
                          onChange={() => toggleRowSelect(txn._id)}
                          className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                      </td>
                      <td className="px-3 py-3.5 text-gray-700 whitespace-nowrap text-xs">
                        <strong>{new Date(txn.transactionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong>
                      </td>
                      <td className="px-3 py-3.5 max-w-xs" style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
                        {txn.isReconciled && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-600 bg-pink-100 px-1.5 py-0.5 rounded mr-2" title="Reconciled">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3v2M7 6h10M6 8h12M7 20h10M12 21v-2M7 9v3a5 5 0 0010 0V9" />
                            </svg>
                            Reconciled
                          </span>
                        )}
                        {invoiceId ? (
                          <a href={`/invoice/${invoiceId}`} className="text-gray-900 font-semibold hover:text-pink-600 transition" title={`Go to Invoice ${invoiceId}`}>
                            {txn.description}
                          </a>
                        ) : (
                          <span className="text-gray-900 font-semibold">{txn.description || "-"}</span>
                        )}
                        {txn.senderName && <div className="text-[11px] text-gray-400 mt-0.5">{txn.senderName}</div>}
                      </td>
                      <td className="px-3 py-3.5 text-gray-500 text-xs">{txn.accountId?.accountName || "-"}</td>
                      <td className="px-3 py-3.5 text-gray-500 text-xs">
                        {txn.isSplit ? (
                          <span className="text-purple-600 font-semibold cursor-help"
                            title={displaySplitNames || "Selected split category"}>
                            {hasReportCategoryFilter
                              ? (displaySplitNames || "Selected split category")
                              : `Split (${visibleSplitCategories.length} categories)`}
                          </span>
                        ) : (txn.categoryName || "-")}
                      </td>
                      <td className={`px-3 py-3.5 text-right font-mono text-sm font-semibold whitespace-nowrap ${
                        isDeposit ? "text-emerald-600" : "text-gray-900"
                      }`}>
                        {isJournalEntry ? "" : (isDeposit ? "" : "-")}
                        {(txn.accountId?.currency || "Rp")} {formatNumber(displayAmount)}
                      </td>
                      <td className={`px-3 py-3.5 text-right font-mono text-sm font-semibold whitespace-nowrap ${
                        Number(txn.runningBalance) < 0 ? "text-red-600" : "text-emerald-600"
                      }`}>
                        {txn.runningBalance === null || txn.runningBalance === undefined
                          ? "-"
                          : `${txn.accountId?.currency || "Rp"} ${formatNumber(txn.runningBalance)}`}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Receipt button */}
                          <button
                            onClick={() => {
                              if (txn.receiptFile) window.open(`${API_URL}/uploads/transactions/${encodeURIComponent(txn.receiptFile)}`, "_blank", "noopener,noreferrer");
                              else toast("No receipt file available");
                            }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                              txn.receiptFile ? "text-gray-600 hover:bg-gray-100" : "text-gray-300 cursor-default"
                            }`}
                            title={txn.receiptFile ? "View receipt" : "No receipt"}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                            </svg>
                          </button>

                          {/* Reviewed toggle */}
                          {isJournalEntry ? (
                            <button disabled className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 cursor-default" title="N/A for journal entries">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6L9 17l-5-5" /></svg>
                            </button>
                          ) : (
                            <button onClick={() => handleToggleReviewed(txn._id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                                txn.reviewed ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`} title={txn.reviewed ? "Mark as unreviewed" : "Mark as reviewed"}>
                              <svg className="w-3.5 h-3.5" fill={txn.reviewed ? "white" : "none"} stroke={txn.reviewed ? "white" : "currentColor"} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6L9 17l-5-5" />
                              </svg>
                            </button>
                          )}

                          {/* Horizontal dots menu */}
                          <div className="relative" ref={openRowDropdown === txn._id ? rowDropdownRef : null}>
                            <button onClick={() => setOpenRowDropdown(openRowDropdown === txn._id ? null : txn._id)}
                              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="19" cy="12" r="1" />
                                <circle cx="5" cy="12" r="1" />
                              </svg>
                            </button>
                            {openRowDropdown === txn._id && (
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-20 min-w-[130px]">
                                {isJournalEntry ? (
                                  <>
                                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">View</button>
                                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Edit</button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button onClick={() => handleDelete(txn._id)}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => openEditModal(txn)}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Edit</button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button onClick={() => handleDelete(txn._id)}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && transactionPagination.totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <span>
            Showing {((transactionPagination.currentPage - 1) * transactionPagination.itemsPerPage) + 1}
            -{Math.min(
              transactionPagination.currentPage * transactionPagination.itemsPerPage,
              transactionPagination.totalItems
            )} of {transactionPagination.totalItems} transactions
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={transactionPagination.currentPage <= 1}
              onClick={() => setTransactionPage((page) => Math.max(page - 1, 1))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="min-w-20 text-center">
              Page {transactionPagination.currentPage} of {transactionPagination.totalPages}
            </span>
            <button
              type="button"
              disabled={transactionPagination.currentPage >= transactionPagination.totalPages}
              onClick={() => setTransactionPage((page) => Math.min(page + 1, transactionPagination.totalPages))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {/* ==================== TRANSACTION MODAL ==================== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-gray-900">
                {editingTxn ? `Edit ${form.transactionType}` : `Add ${form.transactionType}`}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-4">
                {/* Date + Description */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                    <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                      className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                    <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Write a Description"
                      className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none" />
                  </div>
                </div>

                {/* Account + Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Account</label>
                    <SearchableDropdown value={form.accountId}
                      onChange={(v) => setForm({ ...form, accountId: v })}
                      options={accountDropdownOptions} grouped placeholder="Select account" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
                    <select value={form.transactionType}
                      onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
                      className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none">
                      <option value="Deposit">Deposit</option>
                      <option value="Withdrawal">Withdrawal</option>
                    </select>
                  </div>
                </div>

                {/* Amount + Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount</label>
                    <div className="flex border border-blue-200 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-pink-500 focus-within:border-pink-500">
                      <span className="bg-gray-50 border-r border-blue-200 px-3 py-2.5 text-sm text-gray-500 font-medium">{currencyPrefix}</span>
                      <input type="text" value={form.amountDisplay}
                        onChange={(e) => handleAmountDisplayChange(e.target.value)}
                        placeholder="0" className="flex-1 px-3 py-2.5 text-sm outline-none" required />
                    </div>
                  </div>
                  {!isSplitMode && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
                      <SearchableDropdown value={`${form.categoryType}|${form.categoryId}`}
                        onChange={(v) => {
                          const [type, id] = (v || "|").split("|");
                          setForm({ ...form, categoryType: type || "", categoryId: id || "" });
                        }}
                        options={categoryDropdownOptions} placeholder="Uncategorized Income" />
                    </div>
                  )}
                </div>

                {/* Sales Tax Section */}
                <div className="border-t border-gray-100 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.includeSalesTax}
                      onChange={(e) => setForm({ ...form, includeSalesTax: e.target.checked, salesTaxId: e.target.checked ? form.salesTaxId : "" })}
                      className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500" />
                    <span className="text-sm text-gray-700">Include sales tax</span>
                  </label>
                  {form.includeSalesTax && (
                    <div className="mt-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Select Sales Tax</label>
                      <select value={form.salesTaxId} onChange={(e) => setForm({ ...form, salesTaxId: e.target.value })}
                        className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none">
                        <option value="">Choose sales tax...</option>
                        {salesTaxes.map((tax) => (
                          <option key={tax._id} value={tax._id}>
                            {tax.taxName} ({tax.abbreviation} - {formatNumber(tax.taxRate)}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Vendor Section (Withdrawal only) */}
                {form.transactionType === "Withdrawal" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Vendor</label>
                    <div className="flex items-center gap-2">
                      <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                        className="flex-1 border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none">
                        <option value="">Choose vendor...</option>
                        {vendorOptions.map((vendorName) => (
                          <option key={vendorName} value={vendorName}>
                            {vendorName}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={handleAddVendor}
                        className="text-xs text-pink-600 hover:text-pink-800 cursor-pointer font-medium whitespace-nowrap">
                        + Add vendor
                      </button>
                    </div>
                  </div>
                )}

                {/* Customer Section */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Customer (from Anggota)</label>
                  <CustomerCombobox value={form.customerId}
                    onChange={(v) => setForm({ ...form, customerId: v })}
                    customers={customers} />
                </div>

                {/* Sender Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sender Name</label>
                  <input type="text" value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                    placeholder="Enter sender name"
                    className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none" />
                </div>

                {/* Split Transaction Button / Section */}
                {!isSplitMode ? (
                  <button type="button" onClick={initSplit}
                    className="w-full text-left px-4 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-pink-400 hover:text-pink-600 transition">
                    Split transaction
                  </button>
                ) : (
                  <div className="border border-pink-200 rounded-lg p-4 bg-pink-50/30">
                    {/* Split Header */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">Split Transaction</h4>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">Total: <strong>{currencyPrefix} {formatNumber(form.amount)}</strong></span>
                        <span className="text-gray-500">Remaining: <strong className={`${
                          splitRemaining < 0 ? "text-red-600" : splitRemaining === 0 ? "text-emerald-600" : "text-amber-600"
                        }`}>{currencyPrefix} {formatNumber(splitRemaining)}</strong></span>
                      </div>
                    </div>

                    {/* Split Items */}
                    <div className="space-y-2">
                      {splits.map((sp, idx) => {
                        const runningUsed = splits.slice(0, idx).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                        const maxForThis = (form.amount || 0) - runningUsed;
                        const currentVal = parseFloat(sp.amount) || 0;
                        const exceedsMax = currentVal > maxForThis;
                        return (
                          <div key={idx} className="flex gap-2 items-start">
                            <div className="w-36 shrink-0">
                              <label className="block text-[11px] text-gray-500 mb-0.5">Amount {idx + 1}</label>
                              <div className="flex border border-gray-300 rounded-md overflow-hidden">
                                <span className="bg-gray-50 border-r border-gray-300 px-2 py-1.5 text-xs text-gray-500">{currencyPrefix}</span>
                                <input type="text" value={sp.amountDisplay || ""}
                                  onChange={(e) => updateSplitAmount(idx, e.target.value)}
                                  placeholder="0" className="flex-1 px-2 py-1.5 text-sm outline-none w-full" />
                              </div>
                              <div className={`text-[10px] mt-0.5 ${exceedsMax ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                                {exceedsMax ? `Exceeds max! (${currencyPrefix} ${formatNumber(maxForThis)})` : `Max: ${currencyPrefix} ${formatNumber(maxForThis)}`}
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-500 mb-0.5">Category</label>
                              <SearchableDropdown value={`${sp.categoryType}|${sp.categoryId}`}
                                onChange={(v) => updateSplitCategory(idx, v)}
                                options={categoryDropdownOptions} placeholder="Select category..." />
                            </div>
                            <button type="button" onClick={() => removeSplitItem(idx)}
                              className="mt-5 w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition shrink-0" title="Remove">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Split Actions */}
                    <div className="flex items-center gap-3 mt-3">
                      <button type="button" onClick={addSplitItem}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-100 border border-dashed border-gray-400 rounded-md text-sm text-gray-600 hover:bg-gray-200 transition w-full justify-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        Add another split
                      </button>
                    </div>
                    <button type="button" onClick={cancelSplit}
                      className="mt-2 text-sm text-red-500 hover:text-red-700 font-medium">
                      Cancel split
                    </button>
                  </div>
                )}

                {/* Journal Entry Button */}
                <button type="button"
                  onClick={() => window.open("/accounting/journal-entry/create", "_blank")}
                  className="w-full text-left px-4 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-pink-400 hover:text-pink-600 transition">
                  Add journal entry
                </button>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Write a note here..." rows={3}
                    className="w-full border border-blue-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none resize-y" />
                </div>

                {/* Receipt Upload */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Receipt</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setReceiptDragActive(true); }}
                    onDragLeave={() => setReceiptDragActive(false)}
                    onDrop={handleReceiptDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
                      receiptDragActive ? "border-pink-400 bg-pink-50" : "border-gray-300 hover:border-gray-400"
                    }`}>
                    {receiptFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-700 font-medium">{receiptFile.name}</span>
                        <button type="button" onClick={() => setReceiptFile(null)} className="text-red-400 hover:text-red-600 ml-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600">Drag your file here or <strong className="text-pink-600 cursor-pointer">select a file</strong> to upload</p>
                        <p className="text-xs text-gray-400 mt-1">Files must be 6MB or smaller: JPG, JPEG, GIF, TIFF, TIF, BMP, PNG, PDF, or HEIC</p>
                        <input type="file" onChange={(e) => handleReceiptSelect(e.target.files[0])}
                          accept=".jpg,.jpeg,.png,.pdf,.heic,.tiff,.tif,.bmp,.gif" className="mt-3 text-sm" />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit"
                  className="px-6 py-2.5 text-sm font-medium text-white bg-pink-600 rounded-full hover:bg-pink-700 transition shadow-sm">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CSV UPLOAD MODAL ==================== */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Upload Transactions (CSV)</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account <span className="text-red-500">*</span></label>
                <select value={uploadData.accountId} onChange={(e) => setUploadData({ ...uploadData, accountId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none" required>
                  <option value="">Select account...</option>
                  {allAssetsAccounts.map((a) => <option key={a._id} value={a._id}>{a.accountName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CSV Data <span className="text-red-500">*</span></label>
                <p className="text-xs text-gray-400 mb-2">Format: date,description,amount,type (header row required)</p>
                <textarea value={uploadData.csvText} onChange={(e) => setUploadData({ ...uploadData, csvText: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none resize-y"
                  rows={8} placeholder={"date,description,amount,type\n2025-01-15,Payment received,500000,Deposit\n2025-01-16,Office rent,-1000000,Withdrawal"} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowUploadModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handleUpload} disabled={!uploadData.accountId || !uploadData.csvText}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-pink-600 rounded-full hover:bg-pink-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
