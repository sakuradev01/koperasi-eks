import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecordLegacySavingsWithdrawal,
} from "../src/modules/savings-withdrawal/application/recordLegacyWithdrawal.js";

function makeHarness({ previous = null, transactionResult = { success: true, data: { _id: "transaction-1" } } } = {}) {
  const state = { request: null, expense: null, lines: [], proof: null, memberClosed: [], transactionCalls: [], cleanup: [] };
  const service = createRecordLegacySavingsWithdrawal({
    memberRepository: {
      findForWithdrawalById: async () => ({
        _id: "member-1", uuid: "JPSB123", name: "Siswa", bankName: "BCA", accountNumber: "111", accountHolderName: "Siswa",
        membershipStatus: "inactive",
        productId: { _id: "product-1", title: "Kouhai", termDuration: 36, depositAmount: 100 },
      }),
      markWithdrawalPaid: async (payload) => state.memberClosed.push(payload),
    },
    savingsRepository: { findForMember: async () => Array.from({ length: 12 }, (_, index) => ({ installmentPeriod: index + 1, type: "Setoran", amount: 100, status: "Approved" })) },
    withdrawalRepository: {
      findAnyByMember: async () => previous,
      create: async (data) => (state.request = { _id: "withdrawal-1", ...data }),
      save: async (item) => item,
      deleteById: async () => state.cleanup.push("withdrawal"),
    },
    expenseRepository: {
      assertAccountsExist: async () => true,
      create: async (data) => (state.expense = { _id: "expense-1", ...data }),
      createLines: async (_id, lines) => { state.lines = lines; },
      createPaymentProof: async (_id, filename, paidBy) => { state.proof = { filename, paidBy }; },
      deleteById: async () => state.cleanup.push("expense"),
      deleteLines: async () => state.cleanup.push("lines"),
      deletePaymentProofs: async () => state.cleanup.push("proofs"),
    },
    accountingGateway: {
      createTransactionFromExpense: async (expense, options) => {
        state.transactionCalls.push({ expense, options });
        return transactionResult;
      },
      deleteLinkedTransaction: async () => state.cleanup.push("transaction"),
    },
    clock: () => new Date("2026-10-29T00:00:00.000Z"),
    random: () => 0.123456,
  });
  return { state, service };
}

const input = {
  transferDate: "2025-08-20",
  accountId: "bank-account-id",
  paidBy: "Finance SAMIT",
  grossAmount: 1_200,
  penaltyAmount: 0,
  bankFeeAmount: 0,
  reason: "Catat penutupan tabungan lama",
  lines: [{ categoryId: "category-account-id", amount: 1_200, description: "Pencairan tabungan lama" }],
};
const proofFile = { filename: "legacy-proof.pdf" };

test("legacy Finance closure creates paid Expense and one withdrawal transaction", async () => {
  const { state, service } = makeHarness();
  const result = await service.execute({ memberId: "member-1", input, proofFile, actor: { id: "finance-1", name: "Finance" } });

  assert.equal(result.request.source, "admin_legacy");
  assert.equal(result.request.status, "paid");
  assert.equal(result.expense.status, "paid");
  assert.equal(result.expense.amount, 1_200);
  assert.equal(result.expense.expenseSource, "savings_withdrawal");
  assert.equal(state.transactionCalls.length, 1);
  assert.equal(state.memberClosed.length, 1);
});

test("legacy Finance closure rejects category lines that do not match net transfer", async () => {
  const { state, service } = makeHarness();
  await assert.rejects(
    service.execute({ memberId: "member-1", input: { ...input, lines: [{ categoryId: "category-account-id", amount: 1_000 }] }, proofFile }),
    /Total kategori harus sama dengan jumlah transfer/,
  );
  assert.equal(state.expense, null);
  assert.equal(state.transactionCalls.length, 0);
});

test("legacy Finance closure compensates linked records when accounting transaction fails", async () => {
  const { state, service } = makeHarness({ transactionResult: { success: false, message: "Category lines invalid" } });
  await assert.rejects(
    service.execute({ memberId: "member-1", input, proofFile }),
    /Category lines invalid/,
  );
  assert.deepEqual(state.cleanup, ["transaction", "expense", "withdrawal", "lines", "proofs"]);
});

test("legacy Finance closure rejects duplicate historical payouts", async () => {
  const { state, service } = makeHarness({ previous: { _id: "old-withdrawal", status: "paid" } });
  await assert.rejects(
    service.execute({ memberId: "member-1", input, proofFile }),
    /riwayat penutupan tabungan/,
  );
  assert.equal(state.expense, null);
});
