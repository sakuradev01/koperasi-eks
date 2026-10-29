import test from "node:test";
import assert from "node:assert/strict";
import { createExpenseTransactionPoster } from "../src/services/expenseAccounting.service.js";
import { AccountingTransaction } from "../src/models/accountingTransaction.model.js";

function makePoster(overrides = {}) {
  const calls = [];
  const poster = createExpenseTransactionPoster({
    findExistingTransaction: async () => null,
    findExpenseLines: async () => [
      { amount: 60, categoryId: "category-1" },
      { amount: 40, categoryId: "category-2" },
    ],
    copyReceipt: async () => "receipt.pdf",
    createTransaction: async () => ({ _id: "transaction-1", accountId: "account-1", amount: 100, transactionType: "Withdrawal" }),
    createSplits: async () => {},
    deleteSplits: async () => calls.push("delete-splits"),
    deleteTransaction: async () => calls.push("delete-transaction"),
    applyBalance: async () => { calls.push("apply-balance"); return true; },
    reverseBalance: async () => calls.push("reverse-balance"),
    removeReceipt: () => calls.push("remove-receipt"),
    ...overrides,
  });
  return { calls, poster };
}

const expense = {
  _id: "expense-1",
  savingsWithdrawalId: "withdrawal-1",
  accountId: "account-1",
  amount: 100,
  title: "Penutupan tabungan",
};

test("removes a partially-created transaction without reversing an unapplied balance", async () => {
  const { calls, poster } = makePoster({
    createSplits: async () => { throw new Error("split insert failed"); },
    applyBalance: async () => assert.fail("balance must not change before splits are stored"),
  });

  await assert.rejects(poster(expense), /split insert failed/);
  assert.deepEqual(calls, ["delete-splits", "delete-transaction", "remove-receipt"]);
});

test("does not leave a transaction when the account balance update reports failure", async () => {
  const { calls, poster } = makePoster({ applyBalance: async () => false });

  await assert.rejects(poster(expense), /Saldo akun pembayaran tidak berhasil diperbarui/);
  assert.deepEqual(calls, ["delete-splits", "delete-transaction", "remove-receipt"]);
});

test("passes the active session to every ledger persistence side effect", async () => {
  const session = { id: "mongo-session" };
  const calls = [];
  const { poster } = makePoster({
    findExistingTransaction: async ({ session: activeSession }) => { calls.push(activeSession); return null; },
    findExpenseLines: async (_id, activeSession) => { calls.push(activeSession); return [{ amount: 100, categoryId: "category-1" }]; },
    createTransaction: async (_payload, activeSession) => { calls.push(activeSession); return { _id: "transaction-1", accountId: "account-1", amount: 100, transactionType: "Withdrawal" }; },
    applyBalance: async (_transaction, activeSession) => { calls.push(activeSession); return true; },
  });

  const result = await poster(expense, { session });

  assert.equal(result.success, true);
  assert.deepEqual(calls, [session, session, session, session]);
});

test("enforces one accounting transaction per savings-withdrawal request", () => {
  const index = AccountingTransaction.schema.indexes().find(([keys]) => keys.savingsWithdrawalId === 1);

  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    savingsWithdrawalId: { $type: "objectId" },
  });
});
