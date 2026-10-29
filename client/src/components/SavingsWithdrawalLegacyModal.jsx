/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import { getAccountsByType, getAssetsAccounts } from "../api/accountingApi.jsx";
import api from "../api/index.jsx";

const getApprovedBalance = (savings = []) => savings.reduce((balance, saving) => {
  if (!["Approved", "Partial"].includes(String(saving.status || ""))) return balance;
  const amount = Number(saving.amount || 0);
  if (saving.type === "Penarikan") return balance - amount;
  if (!saving.type || saving.type === "Setoran") return balance + amount;
  return balance;
}, 0);

export default function SavingsWithdrawalLegacyModal({ member, savings, paidPeriodCount, onClose, onSaved }) {
  const defaultGross = Math.max(0, Math.round(getApprovedBalance(savings)));
  const [grossAmount, setGrossAmount] = useState(String(defaultGross));
  const [penaltyAmount, setPenaltyAmount] = useState(String(paidPeriodCount < 36 ? Math.round(defaultGross * 0.06) : 0));
  const [bankFeeAmount, setBankFeeAmount] = useState("0");
  const [accountId, setAccountId] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [destinationBank, setDestinationBank] = useState(member.bankName || "");
  const [destinationNumber, setDestinationNumber] = useState(member.accountNumber || "");
  const [destinationHolder, setDestinationHolder] = useState(member.accountHolderName || member.name || "");
  const [reason, setReason] = useState("Pencatatan penutupan tabungan lama oleh Finance.");
  const [proofFile, setProofFile] = useState(null);
  const [expenseGroups, setExpenseGroups] = useState([]);
  const [assetGroups, setAssetGroups] = useState([]);
  const [lines, setLines] = useState([{ categoryId: "", description: "", amount: "" }]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const netAmount = Math.max(0, Number(grossAmount || 0) - Number(penaltyAmount || 0) - Number(bankFeeAmount || 0));
  const lineTotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0), [lines]);
  const balanced = Math.abs(lineTotal - netAmount) < 0.01;

  useEffect(() => {
    let active = true;
    Promise.all([getAccountsByType("Expenses"), getAssetsAccounts()])
      .then(([expenses, assets]) => {
        if (!active) return;
        if (expenses?.success) {
          setExpenseGroups(Object.entries(expenses.accountsBySubtype || {}).map(([label, payload]) => ({ label, accounts: payload?.accounts || [] })));
        }
        if (assets?.success) {
          setAssetGroups(Object.entries(assets.data || {}).map(([label, accounts]) => ({ label, accounts: accounts || [] })));
        }
      })
      .catch((loadError) => { if (active) setError(loadError.response?.data?.message || "Gagal memuat akun dan kategori COA."); })
      .finally(() => { if (active) setLoadingRefs(false); });
    return () => { active = false; };
  }, []);

  const updateLine = (index, key, value) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const normalizedLines = lines
      .map((line) => ({ categoryId: line.categoryId, description: line.description, amount: Math.round(Number(line.amount || 0)) }))
      .filter((line) => line.categoryId && line.amount > 0);
    if (!accountId || !paidBy.trim() || !proofFile || !transferDate) {
      setError("Akun sumber, nama pengirim, tanggal, dan bukti transfer wajib dilengkapi.");
      return;
    }
    if (!normalizedLines.length || normalizedLines.reduce((sum, line) => sum + line.amount, 0) !== Math.round(netAmount)) {
      setError("Total kategori harus sama dengan jumlah bersih yang ditransfer.");
      return;
    }
    if (!window.confirm(`Catat penutupan tabungan lama ${member.name} sebesar Rp ${Math.round(netAmount).toLocaleString("id-ID")} sebagai sudah dibayar dan buat transaksi akuntansi?`)) return;

    const form = new FormData();
    form.append("grossAmount", String(Math.round(Number(grossAmount || 0))));
    form.append("penaltyAmount", String(Math.round(Number(penaltyAmount || 0))));
    form.append("bankFeeAmount", String(Math.round(Number(bankFeeAmount || 0))));
    form.append("accountId", accountId);
    form.append("paidBy", paidBy.trim());
    form.append("transferDate", transferDate);
    form.append("bankName", destinationBank);
    form.append("destinationAccountNumber", destinationNumber);
    form.append("destinationAccountHolder", destinationHolder);
    form.append("reason", reason.trim());
    form.append("lines", JSON.stringify(normalizedLines));
    form.append("proofFile", proofFile);

    setSubmitting(true);
    try {
      await api.post(`/api/admin/savings-withdrawals/legacy/${member.uuid}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSaved?.();
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Gagal membukukan penutupan tabungan lama.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="legacy-withdrawal-title">
      <section className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pencatatan data historis</p>
            <h2 id="legacy-withdrawal-title" className="mt-1 text-lg font-bold text-slate-900">Tutup Tabungan Lama — {member.name}</h2>
            <p className="mt-1 text-xs text-slate-600">Aksi ini langsung membuat Expense berstatus paid dan satu transaksi akuntansi.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Tutup">✕</button>
        </header>

        <form onSubmit={submit} className="overflow-y-auto p-5 sm:p-6">
          {error ? <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
          <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-3">
            <div><p className="text-xs text-blue-700">Periode Finance-approved</p><p className="font-semibold text-blue-950">{paidPeriodCount} periode</p></div>
            <div><label htmlFor="legacyGross" className="text-xs text-blue-700">Jumlah tabungan bruto</label><input id="legacyGross" type="number" min="1" value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold" required /></div>
            <div><p className="text-xs text-blue-700">Jumlah bersih ditransfer</p><p className="font-semibold text-emerald-800">Rp {Math.round(netAmount).toLocaleString("id-ID")}</p></div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Penalti<input type="number" min="0" value={penaltyAmount} onChange={(event) => setPenaltyAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Biaya antarbank<input type="number" min="0" value={bankFeeAmount} onChange={(event) => setBankFeeAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Tanggal transfer<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Akun bank sumber<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={loadingRefs} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required><option value="">Pilih akun Assets / bank</option>{assetGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.accounts.map((account) => <option key={account._id} value={account._id}>{account.accountCode ? `${account.accountCode} — ` : ""}{account.accountName}</option>)}</optgroup>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Nama pengirim / Finance<input value={paidBy} onChange={(event) => setPaidBy(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
            <label className="text-sm font-medium text-slate-700">Bank rekening tujuan<input value={destinationBank} onChange={(event) => setDestinationBank(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Nomor rekening tujuan<input value={destinationNumber} onChange={(event) => setDestinationNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Nama pemilik rekening<input value={destinationHolder} onChange={(event) => setDestinationHolder(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Alasan / catatan<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">Rincian kategori transaksi</h3><p className="text-xs text-slate-500">Total seluruh kategori wajib sama dengan jumlah bersih.</p></div>
              <button type="button" onClick={() => setLines((current) => [...current, { categoryId: "", description: "", amount: "" }])} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Tambah kategori</button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={`line-${index}`} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                  <select value={line.categoryId} onChange={(event) => updateLine(index, "categoryId", event.target.value)} disabled={loadingRefs} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required={index === 0}>
                    <option value="">Pilih kategori Expense</option>{expenseGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.accounts.map((account) => <option key={account._id} value={account._id}>{account.accountCode ? `${account.accountCode} — ` : ""}{account.accountName}</option>)}</optgroup>)}
                  </select>
                  <input type="number" min="1" step="1" value={line.amount} onChange={(event) => updateLine(index, "amount", event.target.value)} placeholder="Jumlah" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required={index === 0} />
                  <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40">Hapus</button>
                  <input value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="Catatan kategori (opsional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3" />
                </div>
              ))}
            </div>
            <p className={`mt-3 text-sm font-semibold ${balanced ? "text-emerald-700" : "text-rose-700"}`}>Total kategori: Rp {Math.round(lineTotal).toLocaleString("id-ID")} / Rp {Math.round(netAmount).toLocaleString("id-ID")} {balanced ? "· Seimbang" : "· Belum seimbang"}</p>
          </section>

          <label className="mt-5 block text-sm font-medium text-slate-700">Bukti transfer pencairan<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProofFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required /></label>

          <footer className="mt-6 flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={loadingRefs || submitting || !balanced || netAmount <= 0} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{loadingRefs ? "Memuat COA…" : submitting ? "Membukukan…" : "Konfirmasi & Catat Penutupan"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
