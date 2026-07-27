import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import toast from "react-hot-toast";
import { getAgedReceivablesReport } from "../../../api/accountingApi.jsx";
import "./aged-receivables.css";

const DEFAULT_BUCKETS = [
  { key: "notYetDue", label: "Belum Jatuh Tempo", shortLabel: "Not Yet Due" },
  { key: "days1to5", label: "1 - 5 Hari", shortLabel: "1-5" },
  { key: "days6to89", label: "6 - 89 Hari", shortLabel: "6-89" },
  { key: "days90to119", label: "90 - 119 Hari", shortLabel: "90-119" },
  { key: "days120to179", label: "120 - 179 Hari", shortLabel: "120-179" },
  { key: "days180plus", label: "180+ Hari (Red Debt)", shortLabel: "180+", danger: true },
];

const formatMoney = (value) => {
  const number = Number(value || 0);
  return `Rp${number.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatCompactMoney = (value) => {
  const number = Number(value || 0);
  return `Rp${number.toLocaleString("id-ID", {
    maximumFractionDigits: 0,
  })}`;
};

const todayInput = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildCsv = (report) => {
  const buckets = report?.buckets?.length ? report.buckets : DEFAULT_BUCKETS;
  const rows = [
    ["Aged Receivables"],
    ["As Of", report?.asOf || ""],
    [],
    [
      "Customer",
      "Customer Code",
      ...buckets.map((bucket) => bucket.label),
      "Total Unpaid",
      "Invoice Count",
      "Projection Count",
      "Payment Reputation",
    ],
  ];

  for (const row of report?.rows || []) {
    rows.push([
      row.customerName,
      row.customerCode,
      ...buckets.map((bucket) => row.buckets?.[bucket.key]?.amount || 0),
      row.totalUnpaid || 0,
      row.invoiceCount || 0,
      row.projectionCount || 0,
      row.paymentReputation?.label || "-",
    ]);
  }

  rows.push([]);
  rows.push([
    "Total Unpaid",
    "",
    ...buckets.map((bucket) => report?.totals?.buckets?.[bucket.key]?.amount || 0),
    report?.totals?.totalUnpaid || 0,
    report?.totals?.invoiceCount || 0,
    report?.totals?.projectionCount || 0,
  ]);

  rows.push([]);
  rows.push([
    "Detail",
    "Invoice",
    "Projection",
    "Due Date",
    "Days Overdue",
    "Amount",
    "Paid",
    "Remaining",
    "Bucket",
  ]);

  for (const row of report?.rows || []) {
    for (const bucket of buckets) {
      for (const detail of row.buckets?.[bucket.key]?.details || []) {
        rows.push([
          row.customerName,
          detail.invoiceNumber,
          `${detail.projectionIndex}. ${detail.projectionDescription}`,
          detail.dueDate,
          detail.daysOverdue,
          detail.amount,
          detail.paidAmount,
          detail.remainingAmount,
          detail.bucketLabel,
        ]);
      }
    }
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
};

const exportPdf = (report) => {
  const buckets = report?.buckets?.length ? report.buckets : DEFAULT_BUCKETS;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Aged Receivables", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`As of ${report?.asOf || "-"}`, 40, 62);
  doc.text(`Generated ${new Date().toLocaleString("id-ID")}`, pageWidth - 220, 62);

  doc.autoTable({
    startY: 86,
    head: [["Summary", "Value"]],
    body: [
      ["Total Unpaid", formatMoney(report?.totals?.totalUnpaid || 0)],
      ["Invoices", String(report?.totals?.invoiceCount || 0)],
      ["Projection Rows", String(report?.totals?.projectionCount || 0)],
    ],
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
    styles: { fontSize: 9, cellPadding: 6 },
    margin: { left: 40, right: pageWidth - 280 },
  });

  const head = [[
    "Customer",
    ...buckets.map((bucket) => bucket.shortLabel || bucket.label),
    "Total Unpaid",
    "Reputation",
  ]];
  const body = (report?.rows || []).map((row) => [
    row.customerName,
    ...buckets.map((bucket) => {
      const bucketData = row.buckets?.[bucket.key] || {};
      const countText = bucketData.projectionCount
        ? ` (${bucketData.projectionCount})`
        : "";
      return `${formatMoney(bucketData.amount || 0)}${countText}`;
    }),
    formatMoney(row.totalUnpaid || 0),
    row.paymentReputation?.label || "-",
  ]);
  body.push([
    "Total Unpaid",
    ...buckets.map((bucket) => {
      const bucketData = report?.totals?.buckets?.[bucket.key] || {};
      const countText = bucketData.projectionCount
        ? ` (${bucketData.projectionCount})`
        : "";
      return `${formatMoney(bucketData.amount || 0)}${countText}`;
    }),
    formatMoney(report?.totals?.totalUnpaid || 0),
    "",
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 22,
    head,
    body,
    theme: "grid",
    headStyles: { fillColor: [224, 242, 254], textColor: [17, 24, 39] },
    styles: { fontSize: 8, cellPadding: 5, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold" },
      [buckets.length + 1]: { fontStyle: "bold" },
    },
    didParseCell: (data) => {
      const dangerColumn = buckets.findIndex((bucket) => bucket.danger) + 1;
      if (dangerColumn > 0 && data.column.index === dangerColumn && data.section === "body") {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineWidth = 1;
      }
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`Aged_Receivables_${report?.asOf || todayInput()}.pdf`);
};

export default function AgedReceivables() {
  const [asOf, setAsOf] = useState(todayInput);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState("");

  const buckets = useMemo(
    () => (report?.buckets?.length ? report.buckets : DEFAULT_BUCKETS),
    [report],
  );

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAgedReceivablesReport({ asOf });
      if (!response?.success) {
        throw new Error(response?.message || "Gagal memuat aged receivables");
      }
      setReport(response.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || "Gagal memuat aged receivables");
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totals = report?.totals || {};
  const rows = report?.rows || [];

  const handleExportCsv = () => {
    if (!report) return;
    const blob = new Blob([`\ufeff${buildCsv(report)}`], {
      type: "text/csv;charset=utf-8;",
    });
    downloadBlob(blob, `Aged_Receivables_${report.asOf || asOf}.csv`);
    setExportOpen(false);
    toast.success("CSV aged receivables berhasil diunduh.");
  };

  const handleExportPdf = () => {
    if (!report) return;
    exportPdf(report);
    setExportOpen(false);
    toast.success("PDF aged receivables berhasil diunduh.");
  };

  const renderBucketCell = (row, bucket) => {
    const bucketData = row.buckets?.[bucket.key] || {};
    const amount = bucketData.amount || 0;
    const count = bucketData.projectionCount || 0;
    return (
      <td key={bucket.key} className={bucket.danger ? "ar-danger-cell" : ""}>
        {amount > 0 ? (
          <button
            type="button"
            className="ar-cell-button"
            onClick={() => setExpandedCustomer((current) => (current === row.customerId ? "" : row.customerId))}
          >
            <strong>{formatCompactMoney(amount)}</strong>
            <span>{count} projection{count === 1 ? "" : "s"}</span>
          </button>
        ) : (
          <div className="ar-empty-cell">
            <strong>{formatCompactMoney(0)}</strong>
            <span>0 projection</span>
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="ar-page">
      <div className="ar-header">
        <div>
          <p className="ar-eyebrow">Invoice Aging Report</p>
          <h1>Aged Receivables</h1>
          <p className="ar-subtitle">
            Piutang dihitung dari sisa projection invoice per tanggal laporan. Pembayaran maju masuk aman sebagai belum jatuh tempo, bukan overdue negatif.
          </p>
        </div>
        <div className="ar-export-wrap">
          <button
            type="button"
            className="ar-export-button"
            onClick={() => setExportOpen((value) => !value)}
            disabled={!report || loading}
          >
            Export <span>v</span>
          </button>
          {exportOpen ? (
            <div className="ar-export-menu">
              <button type="button" onClick={handleExportCsv}>Export CSV</button>
              <button type="button" onClick={handleExportPdf}>Export PDF</button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ar-filter-card">
        <label htmlFor="aged-as-of">As of</label>
        <input
          id="aged-as-of"
          type="date"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
        />
        <button type="button" onClick={loadReport} disabled={loading}>
          {loading ? "Updating..." : "Update Report"}
        </button>
      </div>

      {totals.legacyUnassignedPaid > 0 ? (
        <div className="ar-warning">
          Ada pembayaran legacy/unassigned sebesar {formatMoney(totals.legacyUnassignedPaid)}. Nilai ini tetap tercatat sebagai pembayaran invoice, tapi tidak dipakai menebak cicilan di aging.
        </div>
      ) : null}

      <div className="ar-summary-grid">
        <div className="ar-summary-card">
          <span>Total Unpaid</span>
          <strong>{formatMoney(totals.totalUnpaid || 0)}</strong>
        </div>
        <div className="ar-summary-card">
          <span>Invoices</span>
          <strong>{totals.invoiceCount || 0}</strong>
        </div>
        <div className="ar-summary-card">
          <span>Projection Rows</span>
          <strong>{totals.projectionCount || 0}</strong>
        </div>
        <div className="ar-summary-card danger">
          <span>Red Debt 180+</span>
          <strong>{formatMoney(totals.buckets?.days180plus?.amount || 0)}</strong>
        </div>
      </div>

      <div className="ar-table-card">
        <div className="ar-table-caption">Number of Days Overdue</div>
        <div className="ar-table-scroll">
          <table className="ar-table">
            <thead>
              <tr>
                <th className="ar-customer-head">Customer</th>
                {buckets.map((bucket) => (
                  <th key={bucket.key} className={bucket.danger ? "ar-danger-head" : "ar-bucket-head"}>
                    {bucket.label}
                  </th>
                ))}
                <th>Total Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={buckets.length + 2} className="ar-state-cell">Loading aged receivables...</td>
                </tr>
              ) : null}
              {!loading && !rows.length ? (
                <tr>
                  <td colSpan={buckets.length + 2} className="ar-state-cell">Tidak ada piutang unpaid per tanggal ini.</td>
                </tr>
              ) : null}
              {!loading && rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="ar-customer-cell">
                    <button
                      type="button"
                      onClick={() => setExpandedCustomer((current) => (current === row.customerId ? "" : row.customerId))}
                    >
                      <strong>{row.customerName}</strong>
                      <span>{row.customerCode || row.customerPhone || "-"}</span>
                      {row.paymentReputation?.label && row.paymentReputation.label !== "-" ? (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: "2px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "0.75em",
                            fontWeight: 600,
                            background:
                              row.paymentReputation.label === "Pembayaran Cepat"
                                ? "#d4edda"
                                : row.paymentReputation.label === "Tepat Waktu"
                                  ? "#fff3cd"
                                  : "#f8d7da",
                            color:
                              row.paymentReputation.label === "Pembayaran Cepat"
                                ? "#155724"
                                : row.paymentReputation.label === "Tepat Waktu"
                                  ? "#856404"
                                  : "#721c24",
                          }}
                        >
                          {row.paymentReputation.label}
                        </span>
                      ) : null}
                    </button>
                  </td>
                  {buckets.map((bucket) => renderBucketCell(row, bucket))}
                  <td className="ar-total-cell">
                    <strong>{formatMoney(row.totalUnpaid || 0)}</strong>
                    <span>{row.invoiceCount || 0} invoice{row.invoiceCount === 1 ? "" : "s"}</span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length ? (
                <tr className="ar-total-row">
                  <td>Total Unpaid</td>
                  {buckets.map((bucket) => {
                    const bucketData = totals.buckets?.[bucket.key] || {};
                    return (
                      <td key={bucket.key} className={bucket.danger ? "ar-danger-cell" : ""}>
                        <strong>{formatMoney(bucketData.amount || 0)}</strong>
                        <span>{bucketData.projectionCount || 0} projections</span>
                      </td>
                    );
                  })}
                  <td>
                    <strong>{formatMoney(totals.totalUnpaid || 0)}</strong>
                    <span>{totals.invoiceCount || 0} invoices</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {expandedCustomer ? (
        <div className="ar-detail-panel">
          <div className="ar-detail-header">
            <div>
              <span>Detail Projection</span>
              <strong>{rows.find((row) => row.customerId === expandedCustomer)?.customerName || "Customer"}</strong>
            </div>
            <button type="button" onClick={() => setExpandedCustomer("")}>Close</button>
          </div>
          <div className="ar-detail-list">
            {buckets.flatMap((bucket) => {
              const row = rows.find((item) => item.customerId === expandedCustomer);
              return (row?.buckets?.[bucket.key]?.details || []).map((detail) => (
                <div key={`${detail.invoiceNumber}-${detail.projectionId}`} className="ar-detail-item">
                  <div>
                    <strong>{detail.invoiceNumber} - Cicilan {detail.projectionIndex}</strong>
                    <span>{detail.projectionDescription}</span>
                  </div>
                  <div>
                    <span>Due</span>
                    <strong>{detail.dueDate}</strong>
                  </div>
                  <div>
                    <span>Aging</span>
                    <strong className={detail.daysOverdue > 0 ? "ar-overdue" : ""}>
                      {detail.daysOverdue > 0 ? `${detail.daysOverdue} hari telat` : `${Math.abs(detail.daysOverdue)} hari lagi`}
                    </strong>
                  </div>
                  <div>
                    <span>Remaining</span>
                    <strong>{formatMoney(detail.remainingAmount)}</strong>
                  </div>
                </div>
              ));
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
