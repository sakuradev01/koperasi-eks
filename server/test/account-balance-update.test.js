import test from "node:test";
import assert from "node:assert/strict";
import { CoaAccount } from "../src/models/coaAccount.model.js";
import {
  buildAccountBalanceUpdate,
  updateAccountBalance,
} from "../src/services/accountBalance.service.js";

test("applies deposits and withdrawals as atomic balance increments", () => {
  const now = new Date("2026-09-25T00:00:00.000Z");

  assert.deepEqual(buildAccountBalanceUpdate(1000, "Deposit", false, now), {
    $inc: { balance: 1000 },
    $set: { lastTransaction: now },
  });
  assert.deepEqual(buildAccountBalanceUpdate(1000, "Withdrawal", false, now), {
    $inc: { balance: -1000 },
    $set: { lastTransaction: now },
  });
});

test("reverses the original movement when editing or deleting a transaction", () => {
  const now = new Date("2026-09-25T00:00:00.000Z");

  assert.deepEqual(buildAccountBalanceUpdate(1000, "Deposit", true, now).$inc, { balance: -1000 });
  assert.deepEqual(buildAccountBalanceUpdate(1000, "Withdrawal", true, now).$inc, { balance: 1000 });
});

test("normalizes amounts and declines unsupported transaction types", () => {
  assert.deepEqual(buildAccountBalanceUpdate(-250, "Deposit", false).$inc, { balance: 250 });
  assert.deepEqual(buildAccountBalanceUpdate(Infinity, "Deposit", false).$inc, { balance: 0 });
  assert.equal(buildAccountBalanceUpdate(250, "Transfer"), null);
});

test("routes concurrent balance changes through atomic increment updates", async (t) => {
  let balance = 0;
  t.mock.method(CoaAccount, "updateOne", async (filter, update) => {
    assert.deepEqual(filter, { _id: "account-1" });
    assert.equal(typeof update.$inc.balance, "number");
    balance += update.$inc.balance;
    return { matchedCount: 1 };
  });

  await Promise.all(Array.from({ length: 100 }, () =>
    updateAccountBalance("account-1", 1000, "Deposit"),
  ));

  assert.equal(balance, 100000);
});
