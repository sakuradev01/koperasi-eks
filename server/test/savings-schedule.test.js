import test from "node:test";
import assert from "node:assert/strict";
import { calculateSavingsSchedule } from "../src/services/savingsSchedule.service.js";

const saving = (installmentPeriod, amount, status = "Approved", productId = "old") => ({
  installmentPeriod,
  amount,
  status,
  type: "Setoran",
  productId,
});

test("sums approved and partial payments in one period", () => {
  const result = calculateSavingsSchedule({
    termDuration: 2,
    baseDeposit: 2_500_000,
    savings: [
      saving(1, 1_000_000, "Partial"),
      saving(1, 1_500_000, "Approved"),
    ],
  });

  assert.equal(result.periods[0].paid, 2_500_000);
  assert.equal(result.periods[0].isFullyPaid, true);
  assert.equal(result.periods[0].remaining, 0);
});

test("carries only overpayments at or above Rp30.000 to the next period", () => {
  const result = calculateSavingsSchedule({
    termDuration: 3,
    baseDeposit: 2_500_000,
    savings: [
      saving(1, 2_700_000),
      saving(2, 2_300_000),
    ],
  });

  assert.equal(result.periods[0].overpayment, 200_000);
  assert.equal(result.periods[1].creditApplied, 200_000);
  assert.equal(result.periods[1].effectiveTarget, 2_300_000);
  assert.equal(result.periods[1].isFullyPaid, true);
});

test("does not create credit for small rounding differences", () => {
  const result = calculateSavingsSchedule({
    termDuration: 2,
    baseDeposit: 2_500_000,
    savings: [
      saving(1, 2_520_000),
      saving(2, 2_480_000),
    ],
  });

  assert.equal(result.periods[0].overpayment, 20_000);
  assert.equal(result.periods[1].creditApplied, 0);
  assert.equal(result.periods[1].remaining, 20_000);
  assert.equal(result.periods[1].isFullyPaid, false);
});

test("marks a later period fully paid when carried credit closes it", () => {
  const result = calculateSavingsSchedule({
    termDuration: 3,
    baseDeposit: 2_500_000,
    savings: [saving(1, 5_000_000)],
  });

  assert.equal(result.periods[1].creditApplied, 2_500_000);
  assert.equal(result.periods[1].effectiveTarget, 0);
  assert.equal(result.periods[1].isFullyPaid, true);
  assert.equal(result.periods[2].isFullyPaid, false);
});

test("uses old and new targets around an upgrade", () => {
  const result = calculateSavingsSchedule({
    termDuration: 4,
    baseDeposit: 2_500_000,
    upgrade: {
      completedPeriodsAtUpgrade: 2,
      oldMonthlyDeposit: 2_500_000,
      newPaymentWithCompensation: 3_000_000,
    },
    savings: [
      saving(1, 2_500_000),
      saving(2, 2_500_500),
      saving(3, 3_000_000),
    ],
  });

  assert.equal(result.periods[0].baseTarget, 2_500_000);
  assert.equal(result.periods[1].baseTarget, 2_500_000);
  assert.equal(result.periods[2].baseTarget, 3_000_000);
  assert.equal(result.periods[2].isFullyPaid, true);
});
