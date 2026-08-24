const asArray = (value) => (Array.isArray(value) ? value : []);

const asId = (value) => {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
};

const uniqueNumbers = (values) =>
  [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort(
    (left, right) => left - right,
  );

/**
 * Render a compact human-readable list of installment numbers.
 * Consecutive installments are represented as a range so a four-installment
 * payment is shown as "Cicilan 2–5" instead of repeating the same amount.
 */
export const formatProjectionNumberList = (projectionIndexes) => {
  const indexes = uniqueNumbers(projectionIndexes);
  if (!indexes.length) return "Pembayaran gabungan";

  const parts = [];
  let rangeStart = indexes[0];
  let rangeEnd = indexes[0];

  const flushRange = () => {
    parts.push(
      rangeStart === rangeEnd
        ? String(rangeStart)
        : `${rangeStart}–${rangeEnd}`,
    );
  };

  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] === rangeEnd + 1) {
      rangeEnd = indexes[index];
      continue;
    }
    flushRange();
    rangeStart = indexes[index];
    rangeEnd = indexes[index];
  }
  flushRange();

  return `Cicilan ${parts.join(", ")}`;
};

const getPaymentKey = (payment) => {
  const explicitId = asId(payment?._id);
  if (explicitId) return `id:${explicitId}`;

  const transactionId = asId(payment?.transactionId);
  if (transactionId) return `transaction:${transactionId}`;

  return [
    payment?.paymentDate || "",
    payment?.amount || "",
    asArray(payment?.coveredProjectionIds).map(asId).join(","),
    asArray(payment?.coveredProjectionBreakdown)
      .map((row) => `${asId(row?.projectionId)}:${row?.amount || ""}`)
      .join(","),
  ].join("|");
};

const getPaymentMarkerIndexes = (payment, projections) => {
  const coveredIds = asArray(payment?.coveredProjectionIds)
    .map(asId)
    .filter(Boolean);
  const breakdown = asArray(payment?.coveredProjectionBreakdown);
  const indexes = [];

  projections.forEach((projection, projectionOffset) => {
    const projectionId = asId(projection?._id);
    const projectionIndex = projectionOffset + 1;
    const coveredById = coveredIds.includes(projectionId);
    const coveredByBreakdown = breakdown.some(
      (row) =>
        (asId(row?.projectionId) && asId(row?.projectionId) === projectionId) ||
        (Number(row?.projectionIndex) || 0) === projectionIndex,
    );

    if (coveredById || coveredByBreakdown) indexes.push(projectionIndex);
  });

  return uniqueNumbers(indexes);
};

const hasMultipleProjectionMarkers = (payment) =>
  asArray(payment?.coveredProjectionIds).length > 1 ||
  asArray(payment?.coveredProjectionBreakdown).length > 1;

const getPaymentContributionAmount = (payment, projection, projectionIndex) => {
  const breakdown = asArray(payment?.coveredProjectionBreakdown);
  const projectionId = asId(projection?._id);
  const row = breakdown.find(
    (item) =>
      (asId(item?.projectionId) &&
        asId(item?.projectionId) === projectionId) ||
      (Number(item?.projectionIndex) || 0) === Number(projectionIndex),
  );

  if (row && Number.isFinite(Number(row.amount))) {
    return Number(row.amount);
  }

  return Number(payment?.amount || 0);
};

/**
 * Flatten the linked payment table while preserving projection row metadata.
 * A multi-cicilan payment is emitted once as an anchor row. If its occurrences
 * are contiguous and each covered projection has one realization, the anchor
 * may use a row span; otherwise later occurrences become a placeholder cell.
 */
