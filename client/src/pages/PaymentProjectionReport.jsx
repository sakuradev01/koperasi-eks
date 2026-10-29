import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/index.jsx";
import { buildPaymentProjectionReport } from "../utils/paymentProjectionReport.js";
import jsPDF from "jspdf";
import "jspdf-autotable";

/* eslint-disable react/prop-types -- route supplies a fixed presentation mode. */

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const years = (current) => Array.from({ length: 8 }, (_, index) => current - 5 + index);

const PaymentProjectionReport = ({ mode = "monthly" }) => {
  const currentYear = new Date().getFullYear();
  const [params, setParams] = useSearchParams();
  const [startYear, setStartYear] = useState(Number(params.get("from_year")) || currentYear);
  const [endYear, setEndYear] = useState(Number(params.get("to_year")) || currentYear);
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [memberResponse, productResponse] = await Promise.all([
          api.get("/api/admin/members"),
          api.get("/api/admin/products"),
        ]);
        let allSavings = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 100) {
          const response = await api.get(`/api/admin/savings?limit=100&page=${page}`);
          const payload = response.data?.data;
          const pageItems = Array.isArray(payload) ? payload : payload?.savings || [];
          const total = payload?.pagination?.totalItems || response.data?.pagination?.totalItems || 0;
          allSavings = allSavings.concat(pageItems);
          hasMore = pageItems.length > 0 && allSavings.length < total;
          page += 1;
        }
        if (!mounted) return;
        setMembers(memberResponse.data?.data || []);
        setProducts(productResponse.data?.data || []);
        setSavings(allSavings);
      } catch (loadError) {
        if (mounted) setError(loadError.response?.data?.message || loadError.message || "Gagal memuat laporan.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const report = useMemo(
    () => buildPaymentProjectionReport({ members, products, savings, startYear, endYear }),
    [members, products, savings, startYear, endYear],
  );
  const visiblePeriods = mode === "monthly"
    ? report.periods.filter((period) => period.year === startYear)
    : report.periods;
  const visibleRows = report.rows.filter((row) => visiblePeriods.some((period) => row.months[period.key] > 0));

  const exportExcel = () => {
    const header = ["Nama Siswa", "No. Anggota", ...visiblePeriods.map((period) => period.label)];
    const rows = visibleRows.map((row) => [row.customerName, row.customerCode, ...visiblePeriods.map((period) => row.months[period.key] || 0)]);
    const csv = [header, ["Total Sisa Projection", "", ...visiblePeriods.map((period) => report.totals[period.key] || 0)], ...rows]
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Payment_Projection_${mode === "monthly" ? "Per_Bulan" : "Per_Tahun"}_${startYear}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const documentPdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    documentPdf.text(`Payment Projection ${mode === "monthly" ? "Per Bulan" : "Per Tahun"}`, 36, 36);
    documentPdf.setFontSize(9);
    documentPdf.text(`Periode: ${startYear}${mode === "yearly" && endYear !== startYear ? `-${endYear}` : ""}`, 36, 52);
    documentPdf.autoTable({
      startY: 68,
      head: [["Nama Siswa", "No. Anggota", ...visiblePeriods.map((period) => period.label)]],
      body: visibleRows.map((row) => [row.customerName, row.customerCode, ...visiblePeriods.map((period) => money.format(row.months[period.key] || 0))]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    documentPdf.save(`Payment_Projection_${mode === "monthly" ? "Per_Bulan" : "Per_Tahun"}_${startYear}.pdf`);
  };

  const applyPeriod = () => {
    const nextStart = Math.min(startYear, endYear);
    const nextEnd = Math.max(startYear, endYear);
    setStartYear(nextStart);
    setEndYear(mode === "monthly" ? nextStart : nextEnd);
    setParams(mode === "monthly" ? { year: String(nextStart) } : { mode: "range", from_year: String(nextStart), to_year: String(nextEnd) });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Memuat payment projection...</div>;
  if (error) return <div className="m-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</div>;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="rounded-[28px] bg-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Payment Projection</p>
            <h1 className="mt-2 text-3xl font-bold">Projection {mode === "monthly" ? "Per Bulan" : "Per Tahun"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Sisa target setoran per periode. Anggota Draft/Nonaktif tidak ikut proyeksi.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link className="rounded-full border border-slate-500 px-4 py-2 hover:bg-slate-800" to="/laporan/per-bulan">Per Bulan</Link>
            <Link className="rounded-full border border-slate-500 px-4 py-2 hover:bg-slate-800" to="/laporan/per-tahun">Per Tahun</Link>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <label className="text-sm font-medium text-slate-600">{mode === "monthly" ? "Tahun" : "Dari tahun"}
          <select className="mt-2 block rounded-xl border border-slate-200 px-3 py-2" value={startYear} onChange={(event) => setStartYear(Number(event.target.value))}>
            {years(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        {mode === "yearly" ? <label className="text-sm font-medium text-slate-600">Sampai tahun
          <select className="mt-2 block rounded-xl border border-slate-200 px-3 py-2" value={endYear} onChange={(event) => setEndYear(Number(event.target.value))}>
            {years(currentYear + 2).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label> : null}
        <button type="button" onClick={applyPeriod} className="rounded-xl bg-sky-600 px-5 py-2.5 font-semibold text-white hover:bg-sky-700">Terapkan</button>
        <button type="button" onClick={exportExcel} disabled={!visibleRows.length} className="rounded-xl border border-emerald-200 px-4 py-2.5 font-semibold text-emerald-700 disabled:opacity-40">Export Excel</button>
        <button type="button" onClick={exportPdf} disabled={!visibleRows.length} className="rounded-xl border border-rose-200 px-4 py-2.5 font-semibold text-rose-700 disabled:opacity-40">Export PDF</button>
        <div className="ml-auto rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">Total sisa: <strong>{money.format(report.totalOutstanding)}</strong></div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-slate-900 text-white">
              <tr><th rowSpan="2" className="sticky left-0 z-20 bg-slate-900 px-5 py-4 text-left">Nama Siswa</th><th rowSpan="2" className="sticky left-[220px] z-20 bg-slate-900 px-5 py-4 text-left">No. Anggota</th>{mode === "yearly" ? Array.from(new Set(visiblePeriods.map((period) => period.year))).map((year) => <th key={year} colSpan="12" className="border-l border-slate-700 px-4 py-3 text-center">{year}</th>) : null}</tr>
              <tr>{visiblePeriods.map((period) => <th key={period.key} className="min-w-[120px] px-4 py-3 text-right font-semibold">{mode === "monthly" ? period.label : period.label.split(" ")[0]}</th>)}</tr>
            </thead>
            <tbody>
              <tr className="bg-sky-50 font-bold text-sky-900"><td colSpan="2" className="sticky left-0 z-10 bg-sky-50 px-5 py-4">Total Sisa Projection</td>{visiblePeriods.map((period) => <td key={period.key} className="px-4 py-4 text-right">{report.totals[period.key] ? money.format(report.totals[period.key]) : "-"}</td>)}</tr>
              {visibleRows.length === 0 ? <tr><td colSpan={2 + visiblePeriods.length} className="px-6 py-12 text-center text-slate-500">Tidak ada sisa projection pada periode ini.</td></tr> : visibleRows.map((row) => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="sticky left-0 z-10 bg-white px-5 py-4 font-semibold text-slate-900"><Link className="text-sky-700 hover:underline" to={`/master/anggota/${row.customerCode}`}>{row.customerName}</Link><div className="text-xs font-normal text-slate-500">{row.productTitle}</div></td><td className="sticky left-[220px] z-10 bg-white px-5 py-4 text-slate-600">{row.customerCode}</td>{visiblePeriods.map((period) => <td key={period.key} className="px-4 py-4 text-right font-medium text-slate-700">{row.months[period.key] ? money.format(row.months[period.key]) : "-"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">Perhitungan mengikuti target produk, pembayaran Approved/Partial, serta carry-over kelebihan pembayaran minimal Rp30.000.</p>
      </section>
    </div>
  );
};

export default PaymentProjectionReport;
