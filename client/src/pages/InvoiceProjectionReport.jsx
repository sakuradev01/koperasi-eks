import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getInvoiceProjectionReport } from "../api/invoiceProjectionApi.jsx";
import {
  buildInvoiceProjectionPdf,
  buildInvoiceProjectionXlsx,
  createInvoiceProjectionFilename,
} from "../utils/invoiceProjectionExport.js";

/* eslint-disable react/prop-types -- route supplies the report mode. */

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
const dateInput = (year, month, day) => `${year}-${month}-${day}`;
const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

const statusOptions = [
  { value: "all", label: "Semua status" },
  { value: "sent", label: "Sent / Belum lunas" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid / Lunas" },
  { value: "overdue", label: "Overdue" },
  { value: "unallocated", label: "Pembayaran belum dialokasikan" },
];

const money = (value, currency) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return `${currency} ${amount.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const statusStyle = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (normalized === "partial") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (normalized === "overdue") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (normalized === "unallocated") return "bg-violet-50 text-violet-700 ring-violet-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
};

const buildCurrencySummary = (report, rows) => {
  const summaries = new Map();
  rows.forEach((row) => {
    const currency = row.currency || "IDR";
    if (!summaries.has(currency)) {
      summaries.set(currency, {
        currency,
        totalProjection: 0,
        totalRealized: 0,
        difference: 0,
        totalOutstanding: 0,
        totalUnallocated: 0,
        invoiceIds: new Set(),
      });
    }
    const summary = summaries.get(currency);
    if (row.invoiceId) summary.invoiceIds.add(row.invoiceId);
    if (report.mode === "monthly") {
      summary.totalProjection += Number(row.projectedAmount || 0);
      summary.totalRealized += Number(row.realizedAmount || 0);
      summary.difference += Number(row.difference || 0);
      if (row.rowType === "unallocated") summary.totalUnallocated += Number(row.realizedAmount || 0);
    } else {
      summary.totalProjection += Number(row.totalProjection || 0);
      summary.totalOutstanding += Number(row.totalOutstanding || 0);
    }
  });

  return {
    ...report,
    rows,
    summary: {
      ...report.summary,
      rowCount: rows.length,
      invoiceCount: new Set(rows.map((row) => row.invoiceId)).size,
      byCurrency: [...summaries.values()]
        .map(({ invoiceIds, ...summary }) => ({ ...summary, invoiceCount: invoiceIds.size }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
    },
  };
};

const InvoiceProjectionReport = ({ mode = "monthly" }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || dateInput(currentYear, currentMonth, "01"),
  );
  const [endDate, setEndDate] = useState(
    searchParams.get("endDate") || dateInput(currentYear, currentMonth, String(monthEnd).padStart(2, "0")),
  );
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [startYear, setStartYear] = useState(Number(searchParams.get("fromYear")) || currentYear);
  const [endYear, setEndYear] = useState(Number(searchParams.get("toYear")) || currentYear);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("25");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const paramsKey = searchParams.toString();
  useEffect(() => {
    let active = true;
    const query = Object.fromEntries(new URLSearchParams(paramsKey));
    const request = async () => {
      setLoading(true);
      setError("");
      try {
        const nextReport = await getInvoiceProjectionReport({ mode, ...query });
        if (active) setReport(nextReport);
      } catch (requestError) {
        if (active) {
          setReport(null);
          setError(requestError.response?.data?.message || requestError.message || "Gagal memuat proyeksi invoice.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    request();
    return () => { active = false; };
  }, [mode, paramsKey]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("id-ID");
    if (!normalizedSearch) return report?.rows || [];
    return (report?.rows || []).filter((row) => [
      row.invoiceNumber,
      row.customerName,
      row.description,
      row.status,
    ].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(normalizedSearch)));
  }, [report, search]);

  const size = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / size));
  const visibleRows = filteredRows.slice((page - 1) * size, page * size);
  const exportReport = useMemo(
    () => report ? buildCurrencySummary(report, filteredRows) : null,
    [report, filteredRows],
  );

  const yearOptions = useMemo(() => {
    const years = new Set([currentYear, startYear, endYear, ...(report?.availableYears || [])]);
    return [...years].filter((year) => year >= 2000 && year <= 2100).sort((left, right) => left - right);
  }, [report, startYear, endYear]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    if (mode === "monthly") {
      setSearchParams({ startDate, endDate, status });
      return;
    }
    const from = Math.min(startYear, endYear);
    const to = Math.max(startYear, endYear);
    setStartYear(from);
    setEndYear(to);
    setSearchParams({ fromYear: String(from), toYear: String(to) });
  };

  const downloadExcel = () => {
    if (!exportReport) return;
    const bytes = buildInvoiceProjectionXlsx(exportReport);
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = createInvoiceProjectionFilename(exportReport, "xlsx");
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!exportReport) return;
    const pdf = buildInvoiceProjectionPdf(exportReport);
    pdf.save(createInvoiceProjectionFilename(exportReport, "pdf"));
  };

  const title = mode === "monthly" ? "Per Bulan" : "Per Tahun";
  const currencySummaries = report?.summary?.byCurrency || [];

  return (
    <main className="space-y-5 p-4 sm:p-6 xl:p-8">
      <header className="overflow-hidden rounded-3xl bg-[#04214A] px-5 py-6 text-white shadow-lg sm:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Reports · Projection (Invoice)</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Proyeksi Invoice {title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
              Pantau nilai invoice yang dijadwalkan dan pembayaran yang benar-benar diterima. Draft tidak disertakan; pembayaran tetap mengikuti tanggal realisasi dan alokasi cicilan.
            </p>
          </div>
          <nav aria-label="Periode laporan" className="flex shrink-0 gap-2 text-sm">
            <Link to="/reports/invoice-projections/per-bulan" aria-current={mode === "monthly" ? "page" : undefined} className={`rounded-xl px-4 py-2 font-semibold transition ${mode === "monthly" ? "bg-white text-[#04214A]" : "border border-white/30 text-white hover:bg-white/10"}`}>Per Bulan</Link>
            <Link to="/reports/invoice-projections/per-tahun" aria-current={mode === "yearly" ? "page" : undefined} className={`rounded-xl px-4 py-2 font-semibold transition ${mode === "yearly" ? "bg-white text-[#04214A]" : "border border-white/30 text-white hover:bg-white/10"}`}>Per Tahun</Link>
          </nav>
        </div>
      </header>

      <form onSubmit={applyFilters} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-5 lg:items-end">
        {mode === "monthly" ? (
          <>
            <label className="block text-sm font-medium text-slate-700">Dari tanggal
              <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Sampai tanggal
              <input required type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-1">Status
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700">Dari tahun
              <select value={startYear} onChange={(event) => setStartYear(Number(event.target.value))} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100">
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">Sampai tahun
              <select value={endYear} onChange={(event) => setEndYear(Number(event.target.value))} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100">
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </>
        )}
        <button type="submit" disabled={loading} className="rounded-xl bg-[#04214A] px-5 py-2.5 font-semibold text-white transition hover:bg-[#0b3975] disabled:cursor-wait disabled:opacity-60">Terapkan Filter</button>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <button type="button" onClick={downloadExcel} disabled={loading || !filteredRows.length} className="flex-1 rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">Export Excel</button>
          <button type="button" onClick={downloadPdf} disabled={loading || !filteredRows.length} className="flex-1 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Export PDF</button>
        </div>
      </form>

      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

      <section aria-label="Ringkasan laporan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {currencySummaries.length ? currencySummaries.map((summary) => (
          <article key={summary.currency} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Ringkasan {summary.currency}</h2>
              <span className="text-xs text-slate-500">Mata uang terpisah</span>
            </div>
            {mode === "monthly" ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                <div><dt className="text-slate-500">Proyeksi</dt><dd className="mt-1 font-semibold text-slate-900">{money(summary.totalProjection, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Realisasi</dt><dd className="mt-1 font-semibold text-emerald-700">{money(summary.totalRealized, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Selisih</dt><dd className="mt-1 font-semibold text-slate-900">{money(summary.difference, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Belum dialokasikan</dt><dd className="mt-1 font-semibold text-violet-700">{money(summary.totalUnallocated, summary.currency)}</dd></div>
              </dl>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                <div><dt className="text-slate-500">Nilai proyeksi</dt><dd className="mt-1 font-semibold text-slate-900">{money(summary.totalProjection, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Total sisa per tanggal laporan</dt><dd className="mt-1 font-semibold text-amber-700">{money(summary.totalOutstanding, summary.currency)}</dd></div>
              </dl>
            )}
          </article>
        )) : (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm sm:col-span-2 xl:col-span-3">Belum ada ringkasan untuk periode ini.</article>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-bold text-slate-900">Rincian {mode === "monthly" ? "aktivitas invoice" : "sisa proyeksi per bulan"}</h2>
            <p className="mt-1 text-xs text-slate-500">{loading ? "Memuat data…" : `${filteredRows.length.toLocaleString("id-ID")} baris · mata uang dihitung terpisah`}</p>
          </div>
          <label className="block text-sm text-slate-600 sm:w-80">Cari invoice / siswa
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="No. invoice atau nama siswa" className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100" />
          </label>
        </div>
        <div className="relative min-h-56 overflow-auto">
          {loading ? <div className="absolute inset-0 z-20 grid place-items-center bg-white/80 text-sm font-medium text-slate-600" role="status">Memuat proyeksi invoice…</div> : null}
          <table className={`min-w-full border-collapse text-left text-sm ${mode === "yearly" ? "min-w-max" : "min-w-[1120px]"}`}>
            {mode === "monthly" ? (
              <>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>{["Tgl Proyeksi", "Tanggal Bayar", "Invoice", "Nama Siswa", "Keterangan", "Mata Uang", "Proyeksi", "Realisasi", "Selisih", "Status"].map((label) => <th key={label} scope="col" className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => <tr key={row.id} className="border-b border-slate-100 align-top hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.projectionDate || "—"}</td>
                    <td className="min-w-32 px-4 py-3 text-slate-600">{row.paymentDates?.join(", ") || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold"><Link className="text-sky-800 hover:underline" to={`/invoice/${encodeURIComponent(row.invoiceNumber)}`}>{row.invoiceNumber}</Link></td>
                    <td className="min-w-40 px-4 py-3 text-slate-800">{row.customerName}</td>
                    <td className="min-w-52 max-w-sm px-4 py-3 text-slate-600">{row.description}</td>
                    <td className="px-4 py-3 text-slate-600">{row.currency}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(row.projectedAmount, row.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-700 tabular-nums">{money(row.realizedAmount, row.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700 tabular-nums">{row.difference === null ? "—" : money(row.difference, row.currency)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(row.status)}`}>{row.status}</span></td>
                  </tr>)}
                </tbody>
              </>
            ) : (
              <>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr><th scope="col" className="sticky left-0 z-20 min-w-48 border-b border-slate-200 bg-slate-50 px-4 py-3">Invoice</th><th scope="col" className="sticky left-48 z-20 min-w-52 border-b border-slate-200 bg-slate-50 px-4 py-3">Nama Siswa</th><th scope="col" className="border-b border-slate-200 px-4 py-3">Mata Uang</th>{(report?.periods || []).map((period) => <th key={period.key} scope="col" className="min-w-32 border-b border-slate-200 px-4 py-3 text-right">{period.label}</th>)}<th scope="col" className="sticky right-0 z-20 min-w-40 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">Total Sisa</th></tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="sticky left-0 z-[1] whitespace-nowrap bg-white px-4 py-3 font-semibold"><Link className="text-sky-800 hover:underline" to={`/invoice/${encodeURIComponent(row.invoiceNumber)}`}>{row.invoiceNumber}</Link></td>
                    <td className="sticky left-48 z-[1] bg-white px-4 py-3 text-slate-800">{row.customerName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.currency}</td>
                    {(report?.periods || []).map((period) => <td key={period.key} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.months?.[period.key] > 0 ? money(row.months[period.key], row.currency) : "—"}</td>)}
                    <td className="sticky right-0 z-[1] whitespace-nowrap bg-white px-4 py-3 text-right font-semibold tabular-nums">{money(row.totalOutstanding, row.currency)}</td>
                  </tr>)}
                </tbody>
              </>
            )}
          </table>
          {!loading && !error && visibleRows.length === 0 ? <div className="px-6 py-14 text-center">
            <p className="font-semibold text-slate-800">Tidak ada data proyeksi invoice</p>
            <p className="mt-1 text-sm text-slate-500">Coba ubah rentang tanggal, tahun, status, atau kata kunci pencarian.</p>
          </div> : null}
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-2 text-slate-500">
            <span>Baris per halaman</span>
            <select aria-label="Baris per halaman" value={pageSize} onChange={(event) => { setPageSize(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700">
              {["10", "25", "50"].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <span>· {filteredRows.length ? `${((page - 1) * size) + 1}–${Math.min(page * size, filteredRows.length)} dari ${filteredRows.length}` : "0 baris"}</span>
          </div>
          <nav aria-label="Halaman hasil" className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(1)} disabled={page <= 1} aria-label="Halaman pertama" className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40">«</button>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40">Sebelumnya</button>
            <span aria-live="polite" className="px-2 text-slate-600">{page} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40">Berikutnya</button>
            <button type="button" onClick={() => setPage(pageCount)} disabled={page >= pageCount} aria-label="Halaman terakhir" className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40">»</button>
          </nav>
        </footer>
      </section>
      <p className="text-xs leading-5 text-slate-500">Nilai antar mata uang tidak dijumlahkan. Proyeksi tahunan menampilkan sisa tagihan per bulan berdasarkan pembayaran yang tercatat sampai tanggal laporan saat ini.</p>
    </main>
  );
};

export default InvoiceProjectionReport;
