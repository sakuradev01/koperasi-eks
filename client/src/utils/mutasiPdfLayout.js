export const sanitizeMutasiPdfText = (value, fallback = "-") => {
  const raw = value == null ? "" : String(value);
  const normalized = raw.normalize("NFKC");
  const withoutInvisibleCharacters = Array.from(normalized, (character) => {
    const codePoint = character.codePointAt(0);
    const isControlCharacter =
      codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    const isInvisibleCharacter =
      (codePoint >= 0x200b && codePoint <= 0x200d) || codePoint === 0xfeff;

    return isControlCharacter || isInvisibleCharacter ? " " : character;
  }).join("");
  const cleaned = withoutInvisibleCharacters
    .replace(/\s+/g, " ")
    .trim();

  return !cleaned || cleaned === "-" ? fallback : cleaned;
};

const splitPdfLines = (doc, value, width, fallback) => {
  const lines = doc.splitTextToSize(
    sanitizeMutasiPdfText(value, fallback),
    Math.max(width, 1)
  );

  return Array.isArray(lines) && lines.length > 0
    ? lines
    : [fallback];
};

export const renderMutasiAccountHeader = ({
  doc,
  member,
  pageNum,
  totalPages,
  currentMonth,
  currentYear,
  startY,
}) => {
  const pageWidth = doc.internal.pageSize.width;
  const marginX = 20;
  const columnGap = 4;
  const availableWidth = pageWidth - marginX * 2 - columnGap;
  const leftBoxWidth = availableWidth * 0.58;
  const rightBoxWidth = availableWidth - leftBoxWidth;
  const leftBoxX = marginX;
  const rightBoxX = leftBoxX + leftBoxWidth + columnGap;
  const horizontalPadding = 3;
  const verticalPadding = 4;
  const lineHeight = 4.5;
  const leftTextWidth = leftBoxWidth - horizontalPadding * 2;
  const rightTextWidth = rightBoxWidth - horizontalPadding * 2;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const memberName = splitPdfLines(
    doc,
    member?.name?.toUpperCase(),
    leftTextWidth,
    "NAMA TIDAK TERSEDIA"
  );
  const memberAddress =
    member?.completeAddress && String(member.completeAddress).trim() !== "-"
      ? member.completeAddress
      : member?.address;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const addressLines = splitPdfLines(
    doc,
    memberAddress,
    leftTextWidth,
    "ALAMAT TIDAK TERSEDIA"
  );
  const phoneLines = splitPdfLines(
    doc,
    member?.phone,
    leftTextWidth,
    "TELEPON TIDAK TERSEDIA"
  );
  const countryLines = ["INDONESIA"];

  const accountNumber =
    member?.accountNumber && String(member.accountNumber).trim() !== "-"
      ? member.accountNumber
      : null;
  const accountRows = [
    {
      label: "NO. REKENING",
      value: sanitizeMutasiPdfText(accountNumber, "TIDAK TERSEDIA"),
    },
    { label: "HALAMAN", value: `${pageNum} / ${totalPages}` },
    { label: "PERIODE", value: `${currentMonth} ${currentYear}` },
    { label: "MATA UANG", value: "IDR" },
  ];
  const className =
    member?.className ||
    member?.kelas ||
    member?.product?.name ||
    member?.productName;

  if (className) {
    accountRows.splice(1, 0, {
      label: "KELAS",
      value: sanitizeMutasiPdfText(className),
    });
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const labelWidth = Math.min(
    rightTextWidth * 0.48,
    Math.max(...accountRows.map((row) => doc.getTextWidth(`${row.label} :`))) + 3
  );
  const valueWidth = Math.max(rightTextWidth - labelWidth, 10);
  const wrappedAccountRows = accountRows.map((row) => ({
    ...row,
    lines: splitPdfLines(doc, row.value, valueWidth, "-"),
  }));

  const leftLineCount =
    memberName.length +
    addressLines.length +
    phoneLines.length +
    countryLines.length;
  const rightLineCount = wrappedAccountRows.reduce(
    (total, row) => total + Math.max(row.lines.length, 1),
    0
  );
  const contentLineCount = Math.max(leftLineCount, rightLineCount);
  const boxHeight = verticalPadding * 2 + contentLineCount * lineHeight;

  doc.setLineWidth(0.8);
  doc.setDrawColor(0, 0, 0);
  doc.rect(leftBoxX, startY, leftBoxWidth, boxHeight, "S");
  doc.rect(rightBoxX, startY, rightBoxWidth, boxHeight, "S");

  let leftY = startY + verticalPadding + lineHeight * 0.72;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  memberName.forEach((line) => {
    doc.text(line, leftBoxX + horizontalPadding, leftY);
    leftY += lineHeight;
  });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  [...addressLines, ...phoneLines, ...countryLines].forEach((line) => {
    doc.text(line, leftBoxX + horizontalPadding, leftY);
    leftY += lineHeight;
  });

  let rightY = startY + verticalPadding + lineHeight * 0.72;
  doc.setFontSize(8);
  wrappedAccountRows.forEach((row) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${row.label} :`, rightBoxX + horizontalPadding, rightY);
    doc.setFont("helvetica", "normal");
    row.lines.forEach((line, index) => {
      doc.text(
        line,
        rightBoxX + horizontalPadding + labelWidth,
        rightY + index * lineHeight
      );
    });
    rightY += Math.max(row.lines.length, 1) * lineHeight;
  });

  return startY + boxHeight;
};
