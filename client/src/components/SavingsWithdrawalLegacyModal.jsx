/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from "react";
import { getAccountsByType, getAssetsAccounts } from "../api/accountingApi.jsx";
import api from "../api/index.jsx";
import LegacyWithdrawalAccountingSection from "./LegacyWithdrawalAccountingSection.jsx";

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
  const [accountingLines, setAccountingLines] = useState([]);
  const [accountingBalanced, setAccountingBalanced] = useState(false);
  const [expenseGroups, setExpenseGroups] = useState([]);
  const [assetGroups, setAssetGroups] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const netAmount = Math.max(0, Number(grossAmount || 0) - Number(penaltyAmount || 0) - Number(bankFeeAmount || 0));
  const handleAccountingChange = useCallback((nextLines, isBalanced) => {
    setAccountingLines(nextLines);
    setAccountingBalanced(isBalanced);
  }, []);

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

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!accountId || !paidBy.trim() || !proofFile || !transferDate) {
      setError("Akun sumber, nama pengirim, tanggal, dan bukti transfer wajib dilengkapi.");
      return;
    }
    if (!accountingBalanced) {
      setError("Total pembukuan harus sama dengan jumlah bersih yang ditransfer.");
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
    form.append("lines", JSON.stringify(accountingLines));
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
      <section className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pencatatan data historis</p>
            <h2 id="legacy-withdrawal-title" className="mt-1 text-lg font-bold text-slate-900">Tutup Tabungan Lama — {member.name}</h2>
            <p className="mt-1 text-xs text-slate-600">Isi data transfer dan kategori pembukuan. Sistem mencatat Expense paid serta satu transaksi akuntansi.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Tutup">✕</button>
        </header>

        <form onSubmit={submit} className="overflow-y-auto p-5 sm:p-6">
          {error ? <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-blue-700">Periode lunas</p><p className="font-semibold text-blue-950">{paidPeriodCount} periode</p></div>
              <label htmlFor="legacyGross" className="text-xs text-blue-700">Total tabungan bruto<input id="legacyGross" type="number" min="1" value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-base font-semibold text-slate-900" required /></label>
              <label className="text-xs text-blue-700">Penalti<input type="number" min="0" value={penaltyAmount} onChange={(event) => setPenaltyAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-base font-semibold text-slate-900" /></label>
              <label className="text-xs text-blue-700">Biaya antarbank<input type="number" min="0" value={bankFeeAmount} onChange={(event) => setBankFeeAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-base font-semibold text-slate-900" /></label>
            </div>
            <p className="mt-2 text-xs text-blue-800">Default penalti 6% berlaku sebelum 36 periode. Jika total bruto diubah, cek kembali nominal penalti sebelum menyimpan.</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 pt-3">
              <p className="text-sm font-medium text-blue-900">Jumlah bersih yang ditransfer</p>
              <p className="text-lg font-bold text-emerald-800">Rp {Math.round(netAmount).toLocaleString("id-ID")}</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Data transfer</h3>
            <p className="mb-3 text-xs text-slate-500">Isi berdasarkan bukti transfer yang akan diunggah.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Tanggal transfer *<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
              <label className="text-sm font-medium text-slate-700">Akun bank sumber *<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={loadingRefs} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required><option value="">Pilih akun yang dipakai transfer</option>{assetGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.accounts.map((account) => <option key={account._id} value={account._id}>{account.accountCode ? `${account.accountCode} — ` : ""}{account.accountName}</option>)}</optgroup>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Nama pengirim sesuai bukti *<input value={paidBy} onChange={(event) => setPaidBy(event.target.value)} placeholder="Nama pada bukti transfer" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
              <label className="text-sm font-medium text-slate-700">Bukti transfer *<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProofFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required /></label>
            </div>
          </section>

          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="text-xs font-semibold text-slate-500">Rekening tujuan dari profil anggota</p>
            <p className="mt-1 font-medium text-slate-800">{destinationBank || "Bank belum diisi"}{destinationNumber ? ` · ${destinationNumber}` : ""}</p>
            <p className="text-xs text-slate-600">Atas nama {destinationHolder || "belum diisi"}</p>
          </div>

          <details className="mt-3 rounded-xl border border-slate-200 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Ubah rekening tujuan / catatan (opsional)</summary>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Bank tujuan<input value={destinationBank} onChange={(event) => setDestinationBank(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Nomor rekening tujuan<input value={destinationNumber} onChange={(event) => setDestinationNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Nama pemilik rekening<input value={destinationHolder} onChange={(event) => setDestinationHolder(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Alasan / catatan<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            </div>
          </details>

          <LegacyWithdrawalAccountingSection
            expenseGroups={expenseGroups}
            loadingRefs={loadingRefs}
            netAmount={netAmount}
            onChange={handleAccountingChange}
          />

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Setelah disimpan, sistem langsung mencatat penutupan sebagai sudah dibayar, membuat Expense berstatus paid, dan satu transaksi akuntansi.
          </div>

          <footer className="mt-6 flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={loadingRefs || submitting || !accountingBalanced || netAmount <= 0} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{loadingRefs ? "Memuat COA…" : submitting ? "Membukukan…" : "Konfirmasi & Catat Penutupan"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
