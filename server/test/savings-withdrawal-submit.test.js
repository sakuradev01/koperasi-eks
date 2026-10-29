import test from "node:test";
import assert from "node:assert/strict";
import {
  createSubmitSavingsWithdrawal,
  SavingsWithdrawalError,
} from "../src/modules/savings-withdrawal/application/submitWithdrawal.js";

const member = {
  _id: "member-1",
  uuid: "JPSB123",
  name: "Siswa Contoh",
  membershipStatus: "active",
  bankName: "BCA",
  accountNumber: "123456",
  accountHolderName: "Siswa Contoh",
  productId: { _id: "product-1", title: "Paket Kouhai", termDuration: 36, depositAmount: 100 },
};
const savings = Array.from({ length: 12 }, (_, index) => ({
  installmentPeriod: index + 1,
  amount: 100,
  type: "Setoran",
  status: "Approved",
}));

function makeHarness({ enabled = true, openRequest = null, memberRecord = member, savingsRows = savings, expenseFailure = null, attachFailure = false } = {}) {
  const state = { requests: [], expenses: [], deletedRequests: [], deletedExpenses: [] };
  const submit = createSubmitSavingsWithdrawal({
    settingsRepository: { getStudentRequestSetting: async () => ({ studentRequestEnabled: enabled }) },
    memberRepository: { findForWithdrawal: async () => memberRecord },
    savingsRepository: { findForMember: async () => savingsRows },
    withdrawalRepository: {
      findOpenByMember: async () => openRequest,
      create: async (data) => {
        const created = { _id: `withdrawal-${state.requests.length + 1}`, ...data };
        state.requests.push(created);
        return created;
      },
      attachExpense: async (requestId, expenseId) => {
        if (attachFailure) return null;
        const request = state.requests.find((item) => item._id === requestId);
        request.expenseId = expenseId;
        return request;
      },
      deleteById: async (id) => { state.deletedRequests.push(id); },
    },
    expenseRepository: {
      create: async (data) => {
        if (expenseFailure) throw expenseFailure;
        const created = { _id: `expense-${state.expenses.length + 1}`, ...data };
        state.expenses.push(created);
        return created;
      },
      deleteById: async (id) => { state.deletedExpenses.push(id); },
    },
    clock: () => new Date("2026-10-29T00:00:00.000Z"),
    random: () => 0.123456,
  });
  return { state, submit };
}

test("creates one uncategorized member Expense and snapshots the early-withdrawal policy", async () => {
  const { state, submit } = makeHarness();

  const result = await submit.execute({
    memberId: member._id,
    input: { withdrawalMonth: 12, withdrawalYear: 2026, reason: "Pulang ke Indonesia", policyAccepted: true },
  });

  assert.equal(result.request.status, "submitted");
  assert.equal(result.request.paidPeriodCount, 12);
  assert.equal(result.request.penaltyAmount, 72);
  assert.equal(result.request.policyAcceptedAt.toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(result.request.expenseId, result.expense._id);
  assert.equal(result.expense.status, "uncategorized");
  assert.equal(result.expense.expenseSource, "savings_withdrawal");
  assert.equal(state.expenses.length, 1);
});

test("does not allow a student submission when the feature toggle is off", async () => {
  const { state, submit } = makeHarness({ enabled: false });
  await assert.rejects(
    submit.execute({ memberId: member._id, input: {} }),
    (error) => error instanceof SavingsWithdrawalError && error.code === "WITHDRAWAL_DISABLED",
  );
  assert.equal(state.requests.length, 0);
});

test("does not allow a duplicate open request", async () => {
  const { state, submit } = makeHarness({ openRequest: { _id: "existing", status: "reviewing" } });
  await assert.rejects(
    submit.execute({ memberId: member._id, input: {} }),
    (error) => error instanceof SavingsWithdrawalError && error.code === "WITHDRAWAL_ALREADY_OPEN",
  );
  assert.equal(state.requests.length, 0);
});

test("compensates the request if Expense creation fails", async () => {
  const { state, submit } = makeHarness({ expenseFailure: new Error("expense offline") });
  await assert.rejects(submit.execute({
    memberId: member._id,
    input: { withdrawalMonth: 12, withdrawalYear: 2026, reason: "Pulang ke Indonesia", policyAccepted: true },
  }), /expense offline/);
  assert.deepEqual(state.deletedRequests, ["withdrawal-1"]);
  assert.equal(state.expenses.length, 0);
});

test("compensates both records if the Expense cannot be attached to the request", async () => {
  const { state, submit } = makeHarness({ attachFailure: true });

  await assert.rejects(
    submit.execute({
      memberId: member._id,
      input: { withdrawalMonth: 12, withdrawalYear: 2026, reason: "Pulang ke Indonesia", policyAccepted: true },
    }),
    /gagal ditautkan/i,
  );

  assert.deepEqual(state.deletedRequests, ["withdrawal-1"]);
  assert.deepEqual(state.deletedExpenses, ["expense-1"]);
});

test("rejects a student submission until 12 periods are Finance-approved and fully paid", async () => {
  const { state, submit } = makeHarness({ savingsRows: savings.slice(0, 11) });
  await assert.rejects(
    submit.execute({ memberId: member._id, input: {} }),
    (error) => error instanceof SavingsWithdrawalError && error.code === "WITHDRAWAL_NOT_ELIGIBLE",
  );
  assert.equal(state.requests.length, 0);
});

test("requires early-withdrawal policy acceptance", async () => {
  const { submit } = makeHarness();
  await assert.rejects(
    submit.execute({ memberId: member._id, input: { withdrawalMonth: 12, withdrawalYear: 2026, reason: "Pulang ke Indonesia" } }),
    (error) => error instanceof SavingsWithdrawalError && error.code === "EARLY_WITHDRAWAL_POLICY_REQUIRED",
  );
});
