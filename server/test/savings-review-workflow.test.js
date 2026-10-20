import test from "node:test";
import assert from "node:assert/strict";
import {
  createSavingsReviewWorkflow,
  SavingsReviewError,
} from "../src/modules/savings/application/savingsReviewWorkflow.js";

const fixedDate = new Date("2026-10-19T03:00:00.000Z");

function makeHarness(savingOverrides = {}) {
  const state = {
    saving: {
      _id: "saving-1",
      status: "Pending",
      amount: 2_500,
      accountId: "account-old",
      categoryId: "category-old",
      categoryType: "account",
      isSplit: false,
      transactionId: null,
      saveCount: 0,
      ...savingOverrides,
    },
    resolvedCoa: null,
    synced: [],
    reversed: [],
    lookupCount: 0,
    approvalDetail: { _id: "saving-1", status: "Approved", populated: true },
  };

  const workflow = createSavingsReviewWorkflow({
    savingsRepository: {
      findForApproval: async () => {
        state.lookupCount += 1;
        return state.saving;
      },
      findById: async () => {
        state.lookupCount += 1;
        return state.saving;
      },
      save: async (saving) => {
        saving.saveCount += 1;
        return saving;
      },
      loadApprovalDetail: async () => state.approvalDetail,
    },
    accountingGateway: {
      resolveCoaInput: (source, options) => {
        state.resolvedCoa = { source, options };
        return {
          accountId: "account-new",
          categoryId: "category-new",
          categoryType: "account",
          isSplit: false,
          ...state.resolvedCoaOverride,
        };
      },
      syncSavingsAccountingTransaction: async (saving, coa) => {
        state.synced.push({ saving, coa });
        return { _id: "transaction-1" };
      },
      reverseSavingsAccountingTransaction: async (saving) => {
        state.reversed.push(saving);
        return { deleted: true, transactionId: "transaction-1" };
      },
    },
    clock: () => fixedDate,
  });

  return { state, workflow };
}

test("approval posts accounting then saves the approved payment with resolved COA", async () => {
  const { state, workflow } = makeHarness();

  const result = await workflow.approve({
    id: "saving-1",
    userId: "reviewer-1",
    input: {
      account_id: "account-request",
      category_id: "category-request",
      category_type: "account",
      split_data: [{ categoryId: "category-a", amount: 2_500 }],
      sender_name: "Siswa",
      notes: "Diverifikasi",
    },
  });

  assert.equal(state.synced.length, 1);
  assert.equal(state.synced[0].saving, state.saving);
  assert.equal(state.resolvedCoa.options.requireAccount, true);
  assert.equal(state.resolvedCoa.source.accountId, "account-request");
  assert.equal(state.resolvedCoa.source.categoryId, "category-request");
  assert.equal(state.resolvedCoa.source.splits[0].categoryId, "category-a");
  assert.equal(state.saving.status, "Approved");
  assert.equal(state.saving.approvedBy, "reviewer-1");
  assert.equal(state.saving.approvedAt, fixedDate);
  assert.equal(state.saving.accountId, "account-new");
  assert.equal(state.saving.categoryId, "category-new");
  assert.equal(state.saving.categoryType, "account");
  assert.equal(state.saving.transactionId, "transaction-1");
  assert.equal(state.saving.notes, "Diverifikasi");
  assert.equal(state.saving.saveCount, 1);
  assert.equal(result.populated, true);
});

test("approval uses saved COA values when optional request fields are missing", async () => {
  const { state, workflow } = makeHarness();

  await workflow.approve({ id: "saving-1", userId: "reviewer-1", input: {} });

  assert.equal(state.resolvedCoa.source.accountId, "account-old");
  assert.equal(state.resolvedCoa.source.categoryId, "category-old");
  assert.equal(state.resolvedCoa.source.categoryType, "account");
  assert.equal(state.resolvedCoa.source.isSplit, false);
});

