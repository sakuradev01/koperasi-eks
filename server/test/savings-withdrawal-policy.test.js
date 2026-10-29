import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSavingsWithdrawalSnapshot,
} from "../src/modules/savings-withdrawal/domain/withdrawalPolicy.js";

const savingRows = (periodCount, amount = 100) =>
  Array.from({ length: periodCount }, (_, index) => ({
    type: "Setoran",
    installmentPeriod: index + 1,
    amount,
    status: "Approved",
  }));

const product = { termDuration: 36, depositAmount: 100 };

test("requires twelve distinct Finance-approved fully-paid periods", () => {
  const eleven = calculateSavingsWithdrawalSnapshot({
    product,
    savings: savingRows(11),
  });
  const twelve = calculateSavingsWithdrawalSnapshot({
    product,
    savings: savingRows(12),
  });

  assert.equal(eleven.paidPeriodCount, 11);
  assert.equal(eleven.canRequest, false);
  assert.equal(twelve.paidPeriodCount, 12);
  assert.equal(twelve.canRequest, true);
  assert.equal(twelve.withdrawalType, "early");
});

test("counts multiple approved transfers toward one period only once", () => {
  const savings = [
    ...savingRows(10),
    { type: "Setoran", installmentPeriod: 11, amount: 40, status: "Approved" },
    { type: "Setoran", installmentPeriod: 11, amount: 60, status: "Partial" },
  ];
  const snapshot = calculateSavingsWithdrawalSnapshot({ product, savings });

  assert.equal(snapshot.paidPeriodCount, 11);
  assert.equal(snapshot.canRequest, false);
});

test("excludes pending, rejected, withdrawals, and underpaid periods from paid-period count", () => {
  const savings = [
    ...savingRows(10),
    { type: "Setoran", installmentPeriod: 11, amount: 100, status: "Pending" },
    { type: "Setoran", installmentPeriod: 12, amount: 100, status: "Rejected" },
    { type: "Penarikan", installmentPeriod: 13, amount: 100, status: "Approved" },
  ];
  const snapshot = calculateSavingsWithdrawalSnapshot({ product, savings });

  assert.equal(snapshot.paidPeriodCount, 10);
  assert.equal(snapshot.canRequest, false);
});

test("uses shared carry-forward math when determining paid periods", () => {
  const savings = [
    { type: "Setoran", installmentPeriod: 1, amount: 201, status: "Approved" },
    ...Array.from({ length: 10 }, (_, index) => ({
      type: "Setoran",
      installmentPeriod: index + 3,
      amount: 100,
      status: "Approved",
    })),
  ];
  const snapshot = calculateSavingsWithdrawalSnapshot({ product, savings });

  assert.equal(snapshot.paidPeriodCount, 12);
  assert.equal(snapshot.canRequest, true);
});

test("deducts the 6 percent early penalty and an actual bank fee from net payout", () => {
  const snapshot = calculateSavingsWithdrawalSnapshot({
    product,
    savings: savingRows(12),
    bankFeeAmount: 2,
  });

  assert.equal(snapshot.grossBalance, 1_200);
  assert.equal(snapshot.penaltyAmount, 72);
  assert.equal(snapshot.bankFeeAmount, 2);
  assert.equal(snapshot.netAmount, 1_126);
});

test("does not apply early penalty at 36 paid periods", () => {
  const snapshot = calculateSavingsWithdrawalSnapshot({
    product,
    savings: savingRows(36),
  });

  assert.equal(snapshot.paidPeriodCount, 36);
  assert.equal(snapshot.withdrawalType, "completed");
  assert.equal(snapshot.penaltyAmount, 0);
  assert.equal(snapshot.netAmount, snapshot.grossBalance);
});

test("subtracts previously paid withdrawals from the available gross balance", () => {
  const snapshot = calculateSavingsWithdrawalSnapshot({
    product,
    savings: [
      ...savingRows(12),
      { type: "Penarikan", installmentPeriod: 1, amount: 50, status: "Approved" },
    ],
  });

  assert.equal(snapshot.paidPeriodCount, 12);
  assert.equal(snapshot.grossBalance, 1_150);
});
