const invoiceExportColumns = [
  ["Customer", "customer"],
  ["Reff", "reff"],
  ["Invoice Number", "invoiceNumber"],
  ["Currency", "currency"],
  ["Issued Date", "issuedDate"],
  ["Invoice Total", "invoiceTotal"],
  ["Invoice Paid", "invoicePaid"],
  ["Invoice Due", "invoiceDue"],
  ["Due Date", "dueDate"],
  ["Status", "status"],
  ["Due Aging", "dueAging"],
  ["Invoice URL", "invoiceUrl"],
  ["Notes", "notes"],
];

const escapeTsvCell = (value) =>
  String(value ?? "")
    .replace(/[\t\n\r]+/g, " ")
    .trim();

export const buildInvoiceExportTsv = (rows = []) => {
  const header = invoiceExportColumns.map(([label]) => label).join("\t");
  const dataRows = rows.map((row) => invoiceExportColumns
    .map(([, key]) => escapeTsvCell(row[key]))
    .join("\t"));

  return `\uFEFF${[header, ...dataRows].join("\n")}`;
};
