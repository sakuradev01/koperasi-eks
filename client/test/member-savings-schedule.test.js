import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberSavingsPeriodRows } from "../src/utils/memberSavingsSchedule.js";

const member = {
  createdAt: "2025-01-01T00:00:00.000Z",
  hasUpgraded: false,
  product: {
    depositAmount: 2_500_000,
    termDuration: 7,
  },
};

const saving = (installmentPeriod, amount, status = "Approved", savingsDate = "2025-01-01") => ({
  installmentPeriod,
  amount,
  status,
  type: "Setoran",
  savingsDate,
});

test("carries every rupiah of approved overpayment into the next period target", () => {
  const periods = buildMemberSavingsPeriodRows({
    member,
    savings: [
      saving(1, 2_500_068),
      saving(2, 2_500_062),
      saving(3, 2_500_062),
      saving(3, 2_500_000, "Rejected", "2025-03-02"),
      saving(4, 2_500_072),
      saving(5, 2_500_053),
      saving(6, 2_500_000),
    ],
  });

  assert.equal(periods[6].requiredAmount, 2_499_683);
  assert.equal(periods[6].remainingAmount, 2_499_683);
  assert.equal(periods[6].creditApplied, 317);
});

test("keeps a fully paid period paid despite a separate rejected attempt", () => {
  const periods = buildMemberSavingsPeriodRows({
    member,
    savings: [
      saving(1, 2_500_000),
      saving(2, 2_500_062),
      saving(3, 2_500_062),
      saving(3, 2_500_000, "Rejected", "2025-03-02"),
    ],
  });

  assert.equal(periods[2].status, "paid");
  assert.equal(periods[2].totalPaid, 2_500_062);
  assert.equal(periods[2].remainingAmount, 0);
});

test("shows rejected when a period has no accepted or pending payment", () => {
  const periods = buildMemberSavingsPeriodRows({
    member,
    savings: [saving(1, 2_500_000, "Rejected")],
  });

  assert.equal(periods[0].status, "rejected");
  assert.equal(periods[0].totalPaid, 0);
  assert.equal(periods[0].remainingAmount, 2_500_000);
});
