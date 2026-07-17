import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getMembers } from "../../api/accountingApi.jsx";
import { exportInvoices, getInvoices } from "../../api/invoiceApi.jsx";
import "./invoice.css";

const formatMoney = (amount, currency = "IDR") => {
  const locale = currency === "IDR" ? "id-ID" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "IDR" ? 0 : 2,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(amount || 0));
};

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const statusLabel = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
};

const sortableInvoiceColumns = {
  status: "Status",
  due: "Due",
  issued: "Issued",
};

function StatCard({ label, value }) {
  return (
    <div className="inv-stat">
      <div className="inv-stat-label">{label}</div>
      <div className="inv-stat-value">{value}</div>
    </div>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [payload, setPayload] = useState(null);

  const filters = useMemo(
    () => ({
      page: Number(searchParams.get("page") || 1),
      search: searchParams.get("search") || "",
      memberId: searchParams.get("memberId") || "",
      status: searchParams.get("status") || "",
      issuedFrom: searchParams.get("issuedFrom") || "",
      issuedTo: searchParams.get("issuedTo") || "",
      dueFrom: searchParams.get("dueFrom") || "",
      dueTo: searchParams.get("dueTo") || "",
      dueState: searchParams.get("dueState") || "",
      order: searchParams.get("order") || "",
      by: searchParams.get("by") || "",
      tag: searchParams.get("tag") || "unpaid",
    }),
    [searchParams],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [membersRes, invoicesRes] = await Promise.all([
          getMembers(),
          getInvoices(filters),
        ]);

        if (membersRes?.success) {
          const sortedMembers = [...(membersRes.data || [])].sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          );
          setMembers(sortedMembers);
        }

        if (!invoicesRes?.success) {
          throw new Error(invoicesRes?.message || "Failed to load invoices");
        }

        setPayload(invoicesRes.data);
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err.message ||
            "Failed to load invoices",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [filters]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams({ tag: "unpaid", page: "1" });
  };

  const handleDownloadAll = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      // Same filters as list (search/status/tag/dates/order) — no page/limit
      const params = {
        search: filters.search || undefined,
        memberId: filters.memberId || undefined,
        status: filters.status || undefined,
        issuedFrom: filters.issuedFrom || undefined,
        issuedTo: filters.issuedTo || undefined,
        dueFrom: filters.dueFrom || undefined,
        dueTo: filters.dueTo || undefined,
        dueState: filters.dueState || undefined,
        order: filters.order || undefined,
        by: filters.by || undefined,
        tag: filters.tag || "unpaid",
      };
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined || params[key] === "") delete params[key];
      });

      const res = await exportInvoices(params);
      const blob = new Blob([res.data], {
        type: "application/vnd.ms-excel;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `all-invoice-report-${dateStr}.xls`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Gagal download invoice",
      );
    } finally {
      setExporting(false);
    }
  };

  const setSort = (column) => {
    const next = new URLSearchParams(searchParams);
    const nextDirection =
      filters.order === column && filters.by === "asc" ? "desc" : "asc";
    next.set("order", column);
    next.set("by", nextDirection);
    next.set("page", "1");
    setSearchParams(next);
  };

  const renderSortHeader = (column) => (
    <button
      type="button"
      className={`inv-sort-header ${
        filters.order === column ? "active" : ""
      }`}
      onClick={() => setSort(column)}
      title={`Sort ${sortableInvoiceColumns[column]}`}
    >
      <span>{sortableInvoiceColumns[column]}</span>
      <span aria-hidden="true">
        {filters.order === column ? (filters.by === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  return (
    <div className="inv-page">
      <div className="inv-card inv-header">
        <div>
          <h1>Invoice</h1>
          <div className="inv-sub">
            Daftar invoice koperasi dengan struktur customer dari anggota.
          </div>
        </div>
        <div className="inv-actions">
          <button
            type="button"
            className="inv-btn-ghost"
            onClick={handleDownloadAll}
            disabled={exporting || loading}
            title="Download semua invoice sesuai filter aktif (search/status/tag)"
          >
            {exporting ? "Downloading..." : "Download All"}
          </button>
          <button
            type="button"
            className="inv-btn"
            onClick={() => navigate("/invoice/new")}
          >
            New Invoice
          </button>
        </div>
      </div>

      {error ? <div className="inv-error">{error}</div> : null}

      <div className="inv-grid">
        <div className="inv-grid-3">
          <StatCard
            label="Total Invoices"
            value={payload?.summary?.totalInvoices ?? 0}
          />
        </div>
        <div className="inv-grid-3">
          <StatCard label="Draft" value={payload?.summary?.totalDraft ?? 0} />
        </div>
        <div className="inv-grid-3">
          <StatCard
            label="Outstanding"
            value={formatMoney(payload?.summary?.totalOutstanding || 0)}
          />
        </div>
        <div className="inv-grid-3">
          <StatCard
            label="Invoice Value"
            value={formatMoney(payload?.summary?.totalValue || 0)}
          />
        </div>
      </div>

      <div className="inv-card">
        <div className="inv-filter-row inv-invoice-filter-row">
          <div>
            <label className="inv-label">Customer</label>
            <select
              className="inv-select"
              value={filters.memberId}
              onChange={(event) => setFilter("memberId", event.target.value)}
            >
              <option value="">All Customers</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name} {member.uuid ? `• ${member.uuid}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="inv-label">Status</label>
            <select
              className="inv-select"
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <label className="inv-label">Due Status</label>
            <select
              className="inv-select"
              value={filters.dueState}
              onChange={(event) => setFilter("dueState", event.target.value)}
            >
              <option value="">All Due</option>
              <option value="overdue">Overdue</option>
              <option value="due_today">Due Today</option>
              <option value="due_7">Due in 7 Days</option>
              <option value="due_30">Due in 30 Days</option>
              <option value="not_due">Not Yet Due</option>
            </select>
          </div>
          <div>
            <label className="inv-label">Due From</label>
            <input
              className="inv-input"
              type="date"
              value={filters.dueFrom}
              onChange={(event) => setFilter("dueFrom", event.target.value)}
            />
          </div>
          <div>
            <label className="inv-label">Due To</label>
            <input
              className="inv-input"
              type="date"
              value={filters.dueTo}
              onChange={(event) => setFilter("dueTo", event.target.value)}
            />
          </div>
          <div>
            <label className="inv-label">Issued From</label>
            <input
              className="inv-input"
              type="date"
              value={filters.issuedFrom}
              onChange={(event) => setFilter("issuedFrom", event.target.value)}
            />
          </div>
          <div>
            <label className="inv-label">Issued To</label>
            <input
              className="inv-input"
              type="date"
              value={filters.issuedTo}
              onChange={(event) => setFilter("issuedTo", event.target.value)}
            />
          </div>
          <div className="inv-search-wrap">
            <label className="inv-label">Search</label>
            <div className="inv-search-field">
              <input
                className="inv-input"
                type="text"
                placeholder="Invoice / customer / sales code"
                value={filters.search}
                onChange={(event) => setFilter("search", event.target.value)}
              />
              <button
                type="button"
                className="inv-search-button"
                onClick={() => setFilter("search", filters.search)}
              >
                Cari
              </button>
            </div>
          </div>
        </div>
        <div className="inv-inline-actions" style={{ marginTop: 12 }}>
          <div className="inv-pills">
            <button
              type="button"
              className={`inv-pill ${filters.tag === "unpaid" ? "active" : ""}`}
              onClick={() => setFilter("tag", "unpaid")}
            >
              Unpaid
            </button>
            <button
              type="button"
              className={`inv-pill ${filters.tag === "draft" ? "active" : ""}`}
              onClick={() => setFilter("tag", "draft")}
            >
              Draft
            </button>
            <button
              type="button"
              className={`inv-pill ${filters.tag === "all" ? "active" : ""}`}
              onClick={() => setFilter("tag", "all")}
            >
              All Invoices
            </button>
          </div>
          <button
            type="button"
            className="inv-btn-ghost"
            onClick={clearFilters}
          >
            Clear Filter
          </button>
        </div>
      </div>

      <div className="inv-card">
        {loading ? <div className="inv-sub">Loading invoices...</div> : null}
        {!loading && !(payload?.invoices || []).length ? (
          <div className="inv-empty">No invoice data found.</div>
        ) : null}
        {!loading && (payload?.invoices || []).length ? (
          <>
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>{renderSortHeader("status")}</th>
                    <th>{renderSortHeader("due")}</th>
                    <th>{renderSortHeader("issued")}</th>
                    <th>Invoice ID</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Amount Due</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.invoices || []).map((invoice) => (
                    <tr
                      key={invoice._id}
                      data-clickable="true"
                      onClick={() =>
                        navigate(`/invoice/${invoice.invoiceNumber}`)
                      }
                    >
                      <td>
                        <span className={`inv-status ${invoice.status}`}>
                          {statusLabel[invoice.status] || invoice.status}
                        </span>
                      </td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>{formatDate(invoice.issuedDate)}</td>
                      <td>
                        <div className="inv-detail-code">
                          {invoice.invoiceNumber}
                        </div>
                        {invoice.salesCode ? (
                          <div className="inv-customer-meta">
                            Sales: {invoice.salesCode}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="inv-customer-name">
                          {invoice.customerSnapshot?.name || "-"}
                        </div>
                        <div className="inv-customer-meta">
                          {invoice.customerSnapshot?.uuid || "-"}
                        </div>
                      </td>
                      <td>{formatMoney(invoice.total, invoice.currency)}</td>
                      <td
                        className={
                          Number(invoice.amountDue) > 0
                            ? "inv-amount-negative"
                            : "inv-amount-positive"
                        }
                      >
                        {formatMoney(invoice.amountDue, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inv-pagination">
              <div className="inv-sub">
                Total Data: {payload?.pagination?.totalItems || 0}
              </div>
              <div className="inv-inline-actions">
                <button
                  type="button"
                  className="inv-btn-ghost"
                  disabled={(payload?.pagination?.currentPage || 1) <= 1}
                  onClick={() =>
                    setFilter(
                      "page",
                      String((payload?.pagination?.currentPage || 1) - 1),
                    )
                  }
                >
                  Previous
                </button>
                <div className="inv-sub">
                  Page {payload?.pagination?.currentPage || 1} /{" "}
                  {payload?.pagination?.totalPages || 1}
                </div>
                <button
                  type="button"
                  className="inv-btn-ghost"
                  disabled={
                    (payload?.pagination?.currentPage || 1) >=
                    (payload?.pagination?.totalPages || 1)
                  }
                  onClick={() =>
                    setFilter(
                      "page",
                      String((payload?.pagination?.currentPage || 1) + 1),
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
