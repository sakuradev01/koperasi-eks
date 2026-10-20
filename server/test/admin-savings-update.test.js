import test from "node:test";
import assert from "node:assert/strict";
import {
  AdminSavingsUpdateError,
  createAdminSavingsUpdate,
} from "../src/modules/savings/application/updateAdminSavings.js";

function makeHarness({ existingSaving, updatedSaving, resolvedCoa } = {}) {
  const state = {
    existingSaving: existingSaving || {
      _id: "saving-1",
      status: "Pending",
      transactionId: null,
      productId: "product-1",
      amount: 2_500,
      accountId: "507f1f77bcf86cd799439011",
      categoryId: "507f1f77bcf86cd799439012",
      categoryType: "account",
      isSplit: false,
    },
    updatedSaving: updatedSaving || {
      _id: "saving-1",
      status: "Pending",
      transactionId: null,
      productId: "product-1",
      amount: 2_500,
      accountId: "507f1f77bcf86cd799439011",
      categoryId: "507f1f77bcf86cd799439012",
      categoryType: "account",
      isSplit: false,
    },
    reverseCalls: [],
    syncCalls: [],
    saved: [],
    detailCalls: [],
    coaSources: [],
    resolvedCoa,
    productLookups: [],
  };

  const workflow = createAdminSavingsUpdate({
    memberRepository: {
      findById: async () => ({ _id: "member-1" }),
    },
    productRepository: {
      findById: async (id) => {
        state.productLookups.push(id);
        return { _id: id, depositAmount: 1_000 };
      },
    },
    savingsRepository: {
      updateById: async (_id, data) => {
        state.updatedSaving = { ...state.updatedSaving, ...data };
        return state.updatedSaving;
      },
      save: async (saving) => state.saved.push(saving),
      loadPostedDetail: async (id) => {
        state.detailCalls.push(id);
        return { ...state.updatedSaving, populated: true };
      },
    },
    accountingGateway: {
      resolveCoaInput: (source, options) => {
        state.coaSources.push({ source, options });
        return {
          accountId: "507f1f77bcf86cd799439013",
          categoryId: "507f1f77bcf86cd799439014",
          categoryType: "account",
          isSplit: false,
          splitRows: [],
          ...state.resolvedCoa,
        };
      },
      normalizeObjectId: (value) => value || null,
      syncSavingsAccountingTransaction: async (saving, coa) => {
        state.syncCalls.push({ saving, coa });
        return { _id: "transaction-1" };
      },
      reverseSavingsAccountingTransaction: async (saving) => {
        state.reverseCalls.push(saving);
      },
    },
  });

  return { state, workflow };
}

test("updates an approved savings row and links its accounting transaction", async () => {
  const updatedSaving = {
    _id: "saving-1",
    status: "Approved",
    transactionId: null,
    productId: "product-1",
    amount: 2_500,
    accountId: "507f1f77bcf86cd799439011",
    categoryId: "507f1f77bcf86cd799439012",
    categoryType: "account",
    isSplit: false,
  };
  const { state, workflow } = makeHarness({ updatedSaving });

  const result = await workflow.execute({
    id: "saving-1",
    existingSaving: {
      _id: "saving-1",
      status: "Pending",
      transactionId: null,
      productId: "product-1",
      amount: 2_500,
    },
    updateData: { status: "Approved" },
    requestBody: {},
  });

  assert.equal(state.syncCalls.length, 1);
  assert.equal(state.saved.length, 1);
  assert.equal(state.updatedSaving.transactionId, "transaction-1");
  assert.equal(state.updatedSaving.accountId, "507f1f77bcf86cd799439013");
  assert.equal(state.updatedSaving.categoryId, "507f1f77bcf86cd799439014");
  assert.equal(state.updatedSaving.paymentType, "Full");
  assert.equal(state.detailCalls[0], "saving-1");
  assert.equal(result.populated, true);
});

test("reverses accounting when an approved saving leaves Approved status", async () => {
  const existingSaving = {
    _id: "saving-1",
    status: "Approved",
    transactionId: "transaction-old",
  };
  const updatedSaving = {
    _id: "saving-1",
    status: "Rejected",
    transactionId: "transaction-old",
    accountId: null,
  };
  const { state, workflow } = makeHarness({ existingSaving, updatedSaving });

  const result = await workflow.execute({
    id: "saving-1",
    existingSaving,
    updateData: { status: "Rejected" },
    requestBody: {},
  });

  assert.deepEqual(state.reverseCalls, [existingSaving]);
  assert.equal(state.updatedSaving.transactionId, null);
  assert.equal(result.status, "Rejected");
  assert.equal(state.syncCalls.length, 0);
});

test("uses request COA fields and split totals through the accounting gateway", async () => {
  const { state, workflow } = makeHarness({
    updatedSaving: {
      _id: "saving-1",
      status: "Approved",
      transactionId: "transaction-1",
      accountId: "507f1f77bcf86cd799439011",
      categoryId: null,
      categoryType: null,
      isSplit: true,
    },
    resolvedCoa: {
      accountId: "507f1f77bcf86cd799439015",
      categoryId: null,
      categoryType: null,
      isSplit: true,
      splitRows: [{ categoryId: "507f1f77bcf86cd799439016", amount: 500 }],
    },
  });

  await workflow.execute({
    id: "saving-1",
    existingSaving: { _id: "saving-1", status: "Approved", transactionId: "transaction-1" },
    updateData: { status: "Approved" },
    requestBody: {
      account_id: "507f1f77bcf86cd799439015",
      split_data: [{ categoryId: "507f1f77bcf86cd799439016", amount: 500 }],
    },
  });

  assert.equal(state.coaSources[0].source.accountId, "507f1f77bcf86cd799439015");
  assert.equal(state.coaSources[0].source.splits[0].categoryId, "507f1f77bcf86cd799439016");
  assert.equal(state.syncCalls[0].coa.isSplit, true);
  assert.equal(state.saved.length, 0);
});

test("does not attempt accounting sync for a non-approved payment", async () => {
  const { state, workflow } = makeHarness({
    updatedSaving: { _id: "saving-1", status: "Pending", accountId: null },
  });

  const result = await workflow.execute({
    id: "saving-1",
    existingSaving: { _id: "saving-1", status: "Pending", transactionId: null },
    updateData: { status: "Pending" },
    requestBody: {},
  });

  assert.equal(result.status, "Pending");
  assert.equal(state.syncCalls.length, 0);
  assert.equal(state.detailCalls.length, 0);
});

test("returns not found when update returns no savings row", async () => {
  const missingWorkflow = createAdminSavingsUpdate({
    memberRepository: { findById: async () => null },
    productRepository: { findById: async () => null },
    savingsRepository: {
      updateById: async () => null,
      save: async () => {},
      loadPostedDetail: async () => null,
    },
    accountingGateway: {
      resolveCoaInput: () => ({}),
      normalizeObjectId: () => null,
      syncSavingsAccountingTransaction: async () => ({}),
      reverseSavingsAccountingTransaction: async () => {},
    },
  });
  await assert.rejects(
    missingWorkflow.execute({
      id: "missing",
      existingSaving: { _id: "missing", status: "Pending" },
      updateData: {},
      requestBody: {},
    }),
    (error) => error instanceof AdminSavingsUpdateError
      && error.statusCode === 404
      && error.message === "Data simpanan tidak ditemukan",
  );
});
