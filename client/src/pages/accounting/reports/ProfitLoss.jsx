import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getProfitLossReport,
  filterProfitLossReport,
  exportProfitLossCsv,
} from "../../../api/accountingApi";
import "./profit-loss.css";

function formatMoney(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function calcChange(currentValue, compareValue) {
  const current = Number(currentValue || 0);
  const compare = Number(compareValue || 0);
  if (Math.abs(compare) < 0.000001) return 0;
  return ((current - compare) / Math.abs(compare)) * 100;
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

function buildTransactionDrilldownHref(account, startDate, endDate) {
  const params = new URLSearchParams({
    filter_category: account.account_name || "",
    filter_category_id: account.id || "",
    filter_category_type: "account",
    filter_date_from: startDate || "",
    filter_date_to: endDate || "",
  });
  return `/akuntansi/transaksi?${params.toString()}`;
}

export default function ProfitLoss() {
  const now = new Date();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const [filters, setFilters] = useState({
    year: String(now.getFullYear()),
    start_date: `${now.getFullYear()}-01-01`,
    end_date: now.toISOString().slice(0, 10),
    report_type: "accrual",
    compare_enabled: false,
    compare_period: "custom",
    compare_start_date: "",
    compare_end_date: "",
    view_mode: "summary",
  });

  useEffect(() => {
    const fetchInitial = async () => {
      setLoading(true);
      setError("");
      try {
        const query = Object.fromEntries(new URLSearchParams(location.search).entries());
        const res = await getProfitLossReport(query);
        if (!res?.success) throw new Error(res?.message || "Failed to load report");
        setPayload(res.data);
        setFilters((prev) => ({
          ...prev,
          year: String(res.data.year || prev.year),
          start_date: res.data.startDate || prev.start_date,
          end_date: res.data.endDate || prev.end_date,
          report_type: res.data.reportType || prev.report_type,
          compare_enabled: !!res.data.compareEnabled,
          compare_period: res.data.comparePeriod || prev.compare_period,
          compare_start_date: res.data.compareStartDate || "",
          compare_end_date: res.data.compareEndDate || "",
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
      const requestPayload = {
        ...filters,
        compare_enabled: filters.compare_enabled ? "1" : "0",
      };
      const res = await filterProfitLossReport(requestPayload);
      if (!res?.success) throw new Error(res?.message || "Failed to filter report");
      setPayload(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to filter report");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = {
        ...filters,
        compare_enabled: filters.compare_enabled ? "1" : "0",
      };
      const response = await exportProfitLossCsv(params);
      triggerBlobDownload(response, `profit_loss_${Date.now()}.csv`);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to export CSV");
    }
  };

  const comparisonEnabled = !!payload?.compareEnabled;

  const summaryCards = useMemo(() => {
    const reportData = payload?.reportData;
    if (!reportData) return [];
    return [
      { label: "Income", value: reportData.total_income },
      { label: "COGS", value: reportData.total_cogs },
      {
        label: "Gross Profit",
        value: reportData.gross_profit,
        className: reportData.gross_profit >= 0 ? "positive" : "negative",
      },
      {
        label: "Net Profit",
        value: reportData.net_profit,
        className: reportData.net_profit >= 0 ? "positive" : "negative",
      },
    ];
  }, [payload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading Profit &amp; Loss report...</div>;
  }

  if (!payload?.reportData) {
    return <div className="p-6 text-sm text-red-600">{error || "Report data is unavailable."}</div>;
  }

  return (
    <div className="pl-content">
      <div className="pl-header">
        <p className="pl-subtitle">Profit and Loss Statement</p>
        <button type="button" className="pl-export-btn" onClick={handleExportCsv}>
          Export CSV
        </button>
      </div>

      <form className="pl-filter-card" onSubmit={handleSubmit}>
        <div className="pl-filter-row">
          <div className="pl-filter-group">
            <label htmlFor="pl-year">Year</label>
            <select
              id="pl-year"
              value={filters.year}
              onChange={(event) => setFilters((prev) => ({ ...prev, year: event.target.value }))}
            >
              {(payload.availableYears || []).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="pl-filter-group">
            <label htmlFor="pl-start-date">From</label>
            <input
              id="pl-start-date"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="pl-filter-group">
            <label htmlFor="pl-end-date">To</label>
            <input
              id="pl-end-date"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="pl-filter-group">
            <label htmlFor="pl-report-type">Report Type</label>
            <select
              id="pl-report-type"
              value={filters.report_type}
              onChange={(event) => setFilters((prev) => ({ ...prev, report_type: event.target.value }))}
            >
              <option value="accrual">Accrual (Paid &amp; Unpaid)</option>
              <option value="cash">Cash Basis</option>
            </select>
          </div>
          <div className="pl-filter-group">
            <label htmlFor="pl-view-mode">View</label>
            <select
              id="pl-view-mode"
              value={filters.view_mode}
              onChange={(event) => setFilters((prev) => ({ ...prev, view_mode: event.target.value }))}
            >
              <option value="summary">Summary</option>
              <option value="details">Details</option>
            </select>
          </div>
          <div className="pl-filter-group">
            <label htmlFor="pl-compare-enabled">Compare</label>
            <input
              id="pl-compare-enabled"
              type="checkbox"
              checked={filters.compare_enabled}
              onChange={(event) => setFilters((prev) => ({ ...prev, compare_enabled: event.target.checked }))}
            />
          </div>
          {filters.compare_enabled ? (
            <>
              <div className="pl-filter-group">
                <label htmlFor="pl-compare-start">Compare From</label>
                <input
                  id="pl-compare-start"
                  type="date"
                  value={filters.compare_start_date}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, compare_start_date: event.target.value }))
                  }
                />
              </div>
              <div className="pl-filter-group">
                <label htmlFor="pl-compare-end">Compare To</label>
                <input
                  id="pl-compare-end"
                  type="date"
                  value={filters.compare_end_date}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, compare_end_date: event.target.value }))
                  }
                />
              </div>
            </>
          ) : null}
          <button type="submit" className="pl-update-btn" disabled={submitting}>
            {submitting ? "Updating..." : "Update Report"}
          </button>
        </div>
      </form>

      {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

      <div className="pl-stats-strip">
        {summaryCards.map((card) => (
          <div key={card.label} className="pl-stat-item">
            <div className="pl-stat-label">{card.label}</div>
            <div className={`pl-stat-value ${card.className || ""}`}>{formatMoney(card.value)}</div>
          </div>
        ))}
      </div>

      <div className="pl-tabs">
        <button
          type="button"
          className={`pl-tab ${filters.view_mode === "summary" ? "active" : ""}`}
          onClick={() => setFilters((prev) => ({ ...prev, view_mode: "summary" }))}
        >
          Summary
        </button>
        <button
          type="button"
          className={`pl-tab ${filters.view_mode === "details" ? "active" : ""}`}
          onClick={() => setFilters((prev) => ({ ...prev, view_mode: "details" }))}
        >
          Details
        </button>
      </div>

      <div className="pl-report-card">
        <div className="pl-report-header">
          <span>Accounts</span>
          <span className="pl-amount">{payload.startDate} - {payload.endDate}</span>
          <span className="pl-amount">
            {comparisonEnabled && payload.comparisonDates
              ? `${payload.comparisonDates.start} - ${payload.comparisonDates.end}`
              : "Comparison"}
          </span>
          <span className="pl-change">Change</span>
        </div>

        <div className="pl-report-row section-header">
          <span>Income</span>
          <span className="pl-amount">{formatMoney(payload.reportData.total_income)}</span>
          <span className="pl-amount">
            {comparisonEnabled ? formatMoney(payload.comparisonData?.total_income || 0) : "-"}
          </span>
          <span className={`pl-change ${calcChange(payload.reportData.total_income, payload.comparisonData?.total_income || 0) >= 0 ? "positive" : "negative"}`}>
            {comparisonEnabled ? `${calcChange(payload.reportData.total_income, payload.comparisonData?.total_income || 0).toFixed(2)}%` : "-"}
          </span>
        </div>

        {filters.view_mode === "details"
          ? payload.reportData.income.accounts.map((account) => (
            <div key={`inc-${account.id}`} className="pl-report-row sub-item">
              <span>
                <a
                  className="pl-link"
                  href={buildTransactionDrilldownHref(account, payload.startDate, payload.endDate)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {account.account_name}
                </a>
              </span>
              <span className="pl-amount">{formatMoney(account.total)}</span>
              <span className="pl-amount">-</span>
              <span className="pl-change">-</span>
            </div>
          ))
          : null}

        <div className="pl-report-row section-header">
          <span>Cost of Goods Sold</span>
          <span className="pl-amount">{formatMoney(payload.reportData.total_cogs)}</span>
          <span className="pl-amount">
            {comparisonEnabled ? formatMoney(payload.comparisonData?.total_cogs || 0) : "-"}
          </span>
          <span className={`pl-change ${calcChange(payload.reportData.total_cogs, payload.comparisonData?.total_cogs || 0) >= 0 ? "positive" : "negative"}`}>
            {comparisonEnabled ? `${calcChange(payload.reportData.total_cogs, payload.comparisonData?.total_cogs || 0).toFixed(2)}%` : "-"}
          </span>
        </div>

        {filters.view_mode === "details"
          ? payload.reportData.cogs.accounts.map((account) => (
            <div key={`cogs-${account.id}`} className="pl-report-row sub-item">
              <span>
                <a
                  className="pl-link"
                  href={buildTransactionDrilldownHref(account, payload.startDate, payload.endDate)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {account.account_name}
                </a>
              </span>
              <span className="pl-amount">{formatMoney(account.total)}</span>
              <span className="pl-amount">-</span>
              <span className="pl-change">-</span>
            </div>
          ))
          : null}

        <div className="pl-report-row section-total">
          <span>Gross Profit</span>
          <span className="pl-amount">{formatMoney(payload.reportData.gross_profit)}</span>
          <span className="pl-amount">
            {comparisonEnabled ? formatMoney(payload.comparisonData?.gross_profit || 0) : "-"}
          </span>
          <span className={`pl-change ${calcChange(payload.reportData.gross_profit, payload.comparisonData?.gross_profit || 0) >= 0 ? "positive" : "negative"}`}>
            {comparisonEnabled ? `${calcChange(payload.reportData.gross_profit, payload.comparisonData?.gross_profit || 0).toFixed(2)}%` : "-"}
          </span>
        </div>

        <div className="pl-report-row section-header">
          <span>Operating Expenses</span>
          <span className="pl-amount">{formatMoney(payload.reportData.total_operating_expenses)}</span>
          <span className="pl-amount">
            {comparisonEnabled ? formatMoney(payload.comparisonData?.total_operating_expenses || 0) : "-"}
          </span>
          <span className={`pl-change ${calcChange(payload.reportData.total_operating_expenses, payload.comparisonData?.total_operating_expenses || 0) >= 0 ? "positive" : "negative"}`}>
            {comparisonEnabled ? `${calcChange(payload.reportData.total_operating_expenses, payload.comparisonData?.total_operating_expenses || 0).toFixed(2)}%` : "-"}
          </span>
        </div>

        {filters.view_mode === "details"
          ? payload.reportData.operating_expenses.accounts.map((account) => (
            <div key={`opex-${account.id}`} className="pl-report-row sub-item">
              <span>
                <a
                  className="pl-link"
                  href={buildTransactionDrilldownHref(account, payload.startDate, payload.endDate)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {account.account_name}
                </a>
              </span>
              <span className="pl-amount">{formatMoney(account.total)}</span>
              <span className="pl-amount">-</span>
              <span className="pl-change">-</span>
            </div>
          ))
          : null}

        <div className="pl-report-row grand-total">
          <span>Net Profit</span>
          <span className="pl-amount">{formatMoney(payload.reportData.net_profit)}</span>
          <span className="pl-amount">
            {comparisonEnabled ? formatMoney(payload.comparisonData?.net_profit || 0) : "-"}
          </span>
          <span className={`pl-change ${calcChange(payload.reportData.net_profit, payload.comparisonData?.net_profit || 0) >= 0 ? "positive" : "negative"}`}>
            {comparisonEnabled ? `${calcChange(payload.reportData.net_profit, payload.comparisonData?.net_profit || 0).toFixed(2)}%` : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