export const buildLinkedPaymentDisplayRows = (projections = [], options = {}) => {
  const safeProjections = asArray(projections);
  const expandedPaymentKeys =
    options?.expandedPaymentKeys instanceof Set
      ? options.expandedPaymentKeys
      : new Set(asArray(options?.expandedPaymentKeys).map(asId));
  const rows = [];

  safeProjections.forEach((projection, projectionOffset) => {
    const projectionRealizations = asArray(projection?.realizations).filter(
      Boolean,
    );
    const realizations = projectionRealizations.length
      ? projectionRealizations
      : [null];

    realizations.forEach((payment, projectionRowIndex) => {
      rows.push({
        key: `${asId(projection?._id) || projectionOffset}:${
          getPaymentKey(payment) || "empty"
        }:${projectionRowIndex}`,
        projection,
        projectionIndex: projectionOffset + 1,
        projectionRowIndex,
        projectionRowCount: realizations.length,
        payment,
      });
    });
  });

  const paymentGroups = new Map();
  rows.forEach((row, rowIndex) => {
    if (!row.payment) return;
    const paymentKey = getPaymentKey(row.payment);
    if (!paymentGroups.has(paymentKey)) paymentGroups.set(paymentKey, []);
    paymentGroups.get(paymentKey).push(rowIndex);
  });

  const displayByRowIndex = new Map();
  paymentGroups.forEach((occurrenceRows, paymentKey) => {
    const firstRowIndex = occurrenceRows[0];
    const firstPayment = rows[firstRowIndex]?.payment;
    const markerIndexes = getPaymentMarkerIndexes(
      firstPayment,
      safeProjections,
    );
    const occurrenceProjectionIndexes = occurrenceRows.map(
      (rowIndex) => rows[rowIndex].projectionIndex,
    );
    const coverageIndexes = markerIndexes.length
      ? markerIndexes
      : uniqueNumbers(occurrenceProjectionIndexes);
    const isMultiProjection =
      hasMultipleProjectionMarkers(firstPayment) || occurrenceRows.length > 1;

    if (!isMultiProjection) {
      occurrenceRows.forEach((rowIndex) => {
        const row = rows[rowIndex];
        displayByRowIndex.set(rowIndex, {
          kind: "regular",
          rowSpan: 1,
          actionRowSpan:
            row.projectionRowIndex === 0 ? row.projectionRowCount : 0,
          paymentKey,
        });
      });
      return;
    }

    const contiguous = occurrenceRows.every(
      (rowIndex, occurrenceOffset) =>
        rowIndex === firstRowIndex + occurrenceOffset,
    );
    const startsEachProjection = occurrenceRows.every(
      (rowIndex) => rows[rowIndex].projectionRowIndex === 0,
    );
    const canRowSpan = contiguous && startsEachProjection;
    const label = formatProjectionNumberList(coverageIndexes);

    if (expandedPaymentKeys.has(paymentKey)) {
      occurrenceRows.forEach((rowIndex, occurrenceOffset) => {
        const row = rows[rowIndex];
        displayByRowIndex.set(rowIndex, {
          kind: "expanded",
          amount: getPaymentContributionAmount(
            row.payment,
            row.projection,
            row.projectionIndex,
          ),
          label,
          toggleAnchor: occurrenceOffset === 0,
          actionRowSpan:
            row.projectionRowIndex === 0 ? row.projectionRowCount : 0,
          paymentKey,
        });
      });
      return;
    }

    occurrenceRows.forEach((rowIndex, occurrenceOffset) => {
      const row = rows[rowIndex];
      if (occurrenceOffset === 0) {
        displayByRowIndex.set(rowIndex, {
          kind: "merged-anchor",
          rowSpan: canRowSpan ? occurrenceRows.length : 1,
          actionRowSpan:
            row.projectionRowIndex === 0
              ? canRowSpan
                ? occurrenceRows.length
                : row.projectionRowCount
              : 0,
          label,
          toggleAnchor: true,
          paymentKey,
        });
        return;
      }

      displayByRowIndex.set(
        rowIndex,
        canRowSpan
          ? { kind: "merged-rowspan", paymentKey }
          : {
              kind: "merged-placeholder",
              label,
              paymentKey,
              placeholderColSpan: row.projectionRowIndex === 0 ? 5 : 4,
            },
      );
    });
  });

  return rows.map((row, rowIndex) => ({
    ...row,
    paymentDisplay: row.payment
      ? displayByRowIndex.get(rowIndex) || {
          kind: "regular",
          rowSpan: 1,
          actionRowSpan: row.projectionRowIndex === 0 ? row.projectionRowCount : 0,
          paymentKey: getPaymentKey(row.payment),
        }
      : { kind: "empty", paymentKey: "" },
  }));
};