test("duplicate approval with an accounting link is rejected without posting again", async () => {
  const { state, workflow } = makeHarness({
    status: "Approved",
    transactionId: "transaction-existing",
  });

  await assert.rejects(
    workflow.approve({ id: "saving-1", userId: "reviewer-1", input: {} }),
    (error) => error instanceof SavingsReviewError
      && error.statusCode === 400
      && error.message === "Simpanan sudah disetujui sebelumnya",
  );

  assert.equal(state.synced.length, 0);
  assert.equal(state.saving.saveCount, 0);
});

test("reject requires a reason before looking up the savings row", async () => {
  const { state, workflow } = makeHarness();

  await assert.rejects(
    workflow.reject({ id: "saving-1", userId: "reviewer-1", input: {} }),
    (error) => error instanceof SavingsReviewError
      && error.statusCode === 400
      && error.message === "Alasan penolakan wajib diisi",
  );
  assert.equal(state.lookupCount, 0);
});

test("reject reverses a linked approved transaction and clears the payment link", async () => {
  const { state, workflow } = makeHarness({
    status: "Approved",
    transactionId: "transaction-existing",
  });

  const result = await workflow.reject({
    id: "saving-1",
    userId: "reviewer-2",
    input: { rejectionReason: "Bukti tidak jelas", notes: "Minta unggah ulang" },
  });

  assert.deepEqual(state.reversed, [state.saving]);
  assert.equal(state.saving.transactionId, null);
  assert.equal(state.saving.status, "Rejected");
  assert.equal(state.saving.rejectionReason, "Bukti tidak jelas");
  assert.equal(state.saving.approvedBy, "reviewer-2");
  assert.equal(state.saving.approvedAt, fixedDate);
  assert.equal(state.saving.notes, "Minta unggah ulang");
  assert.equal(state.saving.saveCount, 1);
  assert.equal(result, state.saving);
});

test("reject leaves an unposted payment unposted", async () => {
  const { state, workflow } = makeHarness({ transactionId: null });

  await workflow.reject({
    id: "saving-1",
    userId: "reviewer-2",
    input: { rejectionReason: "Bukti tidak jelas" },
  });

  assert.deepEqual(state.reversed, []);
  assert.equal(state.saving.status, "Rejected");
});

test("marking a payment partial changes only the payment status and metadata", async () => {
  const { state, workflow } = makeHarness();
  const originalAmount = state.saving.amount;
  const originalTransactionId = state.saving.transactionId;

  const result = await workflow.markAsPartial({
    id: "saving-1",
    userId: "reviewer-3",
    input: { notes: "Nominal yang diterima sebagian" },
  });

  assert.equal(state.saving.status, "Partial");
  assert.equal(state.saving.paymentType, "Partial");
  assert.equal(state.saving.approvedBy, "reviewer-3");
  assert.equal(state.saving.approvedAt, fixedDate);
  assert.equal(state.saving.notes, "Nominal yang diterima sebagian");
  assert.equal(state.saving.amount, originalAmount);
  assert.equal(state.saving.transactionId, originalTransactionId);
  assert.equal(state.synced.length, 0);
  assert.equal(state.reversed.length, 0);
  assert.equal(result, state.saving);
});

test("review operations return 404 when the savings row does not exist", async () => {
  const missingWorkflow = createSavingsReviewWorkflow({
    savingsRepository: {
      findForApproval: async () => null,
      findById: async () => null,
      save: async () => {},
      loadApprovalDetail: async () => null,
    },
    accountingGateway: {
      resolveCoaInput: () => ({}),
      syncSavingsAccountingTransaction: async () => ({}),
      reverseSavingsAccountingTransaction: async () => ({}),
    },
    clock: () => fixedDate,
  });

  await assert.rejects(
    missingWorkflow.approve({ id: "missing", userId: "reviewer-1", input: {} }),
    (error) => error.statusCode === 404 && error.message === "Data simpanan tidak ditemukan",
  );
  await assert.rejects(
    missingWorkflow.reject({ id: "missing", userId: "reviewer-1", input: { rejectionReason: "x" } }),
    (error) => error.statusCode === 404 && error.message === "Data simpanan tidak ditemukan",
  );
  await assert.rejects(
    missingWorkflow.markAsPartial({ id: "missing", userId: "reviewer-1", input: {} }),
    (error) => error.statusCode === 404 && error.message === "Data simpanan tidak ditemukan",
  );
});
