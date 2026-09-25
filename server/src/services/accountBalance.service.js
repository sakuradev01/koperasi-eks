import { CoaAccount } from "../models/coaAccount.model.js";

export function buildAccountBalanceUpdate(amount, transactionType, reverse = false, now = new Date()) {
  const normalizedType = String(transactionType || "").trim();
  if (!["Deposit", "Withdrawal"].includes(normalizedType)) return null;

  const parsedAmount = Number(amount);
  const safeAmount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;
  const transactionSign = normalizedType === "Deposit" ? 1 : -1;
  const operationSign = reverse ? -1 : 1;

  return {
    $inc: { balance: safeAmount * transactionSign * operationSign },
    $set: { lastTransaction: now },
  };
}

export async function updateAccountBalance(accountId, amount, transactionType, reverse = false) {
  if (!accountId) return false;

  const update = buildAccountBalanceUpdate(amount, transactionType, reverse);
  if (!update) return false;

  const result = await CoaAccount.updateOne({ _id: accountId }, update);
  return (result.matchedCount ?? result.n ?? 0) > 0;
}
