import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSavingsWithdrawalBankFeeConfirmed,
  syncSavingsWithdrawalExpense,
  updateSavingsWithdrawalBankFee,
} from "../src/modules/savings-withdrawal/application/syncWithdrawalExpense.js";

function makeRequest(overrides = {}) {
  return {
    _id: "withdrawal-1",
    memberId: "member-1",
    expenseId: "expense-1",
    status: "submitted",
    openMemberId: "member-1",
    grossAmount: 10_000,
    penaltyAmount: 600,
    bankFeeAmount: 0,
    netAmount: 9_400,
    transitions: [],
    save: async function save() { return this; },
    ...overrides,
  };
}

test("Expense rejection records the reason and releases the student savings lock", async () => {
  const request = makeRequest();
  const result = await syncSavingsWithdrawalExpense({
    expense: { _id: "expense-1", savingsWithdrawalId: "withdrawal-1", status: "rejected", rejectReason: "Data rekening salah" },
    withdrawalRepository: {
      findById: async () => request,
      save: async (item) => item.save(),
      updateMemberPaid: async () => assert.fail("rejected request must not close member"),
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "Data rekening salah");
  assert.equal(result.openMemberId, undefined);
});

test("Expense is not synchronized to paid until its accounting transaction exists", async () => {
  const request = makeRequest({ status: "waiting_payment" });
  const result = await syncSavingsWithdrawalExpense({
    expense: { _id: "expense-1", savingsWithdrawalId: "withdrawal-1", status: "paid" },
    withdrawalRepository: {
      findById: async () => request,
      save: async (item) => item.save(),
      updateMemberPaid: async () => assert.fail("member must stay active until ledger is posted"),
    },
    transactionCreated: false,
  });

  assert.equal(result.status, "waiting_payment");
});

test("paid Expense closes the member only after ledger creation succeeds", async () => {
  const request = makeRequest({ status: "waiting_payment" });
  const closed = [];
  await syncSavingsWithdrawalExpense({
    expense: {
      _id: "expense-1",
      savingsWithdrawalId: "withdrawal-1",
      status: "paid",
      paidAt: new Date("2026-10-29T00:00:00.000Z"),
      paymentProofs: [{ fileName: "proof.pdf" }],
    },
    withdrawalRepository: {
      findById: async () => request,
      save: async (item) => item.save(),
      updateMemberPaid: async (input) => closed.push(input),
    },
    transactionCreated: true,
    actor: { id: "finance-1", name: "Finance" },
  });

  assert.equal(request.status, "paid");
  assert.deepEqual(request.paymentProofFiles, ["proof.pdf"]);
  assert.equal(request.openMemberId, undefined);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].memberId, "member-1");
});

test("does not mark withdrawal paid when the member record was not updated", async () => {
  const request = makeRequest({ status: "waiting_payment" });

  await assert.rejects(syncSavingsWithdrawalExpense({
    expense: {
      _id: "expense-1",
      savingsWithdrawalId: "withdrawal-1",
      status: "paid",
      paymentProof: "proof.pdf",
    },
    withdrawalRepository: {
      findById: async () => request,
      save: async (item) => item.save(),
      getMemberClosureState: async () => ({ membershipStatus: "active", membershipStatusWasSet: true }),
      updateMemberPaid: async () => ({ matchedCount: 0 }),
    },
    transactionCreated: true,
  }), /anggota tidak ditemukan/i);

  assert.equal(request.status, "waiting_payment");
  assert.equal(request.openMemberId, "member-1");
  assert.equal(request.paidMemberId, undefined);
});

test("bank fee can only be updated before Expense categorization and updates the net payout", async () => {
  const request = makeRequest();
  const result = await updateSavingsWithdrawalBankFee({
    requestId: "withdrawal-1",
    feeAmount: 50,
    withdrawalRepository: {
      findById: async () => request,
      updateBankFee: async ({ request: item, feeAmount }) => {
        item.bankFeeAmount = feeAmount;
        item.netAmount = item.grossAmount - item.penaltyAmount - feeAmount;
        return item;
      },
    },
  });

  assert.equal(result.bankFeeAmount, 50);
  assert.equal(result.netAmount, 9_350);
});

test("bank fee rejects invalid, negative, or BCA transfer charges", async () => {
  const request = makeRequest({ bankNameSnapshot: "Bank Central Asia (BCA)" });
  const repo = { findById: async () => request, updateBankFee: async () => assert.fail("must not update") };

  await assert.rejects(updateSavingsWithdrawalBankFee({ requestId: "withdrawal-1", feeAmount: -1, withdrawalRepository: repo }), /angka nol atau lebih/);
  await assert.rejects(updateSavingsWithdrawalBankFee({ requestId: "withdrawal-1", feeAmount: 1, withdrawalRepository: repo }), /tidak berlaku/);
});

test("non-BCA payout cannot be approved until a positive Finance-confirmed transfer fee is recorded", () => {
  const request = makeRequest({ bankNameSnapshot: "Bank Mandiri" });
  assert.throws(() => assertSavingsWithdrawalBankFeeConfirmed(request), /Konfirmasikan biaya transfer antarbank/);
  assert.throws(() => assertSavingsWithdrawalBankFeeConfirmed({
    ...request,
    bankFeeConfirmedAt: new Date(),
    bankFeeAmount: 0,
  }), /Konfirmasikan biaya transfer antarbank/);
  assert.equal(assertSavingsWithdrawalBankFeeConfirmed({
    ...request,
    bankFeeConfirmedAt: new Date(),
    bankFeeAmount: 6_500,
  }), true);
  assert.equal(assertSavingsWithdrawalBankFeeConfirmed({ bankNameSnapshot: "Bank Central Asia" }), true);
});
