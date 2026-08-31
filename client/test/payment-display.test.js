import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import {
  buildLinkedPaymentDisplayRows,
  formatPaymentBadgeLabel,
} from "../src/pages/invoice/paymentDisplay.js";

const multiPayment = {
  _id: "payment-1",
  paymentDate: "2025-12-26",
  amount: 11408000,
  coveredProjectionIds: ["p2", "p3", "p4", "p5"],
  coveredProjectionBreakdown: [
    { projectionId: "p2", projectionIndex: 2, amount: 2852000 },
    { projectionId: "p3", projectionIndex: 3, amount: 2852000 },
    { projectionId: "p4", projectionIndex: 4, amount: 2852000 },
    { projectionId: "p5", projectionIndex: 5, amount: 2852000 },
  ],
};

const projection = (id, realization = null) => ({
  _id: id,
  description: `Cicilan ${id.slice(1)}`,
  realizations: realization ? [realization] : [],
});

test("merges one payment covering consecutive cicilan rows", () => {
  const rows = buildLinkedPaymentDisplayRows([
    projection("p1"),
    projection("p2", multiPayment),
    projection("p3", multiPayment),
    projection("p4", multiPayment),
    projection("p5", multiPayment),
  ]);

  const paymentRows = rows.filter((row) => row.payment);

  assert.equal(paymentRows.length, 4);
  assert.equal(paymentRows[0].paymentDisplay.kind, "merged-anchor");
  assert.equal(paymentRows[0].paymentDisplay.label, "Cicilan 2–5");
  assert.equal(paymentRows[0].paymentDisplay.rowSpan, 4);
  assert.deepEqual(
    paymentRows.slice(1).map((row) => row.paymentDisplay.kind),
    ["merged-rowspan", "merged-rowspan", "merged-rowspan"],
  );
});

test("does not row-span a merged payment across non-contiguous rows", () => {
  const rows = buildLinkedPaymentDisplayRows([
    projection("p1"),
    projection("p2", multiPayment),
    projection("p3"),
    projection("p4", multiPayment),
  ]);

  const paymentRows = rows.filter((row) => row.payment);

  assert.equal(paymentRows[0].paymentDisplay.kind, "merged-anchor");
  assert.equal(paymentRows[0].paymentDisplay.rowSpan, 1);
  assert.equal(paymentRows[1].paymentDisplay.kind, "merged-placeholder");
  assert.equal(paymentRows[1].paymentDisplay.placeholderColSpan, 5);
});

test("keeps a single-projection payment as a regular realization", () => {
  const payment = {
    _id: "payment-single",
    amount: 2852000,
    projectionId: "p2",
    projectionIndex: 2,
  };
  const rows = buildLinkedPaymentDisplayRows([
    projection("p1"),
    projection("p2", payment),
  ]);

  const paymentRow = rows.find((row) => row.payment);
  assert.equal(paymentRow.paymentDisplay.kind, "regular");
  assert.equal(paymentRow.paymentDisplay.rowSpan, 1);
});

test("expands a merged payment into per-cicilan details", () => {
  const rows = buildLinkedPaymentDisplayRows(
    [
      projection("p1"),
      projection("p2", multiPayment),
      projection("p3", multiPayment),
      projection("p4", multiPayment),
      projection("p5", multiPayment),
    ],
    { expandedPaymentKeys: new Set(["id:payment-1"]) },
  );

  const paymentRows = rows.filter((row) => row.payment);

  assert.deepEqual(
    paymentRows.map((row) => row.paymentDisplay.kind),
    ["expanded", "expanded", "expanded", "expanded"],
  );
  assert.deepEqual(
    paymentRows.map((row) => row.paymentDisplay.amount),
    [2852000, 2852000, 2852000, 2852000],
  );
  assert.equal(paymentRows[0].paymentDisplay.toggleAnchor, true);
  assert.equal(paymentRows[1].paymentDisplay.toggleAnchor, false);
});

test("keeps a merged payment badge as one complete readable label", () => {
  const label = formatPaymentBadgeLabel({
    paymentDisplay: {
      kind: "merged-anchor",
      label: "Cicilan 5–6",
    },
    projectionIndex: 5,
    projectionRowIndex: 0,
  });

  assert.equal(label, "Cicilan 5–6");
  assert.equal(label.includes("\n"), false);
});

test("uses a non-clipping single-line layout for merged payment badges", () => {
  const css = readFileSync(
    new URL("../src/pages/invoice/invoice.css", import.meta.url),
    "utf8",
  );
  const paymentBadgeRule = postcss
    .parse(css)
    .nodes.find((node) => node.selector === ".inv-payment-badge");
  const declarations = Object.fromEntries(
    (paymentBadgeRule?.nodes || [])
      .filter((node) => node.type === "decl")
      .map((node) => [node.prop, node.value]),
  );

  assert.equal(declarations.height, "auto");
  assert.equal(declarations["white-space"], "nowrap");
});
