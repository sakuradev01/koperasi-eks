import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getBalanceSheetReport,
  filterBalanceSheetReport,
  exportBalanceSheetCsv,
  checkBalanceSheetSplitIssues,
} from "../../../api/accountingApi";
import { buildBalanceSheetTransactionHref } from "../../../utils/accountingReportLinks.js";
import "./balance-sheet.css";

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMoney(value) {
  return `Rp ${Math.abs(Number(value || 0)).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedMoney(value) {
  const amount = Number(value || 0);
  const prefix = amount < 0 ? "-" : "";
  return `${prefix}${formatMoney(amount)}`;
}

function triggerBlobDownload(response, fallbackName) {
  const contentDisposition = response.headers?.["content-disposition"] || "";
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function BalanceSheet() {
  const now = new Date();
  const today = toDateInputValue(now);
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const [filters, setFilters] = useState({
    year: String(now.getFullYear()),
    as_of_date: today,
    view_mode: "summary",
  });

  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitIssues, setSplitIssues] = useState([]);

  useEffect(() => {
    const fetchInitial = async () => {
      setLoading(true);
      setError("");
      try {
        const query = Object.fromEntries(new URLSearchParams(location.search).entries());
        const res = await getBalanceSheetReport(query);
        if (!res?.success) throw new Error(res?.message || "Failed to load report");
        setPayload(res.data);
        setFilters((prev) => ({
          ...prev,
          year: String(res.data.year || prev.year),
          as_of_date: res.data.asOfDate || prev.as_of_date,
          view_mode: res.data.viewMode || prev.view_mode,
        }));
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchInitial();
  }, [location.search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await filterBalanceSheetReport(filters);
      if (!res?.success) throw new Error(res?.message || "Failed to filter report");
      setPayload(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to filter report");
    } finally {
      setSubmitting(false);
    }
  };

  const handleYearChange = (year) => {
    setFilters((prev) => ({
      ...prev,
      year,
      as_of_date: year === String(now.getFullYear()) ? today : `${year}-12-31`,
    }));
  };

  const handleExportCsv = async () => {
    try {
      const response = await exportBalanceSheetCsv(filters);
      triggerBlobDownload(response, `balance_sheet_${Date.now()}.csv`);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to export CSV");
    }
  };

  const handleOpenSplitIssues = async () => {
    setSplitModalOpen(true);
    setSplitLoading(true);
    try {
      const res = await checkBalanceSheetSplitIssues();
      if (!res?.success) throw new Error(res?.message || "Failed to check split issues");
      setSplitIssues(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to check split issues");
      setSplitIssues([]);
    } finally {
      setSplitLoading(false);
    }
  };

  const summaryCards = useMemo(() => {
    const reportData = payload?.reportData;
    if (!reportData) return [];
    return [
      { label: "Cash and Bank", value: reportData.cash_and_bank },
      { label: "To be received", value: reportData.to_be_received },
      { label: "To be paid out", value: reportData.to_be_paid_out },
      {
        label: "Net Worth",
        value: reportData.net_worth,
        className: reportData.net_worth >= 0 ? "positive" : "negative",
      },
    ];
  }, [payload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading Balance Sheet report...</div>;
  }

  if (!payload?.reportData) {
    return <div className="p-6 text-sm text-red-600">{error || "Report data is unavailable."}</div>;
  }

  const reportData = payload.reportData;

  return (
    <>
      <div className="bs-content">
        <div className="bs-header">
          <p className="bs-subtitle">Statement of Financial Position</p>
          <div className="bs-header-actions">
            <button type="button" className="bs-danger-btn" onClick={handleOpenSplitIssues}>
              Check Split Issues
            </button>
            <button type="button" className="bs-export-btn" onClick={handleExportCsv}>
              Export CSV
            </button>
          </div>
        </div>

        <form className="bs-filter-card" onSubmit={handleSubmit}>
          <div className="bs-filter-row">
            <div className="bs-filter-group">
              <label htmlFor="bs-year">Year</label>
              <select
                id="bs-year"
                value={filters.year}
                onChange={(event) => handleYearChange(event.target.value)}
              >
                {(payload.availableYears || []).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="bs-filter-group">
              <label htmlFor="bs-as-of">As of Date</label>
              <input
                id="bs-as-of"
                type="date"
              value={filters.as_of_date}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  year: event.target.value.slice(0, 4) || prev.year,
                  as_of_date: event.target.value,
                }))
              }
              />
            </div>

            <button type="submit" className="bs-update-btn" disabled={submitting}>
              {submitting ? "Updating..." : "Update Report"}
            </button>
          </div>
        </form>

        <p className="mb-3 text-xs text-gray-500">Balance dihitung dari transaksi yang sudah dicatat di accounting ledger.</p>

        {error ? <div className="bs-error">{error}</div> : null}

        <div className="bs-stats-strip">
          {summaryCards.map((card) => (
            <div className="bs-stat-item" key={card.label}>
              <div className="bs-stat-label">{card.label}</div>
              <div className={`bs-stat-value ${card.className || ""}`}>{formatMoney(card.value)}</div>
            </div>
          ))}
        </div>

        <div className="bs-tabs">
          <button
            type="button"
            className={`bs-tab ${filters.view_mode === "summary" ? "active" : ""}`}
            onClick={() => setFilters((prev) => ({ ...prev, view_mode: "summary" }))}
          >
            Summary
          </button>
          <button
            type="button"
            className={`bs-tab ${filters.view_mode === "details" ? "active" : ""}`}
            onClick={() => setFilters((prev) => ({ ...prev, view_mode: "details" }))}
          >
            Details
          </button>
        </div>

        <div className="bs-report-card">
          <div className="bs-report-header">
            <span>Accounts</span>
            <span className="bs-amount">{payload.asOfDate}</span>
          </div>

          <div className="bs-report-row section-header">
            <span>Assets</span>
            <span />
          </div>
          {Object.entries(reportData.assets.categories || {}).map(([categoryName, category]) => (
            <div key={`asset-${categoryName}`}>
              {filters.view_mode === "details"
                ? (category.accounts || []).map((account) => {
                  if ((account.balance || 0) === 0) return null;
                  return (
                    <div key={account.id} className="bs-report-row sub-item">
                      <span>
                        <a
                          className="bs-link"
                          href={buildBalanceSheetTransactionHref(account, payload.asOfDate)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {account.account_name}
                        </a>
                      </span>
                      <span className="bs-amount">{formatSignedMoney(account.balance)}</span>
                    </div>
                  );
                })
                : null}
              <div className="bs-report-row">
                <span>Total {categoryName}</span>
                <span className="bs-amount">{formatSignedMoney(category.total)}</span>
              </div>
            </div>
          ))}
          <div className="bs-report-row section-total">
            <span>Total Assets</span>
            <span className="bs-amount">{formatSignedMoney(reportData.total_assets)}</span>
          </div>

          <div className="bs-report-row section-header">
            <span>Liabilities</span>
            <span />
          </div>
          {Object.entries(reportData.liabilities.categories || {}).map(([categoryName, category]) => (
            <div key={`liability-${categoryName}`}>
              {filters.view_mode === "details"
                ? (category.accounts || []).map((account) => {
                  if ((account.balance || 0) === 0) return null;
                  return (
                    <div key={account.id} className="bs-report-row sub-item">
                      <span>
                        <a
                          className="bs-link"
                          href={buildBalanceSheetTransactionHref(account, payload.asOfDate)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {account.account_name}
                        </a>
                      </span>
                      <span className="bs-amount">{formatSignedMoney(account.balance)}</span>
                    </div>
                  );
                })
                : null}
              <div className="bs-report-row">
                <span>Total {categoryName}</span>
                <span className="bs-amount">{formatSignedMoney(category.total)}</span>
              </div>
            </div>
          ))}
          <div className="bs-report-row section-total">
            <span>Total Liabilities</span>
            <span className="bs-amount">{formatSignedMoney(reportData.total_liabilities)}</span>
          </div>

          <div className="bs-report-row section-header">
            <span>Equity</span>
            <span />
          </div>
          {Object.entries(reportData.equity.categories || {}).map(([categoryName, category]) => (
            <div key={`equity-${categoryName}`}>
              {filters.view_mode === "details"
                ? (category.accounts || []).map((account) => {
                  if ((account.balance || 0) === 0) return null;
                  const accountLink = account.is_calculated
                    ? account.link || "#"
                    : buildBalanceSheetTransactionHref(account, payload.asOfDate);
                  return (
                    <div key={account.id} className="bs-report-row sub-item">
                      <span>
                        <a className="bs-link" href={accountLink} target="_blank" rel="noreferrer">
                          {account.account_name}
                        </a>
                      </span>
                      <span className="bs-amount">{formatSignedMoney(account.balance)}</span>
                    </div>
                  );
                })
                : null}
              <div className="bs-report-row">
                <span>Total {categoryName}</span>
                <span className="bs-amount">{formatSignedMoney(category.total)}</span>
              </div>
            </div>
          ))}
          <div className="bs-report-row section-total">
            <span>Total Equity</span>
            <span className="bs-amount">{formatSignedMoney(reportData.total_equity)}</span>
          </div>

          <div className="bs-report-row section-total">
            <span>Total Liabilities + Equity</span>
            <span className="bs-amount">{formatSignedMoney(reportData.total_liabilities_equity)}</span>
          </div>
        </div>

        <div className={`bs-balance-check ${reportData.is_balanced ? "good" : "bad"}`}>
          {reportData.is_balanced
            ? "Balance check passed: Assets = Liabilities + Equity"
            : `Balance check failed: difference ${formatSignedMoney(reportData.balance_difference || 0)} (Assets − Liabilities − Equity)`}
        </div>
      </div>

      {splitModalOpen ? (
        <div
          className="bs-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSplitModalOpen(false);
          }}
        >
          <div className="bs-modal">
            <div className="bs-modal-header">
              <h3 className="bs-modal-title">Split Transaction Issues</h3>
              <button type="button" className="bs-modal-close" onClick={() => setSplitModalOpen(false)}>
                &times;
              </button>
            </div>

            {splitLoading ? <div className="bs-loading">Checking split transactions...</div> : null}

            {!splitLoading && splitIssues.length === 0 ? (
              <div className="bs-empty">Tidak ada split transaction issue. Semua split sudah balance.</div>
            ) : null}

            {!splitLoading && splitIssues.length > 0 ? (
              <>
                <div className="bs-issues-summary">
                  Ditemukan {splitIssues.length} masalah split amount atau kategori COA nonaktif.
                </div>
                <div className="bs-issues-table-wrap">
                  <table className="bs-issues-table">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>ID</th>
                        <th>Date</th>
                        <th>Description</th>
                        <th>COA Category</th>
                        <th>Account</th>
                        <th className="num">Amount</th>
                        <th className="num">Total Split</th>
                        <th className="num">Remaining</th>
                        <th className="center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splitIssues.map((issue) => (
                        <tr key={issue.id}>
                          <td>{issue.issue_reason || "Split amount mismatch"}</td>
                          <td>#{issue.id}</td>
                          <td>{issue.transaction_date}</td>
                          <td>{issue.description || "-"}</td>
                          <td>{issue.category_name || "-"}</td>
                          <td>{issue.account_name || "-"}</td>
                          <td className="num">{formatMoney(issue.transaction_amount)}</td>
                          <td className="num">{formatMoney(issue.total_split_amount)}</td>
                          <td className="num">{formatSignedMoney(issue.remaining_unallocated)}</td>
                          <td className="center">
                            <a
                              className="bs-link"
                              href={`/akuntansi/transaksi?highlight=${encodeURIComponent(
                                issue.id
                              )}&filter_account=${encodeURIComponent(issue.account_name || "")}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
