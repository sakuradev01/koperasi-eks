import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/index.jsx";

const STATUSES = [
  ["submitted", "Menunggu Finance"],
  ["reviewing", "Ditinjau"],
  ["approved", "Disetujui"],
  ["waiting_payment", "Menunggu Pencairan"],
  ["rejected", "Ditolak"],
  ["paid", "Sudah Dibayar"],
];

const STATUS_STYLES = {
  submitted: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  approved: "bg-indigo-100 text-indigo-800",
  waiting_payment: "bg-violet-100 text-violet-800",
  rejected: "bg-rose-100 text-rose-800",
  paid: "bg-emerald-100 text-emerald-800",
};

const statusLabel = (status) => STATUSES.find(([value]) => value === status)?.[1] || status || "-";
const money = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function SavingsWithdrawals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "submitted");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState({ items: [], total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feeDrafts, setFeeDrafts] = useState({});
  const [savingFeeId, setSavingFeeId] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: "50" });
      const response = await api.get(`/api/admin/savings-withdrawals?${params.toString()}`);
      if (!response.data?.success) throw new Error(response.data?.message || "Gagal memuat pengajuan.");
      setPayload(response.data.data || { items: [], total: 0, limit: 50 });
    } catch (loadError) {
      setError(loadError.response?.data?.message || loadError.message || "Gagal memuat pengajuan tutup tabungan.");
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    setSearchParams(status === "all" ? {} : { status }, { replace: true });
  }, [status, setSearchParams]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const saveBankFee = async (request) => {
    const feeAmount = Number(feeDrafts[request._id] ?? request.bankFeeAmount ?? 0);
    setSavingFeeId(request._id);
    setError("");
    try {
      await api.patch(`/api/admin/savings-withdrawals/${request._id}/bank-fee`, { bankFeeAmount: feeAmount });
      await loadRequests();
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Gagal menyimpan biaya antarbank.");
    } finally {
      setSavingFeeId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(payload.total / payload.limit));

  return (
    <main className="p-4 sm:p-6 max-w-full">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Simpanan anggota</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Penutupan Tabungan</h1>
          <p className="mt-1 text-sm text-slate-600">Pantau pengajuan siswa dan lanjutkan pembukuan melalui Expense Koperasi.</p>
        </div>
        <button type="button" onClick={loadRequests} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-4">
        <label htmlFor="withdrawalStatusFilter" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Filter status pengajuan</label>
        <select id="withdrawalStatusFilter" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-full sm:w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="all">Semua status</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </section>

      {error ? <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Memuat riwayat pengajuan…</div>
        ) : payload.items.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="font-semibold text-slate-800">Tidak ada pengajuan pada status ini</h2>
            <p className="mt-1 text-sm text-slate-500">Pengajuan baru akan muncul di sini dan otomatis tercatat sebagai Expense uncategorized.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal / No. Pengajuan</th>
                  <th className="px-4 py-3">Anggota</th>
                  <th className="px-4 py-3">Ringkasan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3 text-right">Tindak lanjut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payload.items.map((request) => {
                  const member = request.memberId && typeof request.memberId === "object" ? request.memberId : null;
                  const expense = request.expenseId && typeof request.expenseId === "object" ? request.expenseId : null;
                  const normalizedBank = String(request.bankNameSnapshot || "").toUpperCase().replace(/[^A-Z]/g, "");
                  const bcaDestination = normalizedBank === "BCA" || normalizedBank.includes("BANKCENTRALASIA") || normalizedBank.includes("CENTRALASIA");
                  const canSetFee = ["submitted", "reviewing"].includes(request.status) && expense?.status === "uncategorized" && !bcaDestination;
                  return (
                    <tr key={request._id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{new Date(request.createdAt).toLocaleDateString("id-ID")}</div>
                        <div className="mt-1 font-mono text-xs text-slate-500">{request.requestNumber}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Link className="font-semibold text-blue-700 hover:underline" to={`/master/anggota/${request.memberUuidSnapshot}`}>
                          {request.memberNameSnapshot || member?.name || "Anggota"}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">{request.memberUuidSnapshot || member?.uuid}</div>
                        <div className="mt-1 text-xs text-slate-500">{request.productNameSnapshot || "Simpanan"} · Periode lunas {request.paidPeriodCount}/{request.contractPeriodCount}</div>
                      </td>
                      <td className="px-4 py-4 min-w-60">
                        <div className="text-xs text-slate-500">Saldo bruto</div>
                        <div className="font-semibold text-slate-900">{money(request.grossAmount)}</div>
                        <div className="mt-1 text-xs text-slate-600">Penalti {money(request.penaltyAmount)} · Biaya antarbank {money(request.bankFeeAmount)}</div>
                        <div className="mt-1 text-xs font-semibold text-emerald-700">Estimasi transfer {money(request.netAmount)}</div>
                        {canSetFee ? (
                          <div className="mt-3 flex items-center gap-2">
                            <label htmlFor={`fee-${request._id}`} className="text-xs text-slate-600">Biaya bank</label>
                            <input id={`fee-${request._id}`} type="number" min="0" step="1" value={feeDrafts[request._id] ?? request.bankFeeAmount ?? 0} onChange={(event) => setFeeDrafts((previous) => ({ ...previous, [request._id]: event.target.value }))} className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
                            <button type="button" disabled={savingFeeId === request._id} onClick={() => saveBankFee(request)} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{savingFeeId === request._id ? "…" : "Simpan"}</button>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[request.status] || "bg-slate-100 text-slate-700"}`}>{statusLabel(request.status)}</span>
                        {request.status === "rejected" && request.rejectionReason ? <p className="mt-2 max-w-48 whitespace-normal text-xs text-rose-700">{request.rejectionReason}</p> : null}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {expense?._id ? <><div className="font-mono text-xs text-slate-700">ER-{String(expense._id).slice(-6).toUpperCase()}</div><div className="mt-1 text-xs text-slate-500">{expense.status}</div></> : <span className="text-xs text-rose-600">Belum terhubung</span>}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {expense?._id ? <Link to={`/expense/detail/${expense._id}`} className="inline-flex rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">Buka Expense</Link> : <span className="text-xs text-slate-400">Periksa data</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>{payload.total} pengajuan · Halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
