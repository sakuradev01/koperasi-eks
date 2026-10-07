import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getAccountTransactionsReport,
  filterAccountTransactionsReport,
  exportAccountTransactionsCsv,
} from "../../../api/accountingApi";
import { buildAccountTransactionsRowHref } from "../../../utils/accountingReportLinks.js";
import "./account-transactions.css";

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

export default function AccountTransactions() {
  const now = new Date();
  const today = toDateInputValue(now);
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const [filters, setFilters] = useState({
    year: String(now.getFullYear()),
    start_date: `${now.getFullYear()}-01-01`,
    end_date: today,
    account_filter: "all",
    contact_filter: "all",
    date_preset: "custom",
  });

  useEffect(() => {
    const fetchInitial = async () => {
      setLoading(true);
      setError("");
      try {
        const query = Object.fromEntries(new URLSearchParams(location.search).entries());
        const res = await getAccountTransactionsReport(query);
        if (!res?.success) throw new Error(res?.message || "Failed to load report");
        setPayload(res.data);
        setFilters((prev) => ({
          ...prev,
          year: String(res.data.year || prev.year),
          start_date: res.data.startDate || prev.start_date,
          end_date: res.data.endDate || prev.end_date,
          account_filter: res.data.accountFilter || prev.account_filter,
          contact_filter: res.data.contactFilter || prev.contact_filter,
          date_preset: res.data.datePreset || prev.date_preset,
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
      const res = await filterAccountTransactionsReport(filters);
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
      const response = await exportAccountTransactionsCsv(filters);
      triggerBlobDownload(response, `account_transactions_${Date.now()}.csv`);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to export CSV");
    }
  };

  const handleYearChange = (year) => {
    setFilters((prev) => ({
      ...prev,
      year,
      start_date: `${year}-01-01`,
      end_date: year === String(now.getFullYear()) ? today : `${year}-12-31`,
      date_preset: "custom",
    }));
  };

  const handleDatePresetChange = (value) => {
    const selectedPreset = (payload?.dateRangePresets || []).find((preset) => preset.value === value);
    if (!selectedPreset) {
      setFilters((prev) => ({ ...prev, date_preset: value }));
      return;
    }

    setFilters((prev) => ({
      ...prev,
      date_preset: value,
      start_date: selectedPreset.start || prev.start_date,
      end_date: selectedPreset.end || prev.end_date,
    }));
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading Account Transactions report...</div>;
  }

  if (!payload) {
    return <div className="p-6 text-sm text-red-600">{error || "Report data is unavailable."}</div>;
  }

  return (
    <div className="at-content">
      <div className="at-header">
        <p className="at-subtitle">General Ledger Report</p>
        <button type="button" className="at-export-btn" onClick={handleExportCsv}>
          Export CSV
        </button>
      </div>

      <form className="at-filter-card" onSubmit={handleSubmit}>
        <div className="at-filter-row">
          <div className="at-filter-group wide">
            <label htmlFor="at-account-filter">Account</label>
            <select
              id="at-account-filter"
              value={filters.account_filter}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  account_filter: event.target.value,
                }))
              }
            >
              {(payload.accountsHierarchy || []).map((accountOption) => (
                <option key={accountOption.id} value={accountOption.id}>
                  {accountOption.name}
                </option>
              ))}
            </select>
          </div>

          <div className="at-filter-group">
            <label htmlFor="at-year">Year</label>
            <select id="at-year" value={filters.year} onChange={(event) => handleYearChange(event.target.value)}>
              {(payload.availableYears || []).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="at-filter-group">
            <label htmlFor="at-date-preset">Date Preset</label>
            <select
              id="at-date-preset"
              value={filters.date_preset}
              onChange={(event) => handleDatePresetChange(event.target.value)}
            >
              {(payload.dateRangePresets || []).map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="at-filter-group">
            <label htmlFor="at-start-date">From</label>
            <input
              id="at-start-date"
              type="date"
              value={filters.start_date}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  year: event.target.value.slice(0, 4) || prev.year,
                  start_date: event.target.value,
                  date_preset: "custom",
                }))
              }
            />
          </div>

          <div className="at-filter-group">
            <label htmlFor="at-end-date">To</label>
            <input
              id="at-end-date"
              type="date"
              value={filters.end_date}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  year: event.target.value.slice(0, 4) || prev.year,
                  end_date: event.target.value,
                  date_preset: "custom",
                }))
              }
            />
          </div>

          <div className="at-filter-group">
            <label htmlFor="at-contact-filter">Contact</label>
            <select
              id="at-contact-filter"
              value={filters.contact_filter}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  contact_filter: event.target.value,
                }))
              }
            >
              {(payload.contacts || []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="at-update-btn" disabled={submitting}>
            {submitting ? "Updating..." : "Update Report"}
          </button>
        </div>
      </form>

      {error ? <div className="at-error">{error}</div> : null}

      {!payload.reportData || payload.reportData.length === 0 ? (
        <div className="at-empty">No transactions found for this filter.</div>
      ) : (
        payload.reportData.map((account) => {
          const balanceChange = Number(account.ending_balance || 0) - Number(account.starting_balance || 0);

          return (
            <div className="at-account-block" key={account.account_id}>
              <div className="at-account-header">
                <h3 className="at-account-name">{account.account_name}</h3>
                <p className="at-account-path">
                  Under: <span>{account.master_name}</span> &gt; <span>{account.submenu_name}</span>
                </p>
              </div>

              <div className="at-table-wrap">
                <table className="at-table">
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>Date</th>
                      <th>Description</th>
                      <th className="num" style={{ width: 140 }}>
                        Debit
                      </th>
                      <th className="num" style={{ width: 140 }}>
                        Credit
                      </th>
                      <th className="num" style={{ width: 160 }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="at-row-starting">
                      <td />
                      <td>Starting Balance</td>
                      <td className="num" />
                      <td className="num" />
                      <td
                        className={`num ${
                          Number(account.starting_balance || 0) >= 0 ? "at-positive" : "at-negative"
                        }`}
                      >
                        {formatSignedMoney(account.starting_balance)}
                      </td>
                    </tr>

                    {(account.transactions || []).map((txn, txnIndex) => (
                      <tr key={`${txn.transaction_id}-${txnIndex}`}>
                        <td>
                          {new Date(txn.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td>
                          <a
                            className="at-link"
                            href={buildAccountTransactionsRowHref(account, txn.transaction_id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {txn.description || `Transaction #${txn.transaction_id}`}
                          </a>
                        </td>
                        <td className={`num ${Number(txn.debit || 0) > 0 ? "at-positive" : ""}`}>
                          {Number(txn.debit || 0) > 0 ? formatMoney(txn.debit) : ""}
                        </td>
                        <td className={`num ${Number(txn.credit || 0) > 0 ? "at-negative" : ""}`}>
                          {Number(txn.credit || 0) > 0 ? formatMoney(txn.credit) : ""}
                        </td>
                        <td className={`num ${Number(txn.balance || 0) >= 0 ? "at-positive" : "at-negative"}`}>
                          {formatSignedMoney(txn.balance)}
                        </td>
                      </tr>
                    ))}

                    <tr className="at-row-total">
                      <td />
                      <td>Totals and Ending Balance</td>
                      <td className="num">{formatMoney(account.total_debit)}</td>
                      <td className="num">{formatMoney(account.total_credit)}</td>
                      <td
                        className={`num ${
                          Number(account.ending_balance || 0) >= 0 ? "at-positive" : "at-negative"
                        }`}
                      >
                        {formatSignedMoney(account.ending_balance)}
                      </td>
                    </tr>

                    <tr className="at-row-change">
                      <td />
                      <td>Balance Change</td>
                      <td className={`num ${balanceChange >= 0 ? "at-positive" : "at-negative"}`}>
                        {formatSignedMoney(balanceChange)}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
