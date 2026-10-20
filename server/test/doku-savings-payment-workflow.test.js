import test from "node:test";
import assert from "node:assert/strict";
import {
  createDokuSavingsPaymentWorkflow,
  normalizeWebhookAmount,
} from "../src/modules/savings/application/dokuSavingsPaymentWorkflow.js";

const invoiceNumber = "DTSTG2603009";
const activeMember = { _id: "member-1", uuid: "student-1", membershipStatus: "active" };

function makeHarness(overrides = {}) {
  const state = {
    intent: {
      _id: "intent-1",
      invoiceNumber,
      studentUuid: "student-1",
      savingsAmount: 1_000,
      donationAmount: 0,
      chargedAmount: 1_000,
      status: "Processing",
      processingAt: new Date("2026-10-19T03:00:00.000Z"),
    },
    claimed: true,
    member: activeMember,
    resetCount: 0,
    markedPaidAt: null,
    savingsCalls: [],
    donationCalls: [],
    legacyCalls: [],
    ...overrides,
  };

  const workflow = createDokuSavingsPaymentWorkflow({
    checkoutIntentRepository: {
      claim: async () => ({ intent: state.intent, claimed: state.claimed }),
      resetProcessing: async () => {
        state.resetCount += 1;
      },
      markPaid: async (intent, processedAt) => {
        state.markedPaidAt = processedAt;
        intent.status = "Paid";
        return intent;
      },
    },
    memberRepository: {
      findByUuid: async () => state.member,
    },
    paymentCreator: {
      createSavingsFromIntent: async (input) => {
        state.savingsCalls.push(input);
        return { _id: "saving-1" };
      },
      createDonationFromIntent: async (input) => {
        state.donationCalls.push(input);
        return input.intent.donationAmount > 0 ? { _id: "donation-1" } : null;
      },
      createLegacySaving: async (input) => {
        state.legacyCalls.push(input);
        return { saving: { _id: "legacy-saving-1" }, member: activeMember };
      },
    },
    clock: () => new Date("2026-10-19T03:00:00.000Z"),
  });

  return { state, workflow };
}

test("normalizes callback amount from numbers and formatted currency", () => {
  assert.equal(normalizeWebhookAmount(125_000), 125_000);
  assert.equal(normalizeWebhookAmount("Rp 125.000"), 125);
  assert.equal(normalizeWebhookAmount("invalid"), 0);
});

test("processes a claimed checkout intent and marks it paid", async () => {
  const { state, workflow } = makeHarness();

  const result = await workflow.process({
    invoiceNumber,
    amount: 1_000,
    channelId: "DOKU_CHECKOUT",
  });

  assert.equal(result.message, "Payment processed successfully");
  assert.equal(result.savingId, "saving-1");
  assert.equal(result.donationId, null);
  assert.equal(state.savingsCalls.length, 1);
  assert.equal(state.donationCalls.length, 1);
  assert.equal(state.resetCount, 0);
  assert.equal(state.intent.status, "Paid");
  assert.equal(state.markedPaidAt.toISOString(), "2026-10-19T03:00:00.000Z");
});

test("processes mixed savings and donation in a single intent", async () => {
  const intent = {
    _id: "intent-1",
    invoiceNumber,
    studentUuid: "student-1",
    savingsAmount: 1_000,
    donationAmount: 300,
    chargedAmount: 1_300,
    status: "Processing",
  };
  const { state, workflow } = makeHarness({ intent });

  const result = await workflow.process({
    invoiceNumber,
    amount: 1_300,
    channelId: "QRIS",
  });

  assert.equal(result.savingId, "saving-1");
  assert.equal(result.donationId, "donation-1");
  assert.equal(state.savingsCalls.length, 1);
  assert.equal(state.donationCalls.length, 1);
});

test("returns idempotent messages when an intent is already claimed or paid", async () => {
  const paidIntent = {
    _id: "intent-1",
    invoiceNumber,
    studentUuid: "student-1",
    savingsAmount: 1_000,
    donationAmount: 0,
    chargedAmount: 1_000,
    status: "Paid",
  };
  const paid = makeHarness({ intent: paidIntent, claimed: false });
  const busy = makeHarness({ claimed: false });

  const paidResult = await paid.workflow.process({ invoiceNumber, amount: 1_000 });
  const busyResult = await busy.workflow.process({ invoiceNumber, amount: 1_000 });

  assert.equal(paidResult.message, "Payment already processed");
  assert.equal(busyResult.message, "Payment is currently being processed");
  assert.equal(paid.state.savingsCalls.length, 0);
  assert.equal(busy.state.savingsCalls.length, 0);
});

test("releases an intent when callback amount does not match the charge", async () => {
  const { state, workflow } = makeHarness();

  await assert.rejects(
    workflow.process({ invoiceNumber, amount: 999 }),
    /Nominal callback tidak sesuai dengan checkout intent/,
  );

  assert.equal(state.resetCount, 1);
  assert.equal(state.savingsCalls.length, 0);
  assert.equal(state.intent.status, "Processing");
});

test("releases a claimed intent if its member cannot be found", async () => {
  const { state, workflow } = makeHarness({ member: null });

  await assert.rejects(
    workflow.process({ invoiceNumber, amount: 1_000 }),
    /Member not found for UUID: student-1/,
  );

  assert.equal(state.resetCount, 1);
  assert.equal(state.savingsCalls.length, 0);
});

test("releases a claimed savings intent for a non-active member", async () => {
  const { state, workflow } = makeHarness({
    member: { ...activeMember, membershipStatus: "draft" },
  });

  await assert.rejects(
    workflow.process({ invoiceNumber, amount: 1_000 }),
    /Tabungan Anda belum dibuka oleh tim Finance/,
  );

  assert.equal(state.resetCount, 1);
  assert.equal(state.savingsCalls.length, 0);
});

test("restores a claimed intent to pending after payment creation fails", async () => {
  const { state, workflow } = makeHarness();
  const failedWorkflow = createDokuSavingsPaymentWorkflow({
    checkoutIntentRepository: {
      claim: async () => ({ intent: state.intent, claimed: true }),
      resetProcessing: async () => {
        state.resetCount += 1;
      },
      markPaid: async () => {
        throw new Error("should not mark paid");
      },
    },
    memberRepository: {
      findByUuid: async () => activeMember,
    },
    paymentCreator: {
      createSavingsFromIntent: async () => {
        throw new Error("ledger source unavailable");
      },
      createDonationFromIntent: async () => null,
      createLegacySaving: async () => null,
    },
    clock: () => new Date("2026-10-19T03:00:00.000Z"),
  });

  await assert.rejects(
    failedWorkflow.process({ invoiceNumber, amount: 1_000 }),
    /ledger source unavailable/,
  );

  assert.equal(state.resetCount, 1);
});

test("uses the legacy invoice path when no checkout intent exists", async () => {
  const { state, workflow } = makeHarness({ intent: null });

  const result = await workflow.process({
    invoiceNumber: "SAV-student-1-P2-1700000000",
    amount: 1_000,
    channelId: "QRIS",
  });

  assert.equal(result.message, "Payment processed successfully");
  assert.equal(result.savingId, "legacy-saving-1");
  assert.equal(state.legacyCalls.length, 1);
  assert.equal(state.savingsCalls.length, 0);
});
