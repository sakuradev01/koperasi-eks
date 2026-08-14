import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRunningBalances,
  calculateRunningBalancesFromMovements,
} from "../src/utils/runningBalance.js";

test("calculates the balance after each transaction from complete account history", () => {
  const balances = calculateRunningBalances({
    accountBalances: [
      { _id: "cash-account", balance: 1000 },
    ],
    historyRows: [
      {
        _id: "new-withdrawal",
        accountId: "cash-account",
        transactionDate: "2026-08-10",
        createdAt: "2026-08-10T10:00:00.000Z",
        transactionType: "Withdrawal",
        amount: 200,
      },
      {
        _id: "old-deposit",
        accountId: "cash-account",
        transactionDate: "2026-08-01",
        createdAt: "2026-08-01T10:00:00.000Z",
        transactionType: "Deposit",
        amount: 500,
      },
    ],
  });

  assert.equal(balances.get("new-withdrawal"), 1000);
  assert.equal(balances.get("old-deposit"), 1200);
});

test("keeps running balances isolated per account and stable for same-date rows", () => {
  const balances = calculateRunningBalances({
    accountBalances: [
      { _id: "cash-account", balance: 900 },
      { _id: "bank-account", balance: 400 },
    ],
    historyRows: [
      {
        _id: "cash-later",
        accountId: "cash-account",
        transactionDate: "2026-08-14",
        createdAt: "2026-08-14T12:00:00.000Z",
        transactionType: "Deposit",
        amount: 100,
      },
      {
        _id: "cash-earlier",
        accountId: "cash-account",
        transactionDate: "2026-08-14",
        createdAt: "2026-08-14T08:00:00.000Z",
        transactionType: "Withdrawal",
        amount: 300,
      },
      {
        _id: "bank-only",
        accountId: "bank-account",
        transactionDate: "2026-08-13",
        createdAt: "2026-08-13T08:00:00.000Z",
        transactionType: "Withdrawal",
        amount: 50,
      },
    ],
  });

  assert.equal(balances.get("cash-later"), 900);
  assert.equal(balances.get("cash-earlier"), 800);
  assert.equal(balances.get("bank-only"), 400);
});

test("calculates a report-account balance from selected category movements", () => {
  const balances = calculateRunningBalancesFromMovements({
    movementRows: [
      {
        transactionId: "older-category-credit",
        transactionDate: "2026-08-05",
        createdAt: "2026-08-05T10:00:00.000Z",
        signedAmount: 600000,
      },
      {
        transactionId: "latest-category-credit",
        transactionDate: "2026-08-12",
        createdAt: "2026-08-12T10:00:00.000Z",
        signedAmount: 734400,
      },
    ],
  });

  assert.equal(balances.get("latest-category-credit"), 1334400);
  assert.equal(balances.get("older-category-credit"), 600000);
});
