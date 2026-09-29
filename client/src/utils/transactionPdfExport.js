import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildTransactionPdf(rows = [], summary, metadata = {}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Laporan Transaksi Koperasi", margin, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Rekening: ${metadata.accountName || "Semua rekening"}`, margin, 52);
  doc.text(`Jumlah transaksi: ${summary?.transactionCount || 0}`, margin, 64);

  const filterText = metadata.filters?.length
    ? `Filter: ${metadata.filters.join(" | ")}`
    : "Filter: Tidak ada";
  const filterLines = doc.splitTextToSize(filterText, pageWidth - (margin * 2));
  doc.text(filterLines, margin, 76);

  const summaryLines = (summary?.totalsByCurrency || []).map((total) =>
    `${total.currency}: Deposit ${formatAmount(total.totalDeposit)} | Withdrawal ${formatAmount(total.totalWithdrawal)} | Neto ${formatAmount(total.net)}`
  );
  const summaryStartY = 76 + (filterLines.length * 10) + 2;
  if (summaryLines.length === 0) summaryLines.push("Ringkasan nominal: tidak ada transaksi.");
  doc.text(summaryLines, margin, summaryStartY);

  const startY = summaryStartY + (summaryLines.length * 10) + 8;
  const headers = [
    "Tanggal",
    "Keterangan",
    "Rekening",
    "Kategori / Split",
    "Tipe",
    "Nominal",
    "Saldo Berjalan",
    "Status Review",
  ];
  const body = rows.length
    ? rows.map((row) => [
      row.date,
      row.description,
      row.account,
      row.category,
      row.transactionType,
      `${row.currency || "Rp"} ${formatAmount(row.amount)}`,
      row.runningBalance === null || row.runningBalance === undefined
        ? "-"
        : `${row.currency || "Rp"} ${formatAmount(row.runningBalance)}`,
      row.reviewed,
    ])
    : [["Tidak ada transaksi yang cocok dengan filter.", "", "", "", "", "", "", ""]];

  autoTable(doc, {
    startY,
    head: [headers],
    body,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { minCellWidth: 50 },
      1: { minCellWidth: 130 },
      2: { minCellWidth: 80 },
      3: { minCellWidth: 115 },
      4: { minCellWidth: 44 },
      5: { minCellWidth: 75, halign: "right" },
      6: { minCellWidth: 82, halign: "right" },
      7: { minCellWidth: 70 },
    },
    margin: { left: margin, right: margin, bottom: 30 },
    didParseCell: (data) => {
      const balanceText = String(data.cell.raw || "");
      if (data.section === "body" && data.column.index === 6 && balanceText !== "-" && /\s-\d/.test(balanceText)) {
        data.cell.styles.textColor = [185, 28, 28];
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Dicetak ${new Date().toLocaleString("id-ID")}  |  Halaman ${page} dari ${pageCount}`, pageWidth - margin, pageHeight - 14, { align: "right" });
  }

  return doc;
}
