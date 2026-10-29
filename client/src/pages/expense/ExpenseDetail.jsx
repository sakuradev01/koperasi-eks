import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  approveExpenseApi,
  getExpenseDetailApi,
  markExpensePaidApi,
  rejectExpenseApi,
} from "../../api/accountingApi";
import {
  buildUploadUrl,
  expenseStatusClass,
  expenseStatusLabel,
  formatMoney,
  toDateInput,
} from "./utils";
import "./expense-common.css";
import "./expense-detail.css";

const FLOW = ["uncategorized", "pending", "waiting_approval", "approved", "waiting_payment", "paid"];

function isImageFile(fileName = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
}

export default function ExpenseDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paidByName: "",
    transferDate: new Date().toISOString().slice(0, 10),
    files: [],
  });

  const loadDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getExpenseDetailApi(id);
      if (!res?.success) throw new Error(res?.message || "Failed to load expense detail");
      setPayload(res.data);
      setPaymentForm((prev) => ({
        ...prev,
        paidByName: res.data?.paidBy || prev.paidByName,
        transferDate: toDateInput(res.data?.transferDate) || prev.transferDate,
      }));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load expense detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const status = payload?.status || "uncategorized";

  const canApprove = useMemo(
    () => ["uncategorized", "pending", "waiting_approval", "approved", "waiting_payment"].includes(status),
    [status]
  );

  const canReject = useMemo(() => ["uncategorized", "pending", "waiting_approval", "waiting_payment"].includes(status), [status]);

  const handleApprove = async () => {
    if (!payload?._id) return;

    if (status === "waiting_payment") {
      setShowPaymentForm(true);
      return;
    }

    setProcessing(true);
    setError("");
    try {
      const res = await approveExpenseApi(payload._id);
      if (!res?.success) throw new Error(res?.message || "Failed to approve expense");
      await loadDetail();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to approve expense");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!payload?._id) return;
    const reason = window.prompt("Masukkan alasan reject (minimal 5 karakter):", "");
    if (reason === null) return;

    setProcessing(true);
    setError("");
    try {
      const res = await rejectExpenseApi(payload._id, { reason });
      if (!res?.success) throw new Error(res?.message || "Failed to reject expense");
      await loadDetail();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to reject expense");
    } finally {
      setProcessing(false);
    }
  };

  const submitMarkPaid = async (event) => {
    event.preventDefault();
    if (!payload?._id) return;

    setProcessing(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("paid_by_name", paymentForm.paidByName);
      fd.append("transfer_date", paymentForm.transferDate);
      paymentForm.files.forEach((file) => fd.append("payment_proofs", file));

      const res = await markExpensePaidApi(payload._id, fd);
      if (!res?.success) throw new Error(res?.message || "Failed to mark expense as paid");

      setShowPaymentForm(false);
      await loadDetail();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to mark expense as paid");
    } finally {
      setProcessing(false);
    }
  };

  const getStepClass = (step) => {
    const currentIdx = FLOW.indexOf(status);
    const stepIdx = FLOW.indexOf(step);
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "todo";
  };

  if (loading) {
    return <div className="exp-card exp-sub">Loading expense detail...</div>;
  }

  if (!payload) {
    return <div className="exp-error">{error || "Expense tidak ditemukan."}</div>;
  }

  const lineTotal = (payload.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);

  return (
    <div className="exp-page">
      <div className="exp-card exp-header">
        <div>
          <h1>{payload.title || "Expense Detail"}</h1>
          <div className="exp-sub">ER-{String(payload._id).slice(-6).toUpperCase()} · {payload.applicantName || "-"}</div>
        </div>
        <div className="exp-actions">
          <span className={expenseStatusClass(status)}>{expenseStatusLabel(status)}</span>
          {canApprove ? (
            <button type="button" className="exp-btn" disabled={processing} onClick={handleApprove}>
              {status === "waiting_payment" ? "Mark Paid" : "Approve"}
            </button>
          ) : null}
          {canReject ? (
            <button type="button" className="exp-btn-danger" disabled={processing} onClick={handleReject}>
              Reject
            </button>
          ) : null}
          {!(["paid", "rejected"].includes(status) && payload.savingsWithdrawal) ? (
            <Link className="exp-btn-secondary" to={`/expense/edit/${payload._id}`}>
              Edit
            </Link>
          ) : null}
          <button type="button" className="exp-btn-ghost" onClick={() => navigate("/expense/report")}>
            Back
          </button>
        </div>
      </div>

      {error ? <div className="exp-error">{error}</div> : null}

      {payload.savingsWithdrawal ? (
        <section className="exp-card">
          <div className="exp-detail-section-title">Detail Pengajuan Tutup Tabungan</div>
          <div className="exp-grid">
            <div className="exp-grid-4"><span className="exp-label">No. Pengajuan</span><div>{payload.savingsWithdrawal.requestNumber || "-"}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Jenis simpanan</span><div>{payload.savingsWithdrawal.productNameSnapshot || "Simpanan"}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Periode lunas / kontrak</span><div>{payload.savingsWithdrawal.paidPeriodCount} / {payload.savingsWithdrawal.contractPeriodCount}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Saldo bruto</span><div className="exp-detail-money">{formatMoney(payload.savingsWithdrawal.grossAmount)}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Penalti</span><div>{formatMoney(payload.savingsWithdrawal.penaltyAmount)}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Biaya antarbank</span><div>{formatMoney(payload.savingsWithdrawal.bankFeeAmount)}</div></div>
            <div className="exp-grid-4"><span className="exp-label">Estimasi / total transfer</span><div className="exp-detail-money">{formatMoney(payload.savingsWithdrawal.netAmount)}</div></div>
            <div className="exp-grid-8"><span className="exp-label">Rekening tujuan</span><div>{payload.savingsWithdrawal.bankNameSnapshot || "-"} · {payload.savingsWithdrawal.accountNumberSnapshot || "-"} · a.n. {payload.savingsWithdrawal.accountHolderSnapshot || "-"}</div></div>
            <div className="exp-grid-12"><span className="exp-label">Alasan siswa</span><div>{payload.savingsWithdrawal.reason || "-"}</div></div>
            {status === "uncategorized" ? <div className="exp-grid-12 exp-sub">Pilih akun sumber dan rincian kategori melalui tombol Edit. Setelah kategori lengkap, proses persetujuan dapat dilanjutkan.</div> : null}
          </div>
        </section>
      ) : null}

      <div className="exp-grid">
        <div className="exp-grid-8">
          <div className="exp-card">
            <div className="exp-detail-section-title">Summary</div>
            <div className="exp-grid">
              <div className="exp-grid-6">
                <span className="exp-label">Applicant</span>
                <div>
                  {payload.applicantName || "-"}
                  <div className="exp-sub">{payload.applicantType === "member" ? "Member" : "Staff"}</div>
                </div>
              </div>
              <div className="exp-grid-6">
                <span className="exp-label">Date Range</span>
                <div>
                  {toDateInput(payload.dateStart) || "-"} - {toDateInput(payload.dateEnd) || "-"}
                </div>
              </div>
              <div className="exp-grid-4">
                <span className="exp-label">Seller</span>
                <div>{payload.seller || "-"}</div>
              </div>
              <div className="exp-grid-4">
                <span className="exp-label">Total</span>
                <div className="exp-detail-money">{formatMoney(payload.amount)}</div>
              </div>
              <div className="exp-grid-4">
                <span className="exp-label">Line Total</span>
                <div className="exp-detail-money">{formatMoney(lineTotal)}</div>
              </div>
              <div className="exp-grid-12">
                <span className="exp-label">Description</span>
                <div>{payload.description || "-"}</div>
              </div>
              <div className="exp-grid-12">
                <span className="exp-label">Payment Account</span>
                <div>
                  {payload.paymentAccount
                    ? `${payload.paymentAccount.accountName} (${payload.paymentAccount.accountCode || "-"})`
                    : "Belum dipilih"}
                </div>
              </div>
              {payload.linkedTransaction?._id ? (
                <div className="exp-grid-12">
                  <span className="exp-label">Linked Transaction</span>
                  <a
                    className="exp-link"
                    href={`/akuntansi/transaksi?highlight=${encodeURIComponent(payload.linkedTransaction._id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open transaction {String(payload.linkedTransaction._id).slice(-8)}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          <div className="exp-card">
            <div className="exp-detail-section-title">Expense Lines</div>
            {(payload.lines || []).length === 0 ? (
              <div className="exp-empty">No line items.</div>
            ) : (
              <table className="exp-detail-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.lines || []).map((line) => (
                    <tr key={line._id}>
                      <td>{line.accountName || "-"}</td>
                      <td>{line.description || "-"}</td>
                      <td className="num">{formatMoney(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="exp-card">
            <div className="exp-detail-section-title">Attachments</div>
            {(payload.attachments || []).length === 0 ? (
              <div className="exp-empty">No attachments.</div>
            ) : (
              <div className="exp-media-grid">
                {(payload.attachments || []).map((item) => {
                  const url = buildUploadUrl("expenses", item.fileName);
                  return (
                    <a key={item._id} href={url} target="_blank" rel="noreferrer" className="exp-media-item">
                      {isImageFile(item.fileName) ? (
                        <img src={url} alt={item.fileName} loading="lazy" />
                      ) : (
                        <div className="exp-media-file">{item.fileName}</div>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <div className="exp-card">
            <div className="exp-detail-section-title">Payment Proofs</div>
            {(payload.paymentProofs || []).length === 0 ? (
              <div className="exp-empty">No payment proofs.</div>
            ) : (
              <div className="exp-media-grid">
                {(payload.paymentProofs || []).map((item) => {
                  const url = buildUploadUrl("expense-payment-proofs", item.fileName);
                  return (
                    <a key={item._id} href={url} target="_blank" rel="noreferrer" className="exp-media-item">
                      {isImageFile(item.fileName) ? (
                        <img src={url} alt={item.fileName} loading="lazy" />
                      ) : (
                        <div className="exp-media-file">{item.fileName}</div>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="exp-grid-4">
          <div className="exp-card">
            <div className="exp-detail-section-title">Flow Tracking</div>
            <div className="exp-stepper">
              {FLOW.map((step, index) => (
                <div key={step} className={`exp-step ${getStepClass(step)}`}>
                  <div className="exp-step-index">{index + 1}</div>
                  <div className="exp-step-text">{expenseStatusLabel(step)}</div>
                </div>
              ))}
            </div>
          </div>

          {showPaymentForm ? (
            <div className="exp-card">
              <div className="exp-detail-section-title">Mark As Paid</div>
              <form onSubmit={submitMarkPaid} className="exp-detail-form">
                <label className="exp-label" htmlFor="paid-by-name">
                  Paid By
                </label>
                <input
                  id="paid-by-name"
                  className="exp-input"
                  value={paymentForm.paidByName}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      paidByName: event.target.value,
                    }))
                  }
                  required
                />

                <label className="exp-label" htmlFor="transfer-date">
                  Transfer Date
                </label>
                <input
                  id="transfer-date"
                  type="date"
                  className="exp-input"
                  value={paymentForm.transferDate}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      transferDate: event.target.value,
                    }))
                  }
                  required
                />

                <label className="exp-label" htmlFor="payment-proofs">
                  Payment Proofs
                </label>
                <input
                  id="payment-proofs"
                  type="file"
                  multiple
                  className="exp-input"
                  onChange={(event) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      files: Array.from(event.target.files || []),
                    }))
                  }
                  required
                />
                {paymentForm.files.length > 0 ? (
                  <div className="exp-sub">{paymentForm.files.length} file siap diupload</div>
                ) : null}

                <div className="exp-actions">
                  <button type="button" className="exp-btn-ghost" onClick={() => setShowPaymentForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="exp-btn" disabled={processing || paymentForm.files.length === 0}>
                    {processing ? "Processing..." : "Confirm Paid"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
