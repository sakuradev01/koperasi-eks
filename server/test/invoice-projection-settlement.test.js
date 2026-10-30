import test from "node:test";
import assert from "node:assert/strict";

const loadSettlement = async () => {
  const module = await import(
    "../src/modules/invoice-projections/domain/projectionSettlement.js"
  ).catch(() => null);
  assert.ok(
    module?.paymentContributionToProjection,
    "invoice projection settlement should expose a payment contribution helper",
  );
  return module;
};

test("splits one payment across its explicit projection breakdown without double-counting", async () => {
  const { paymentContributionToProjection } = await loadSettlement();
  const payment = {
    amount: 11_408_000,
    coveredProjectionIds: ["p2", "p3", "p4", "p5"],
    coveredProjectionBreakdown: [
      { projectionId: "p2", projectionIndex: 2, amount: 2_852_000 },
      { projectionId: "p3", projectionIndex: 3, amount: 2_852_000 },
      { projectionId: "p4", projectionIndex: 4, amount: 2_852_000 },
      { projectionId: "p5", projectionIndex: 5, amount: 2_852_000 },
    ],
  };

  const contributions = ["p1", "p2", "p3", "p4", "p5"].map((id, index) =>
    paymentContributionToProjection(payment, { _id: id }, index + 1),
  );

  assert.deepEqual(contributions, [0, 2_852_000, 2_852_000, 2_852_000, 2_852_000]);
  assert.equal(contributions.reduce((sum, amount) => sum + amount, 0), payment.amount);
});

test("uses projectionId as source of truth and supports legacy projectionIndex", async () => {
  const { paymentContributionToProjection } = await loadSettlement();
  const linkedPayment = { amount: 75, projectionId: "p1", projectionIndex: 2 };
  const legacyPayment = { amount: 30, projectionIndex: 2 };

  assert.equal(paymentContributionToProjection(linkedPayment, { _id: "p1" }, 1), 75);
  assert.equal(paymentContributionToProjection(linkedPayment, { _id: "p2" }, 2), 0);
  assert.equal(paymentContributionToProjection(legacyPayment, { _id: "p2" }, 2), 30);
});

test("does not duplicate an ambiguous legacy multi-projection payment", async () => {
  const { paymentContributionToProjection } = await loadSettlement();
  const payment = { amount: 500, coveredProjectionIds: ["p1", "p2"] };

  assert.equal(paymentContributionToProjection(payment, { _id: "p1" }, 1), 0);
  assert.equal(paymentContributionToProjection(payment, { _id: "p2" }, 2), 0);
});
