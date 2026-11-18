/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import {
  isLegacyWithdrawalLinesBalanced,
  normalizeLegacyWithdrawalLines,
} from "../utils/legacySavingsWithdrawalForm.js";

function ExpenseCategoryOptions({ expenseGroups }) {
  return expenseGroups.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.accounts.map((account) => (
        <option key={account._id} value={account._id}>
          {account.accountCode ? `${account.accountCode} — ` : ""}{account.accountName}
        </option>
      ))}
    </optgroup>
  ));
}

export default function LegacyWithdrawalAccountingSection({
  expenseGroups,
  loadingRefs,
  netAmount,
  onChange,
}) {
  const [mode, setMode] = useState("single");
  const [categoryId, setCategoryId] = useState("");
  const [lines, setLines] = useState([{ categoryId: "", description: "", amount: "" }]);

  const normalizedLines = useMemo(() => normalizeLegacyWithdrawalLines({
    mode,
    categoryId,
    netAmount,
    lines,
  }), [mode, categoryId, netAmount, lines]);
  const balanced = isLegacyWithdrawalLinesBalanced(normalizedLines, netAmount);
  const lineTotal = normalizedLines.reduce((sum, line) => sum + line.amount, 0);

  useEffect(() => {
    onChange(normalizedLines, balanced);
  }, [balanced, normalizedLines, onChange]);

  const updateLine = (index, key, value) => {
    setLines((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const enableSplit = () => {
    setLines([{ categoryId, description: "", amount: String(Math.round(netAmount)) }]);
    setMode("split");
  };

  const useSingleCategory = () => {
    const firstSelectedCategory = lines.find((line) => line.categoryId)?.categoryId || categoryId;
    setCategoryId(firstSelectedCategory);
    setMode("single");
  };

  return (
    <section className="mt-3 rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Kategori pembukuan *</h3>
          <p className="text-xs text-slate-500">Pilih kategori Expense sesuai arahan Finance. Nominal satu kategori otomatis sama dengan jumlah bersih.</p>
        </div>
        {mode === "single" ? (
          <button type="button" onClick={enableSplit} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Perlu pecah kategori?</button>
        ) : (
          <button type="button" onClick={useSingleCategory} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kembali ke satu kategori</button>
        )}
      </div>

      {mode === "single" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loadingRefs} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required>
            <option value="">Pilih kategori Expense</option>
            <ExpenseCategoryOptions expenseGroups={expenseGroups} />
          </select>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="block text-xs text-slate-500">Nominal otomatis</span>
            <span className="font-semibold text-slate-900">Rp {Math.round(netAmount).toLocaleString("id-ID")}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={`line-${index}`} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <select value={line.categoryId} onChange={(event) => updateLine(index, "categoryId", event.target.value)} disabled={loadingRefs} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required>
                <option value="">Pilih kategori Expense</option>
                <ExpenseCategoryOptions expenseGroups={expenseGroups} />
              </select>
              <input type="number" min="1" step="1" value={line.amount} onChange={(event) => updateLine(index, "amount", event.target.value)} placeholder="Nominal" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required />
              <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40">Hapus</button>
              <input value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="Catatan kategori (opsional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-3" />
            </div>
          ))}
          <button type="button" onClick={() => setLines((current) => [...current, { categoryId: "", description: "", amount: "" }])} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Tambah kategori</button>
        </div>
      )}

      <p className={`mt-3 text-sm font-semibold ${balanced ? "text-emerald-700" : "text-rose-700"}`}>
        Total pembukuan: Rp {Math.round(lineTotal).toLocaleString("id-ID")} / Rp {Math.round(netAmount).toLocaleString("id-ID")} {balanced ? "· Seimbang" : "· Pilih kategori dan pastikan nominal seimbang"}
      </p>
    </section>
  );
}
