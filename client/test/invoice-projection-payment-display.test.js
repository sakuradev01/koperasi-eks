import test from "node:test";
import assert from "node:assert/strict";
import {
  formatInvoiceProjectionPaymentContext,
  formatInvoiceProjectionPaymentDates,
} from "../src/utils/invoiceProjectionPaymentDisplay.js";

const earlyBatchRow = {
  rowType: "projection",
  status: "Paid",
  currency: "IDR",
  periodPaymentDetails: [{
    paymentDate: "2026-08-24",
    allocatedAmount: 3_242_857,
    transferAmount: 12_971_428,
    coveredProjectionIndexes: [4, 5, 6, 7],
    coveredProjectionLabel: "Cicilan 4–7",
    daysEarly: 19,
  }],
  priorPaymentDetails: [],
};

test("shows a batched payment once as a transfer reference and marks this installment as paid early", () => {
  assert.equal(formatInvoiceProjectionPaymentDates(earlyBatchRow), "24 Agu 2026");
  assert.equal(
    formatInvoiceProjectionPaymentContext(earlyBatchRow),
    "Batch Cicilan 4–7 · total transfer IDR 12.971.428 · alokasi IDR 3.242.857 · 19 hari lebih awal",
  );
});

test("distinguishes installments paid before the selected monthly period", () => {
  const row = {
    ...earlyBatchRow,
    periodPaymentDetails: [],
    priorPaymentDetails: [{
      paymentDate: "2026-08-24",
      allocatedAmount: 3_242_857,
      transferAmount: 12_971_428,
      coveredProjectionIndexes: [4, 5, 6, 7],
      coveredProjectionLabel: "Cicilan 4–7",
      daysEarly: 49,
    }],
  };

  assert.equal(formatInvoiceProjectionPaymentDates(row), "24 Agu 2026 (sebelum periode)");
  assert.equal(
    formatInvoiceProjectionPaymentContext(row),
    "Pembayaran sebelum periode · Batch Cicilan 4–7 · total transfer IDR 12.971.428 · alokasi IDR 3.242.857 · 49 hari lebih awal",
  );
});

test("explains empty and unallocated payment rows without implying an installment was paid", () => {
  assert.equal(formatInvoiceProjectionPaymentContext({ rowType: "projection", status: "Sent" }), "Belum ada pembayaran pada periode ini");
  assert.equal(formatInvoiceProjectionPaymentContext({ rowType: "unallocated" }), "Pembayaran belum dialokasikan ke cicilan");
});

test("does not call a payment on time when the projection date is missing", () => {
  const row = {
    ...earlyBatchRow,
    periodPaymentDetails: [{
      paymentDate: "2026-08-24",
      allocatedAmount: 3_242_857,
      transferAmount: 3_242_857,
      coveredProjectionIndexes: [4],
      daysEarly: null,
    }],
  };

  const context = formatInvoiceProjectionPaymentContext(row);
  assert.match(context, /alokasi IDR 3\.242\.857/);
  assert.doesNotMatch(context, /Tepat tanggal jatuh tempo/);
});
