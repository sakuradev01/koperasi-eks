import test from "node:test";
import assert from "node:assert/strict";
import {
  AdminSavingsDeletionError,
  createAdminSavingsDeletion,
} from "../src/modules/savings/application/deleteAdminSavings.js";

function makeHarness(saving) {
  const state = {
    saving,
    reversed: [],
    deletedProofs: [],
    deletedIds: [],
  };

  const workflow = createAdminSavingsDeletion({
    savingsRepository: {
      findById: async () => state.saving,
      deleteById: async (id) => state.deletedIds.push(id),
    },
    accountingGateway: {
      reverseSavingsAccountingTransaction: async (row) => state.reversed.push(row),
    },
    proofStorage: {
      delete: async (filename) => state.deletedProofs.push(filename),
    },
  });

  return { state, workflow };
}

test("reverses accounting, deletes proof, then deletes an approved saving", async () => {
  const saving = { _id: "saving-1", status: "Approved", transactionId: "txn-1", proofFile: "proof.jpg" };
  const { state, workflow } = makeHarness(saving);

  const result = await workflow.execute("saving-1");

  assert.equal(result, null);
  assert.deepEqual(state.reversed, [saving]);
  assert.deepEqual(state.deletedProofs, ["proof.jpg"]);
  assert.deepEqual(state.deletedIds, ["saving-1"]);
});

test("reverses a linked transaction even when the savings is no longer approved", async () => {
  const saving = { _id: "saving-2", status: "Rejected", transactionId: "txn-2" };
  const { state, workflow } = makeHarness(saving);

  await workflow.execute("saving-2");

  assert.deepEqual(state.reversed, [saving]);
  assert.deepEqual(state.deletedIds, ["saving-2"]);
});

test("does not reverse an unposted pending payment", async () => {
  const saving = { _id: "saving-3", status: "Pending", transactionId: null };
  const { state, workflow } = makeHarness(saving);

  await workflow.execute("saving-3");

  assert.deepEqual(state.reversed, []);
  assert.deepEqual(state.deletedIds, ["saving-3"]);
});

test("continues deleting the savings when proof cleanup fails", async () => {
  const saving = { _id: "saving-4", status: "Rejected", proofFile: "missing.jpg" };
  const { state } = makeHarness(saving);
  const workflow = createAdminSavingsDeletion({
    savingsRepository: {
      findById: async () => saving,
      deleteById: async (id) => state.deletedIds.push(id),
    },
    accountingGateway: {
      reverseSavingsAccountingTransaction: async (row) => state.reversed.push(row),
    },
    proofStorage: {
      delete: async (filename) => {
        state.deletedProofs.push(filename);
        throw new Error("disk unavailable");
      },
    },
  });

  await workflow.execute("saving-4");

  assert.deepEqual(state.deletedProofs, ["missing.jpg"]);
  assert.deepEqual(state.deletedIds, ["saving-4"]);
});

test("returns not found without reversing or deleting anything", async () => {
  const { state, workflow } = makeHarness(null);

  await assert.rejects(
    workflow.execute("missing"),
    (error) => error instanceof AdminSavingsDeletionError
      && error.statusCode === 404
      && error.message === "Data simpanan tidak ditemukan",
  );
  assert.deepEqual(state.reversed, []);
  assert.deepEqual(state.deletedIds, []);
});
