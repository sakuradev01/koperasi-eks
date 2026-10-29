import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { AccountingTransaction } from "../models/accountingTransaction.model.js";
import { TransactionSplit } from "../models/transactionSplit.model.js";
import { ExpenseLine } from "../models/expenseLine.model.js";
import { ExpenseAttachment } from "../models/expenseAttachment.model.js";
import { BankReconciliationItem } from "../models/bankReconciliationItem.model.js";
import { BankReconciliation } from "../models/bankReconciliation.model.js";
import { ensureUploadsSubdirs, resolveUploadedFilePath } from "../utils/uploadsDir.js";
import { updateAccountBalance } from "./accountBalance.service.js";

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  return String(value);
}

function normalizeMoney(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function removeTransactionReceiptFile(storedValue) {
  if (!storedValue) return;
  const absolutePath = resolveUploadedFilePath(storedValue, { defaultSubdir: "transactions" });
  if (!absolutePath) return;
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch {
    // ignore cleanup errors
  }
}

async function calculateMatchedBalance(reconciliationId) {
  const items = await BankReconciliationItem.find({ reconciliationId, isMatched: true });
  let deposits = 0;
  let withdrawals = 0;

  for (const item of items) {
    const txn = await AccountingTransaction.findById(item.transactionId);
    if (!txn) continue;
    if (txn.transactionType === "Deposit") deposits += normalizeMoney(txn.amount);
    else withdrawals += normalizeMoney(txn.amount);
  }

  return deposits - withdrawals;
}

async function copyFirstAttachmentAsReceipt(expenseId) {
  const firstAttachment = await ExpenseAttachment.findOne({ expenseId })
    .sort({ createdAt: 1, _id: 1 })
    .select("fileName")
    .lean();

  if (!firstAttachment?.fileName) return null;

  const sourcePath = resolveUploadedFilePath(firstAttachment.fileName, { defaultSubdir: "expenses" });
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

  const { transactions: transactionDir } = ensureUploadsSubdirs();
  const ext = path.extname(firstAttachment.fileName || "") || ".bin";
  const receiptFile = `EXP_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
  const destinationPath = path.join(transactionDir, receiptFile);

  try {
    fs.copyFileSync(sourcePath, destinationPath);
    return receiptFile;
  } catch {
    return null;
  }
}

export function createExpenseTransactionPoster({
  findExistingTransaction,
  findExpenseLines,
  copyReceipt,
  createTransaction,
  createSplits,
  deleteSplits,
  deleteTransaction,
  applyBalance,
  reverseBalance,
  removeReceipt,
}) {
  return async function postExpenseTransaction(expense, options = {}) {
    const expenseId = toIdString(expense?._id || expense?.id);
    if (!expenseId) return { success: false, message: "Expense tidak valid." };
    if (!expense?.accountId) {
      return { success: false, message: "Bank account wajib diisi sebelum mark as paid." };
    }

    const session = options.session || null;
    const existingTransaction = await findExistingTransaction({
      expenseId,
      savingsWithdrawalId: expense.savingsWithdrawalId,
      session,
    });
    if (existingTransaction) {
      return { success: false, message: "Transaction sudah ada untuk expense ini." };
    }

    const expenseLines = await findExpenseLines(expenseId, session);
    if (!expenseLines.length) {
      return { success: false, message: "Expense belum punya category lines." };
    }
    const linesTotal = expenseLines.reduce((sum, line) => sum + normalizeMoney(line.amount), 0);
    if (linesTotal <= 0) {
      return { success: false, message: "Total category lines tidak valid." };
    }
    if (Math.abs(linesTotal - normalizeMoney(expense.amount)) > 0.01) {
      return { success: false, message: "Total category lines tidak sama dengan total expense." };
    }

    const transferDate = options.transferDate ? new Date(options.transferDate) : null;
    const transactionDate = transferDate && !Number.isNaN(transferDate.getTime())
      ? transferDate
      : (expense.dateStart ? new Date(expense.dateStart) : new Date());
    let receiptFile = null;
    let createdTransaction = null;
    let balanceApplied = false;

    try {
      receiptFile = await copyReceipt(expenseId);
      const transactionPayload = {
        expenseId,
        savingsWithdrawalId: expense.savingsWithdrawalId || undefined,
        transactionDate,
        description: `${expense.title || "Expense"} - ${expense.applicantName || "-"}`,
        accountId: expense.accountId,
        transactionType: "Withdrawal",
        amount: linesTotal,
        categoryId: null,
        categoryType: null,
        customerId: expense.applicantType === "member" ? expense.applicantMemberId || null : null,
        vendorId: expense.seller || null,
        notes: expense.description || "",
        receiptFile,
        isSplit: expenseLines.length > 1,
      };

      if (expenseLines.length === 1) {
        transactionPayload.categoryId = expenseLines[0].categoryId;
        transactionPayload.categoryType = "account";
      }

      createdTransaction = await createTransaction(transactionPayload, session);
      if (expenseLines.length > 1) {
        const splitDocs = expenseLines.map((line) => ({
          transactionId: createdTransaction._id,
          amount: normalizeMoney(line.amount),
          categoryId: line.categoryId,
          categoryType: "account",
          description: line.description || "",
        }));
        await createSplits(splitDocs, session);
      }

      balanceApplied = await applyBalance(createdTransaction, session);
      if (!balanceApplied) throw new Error("Saldo akun pembayaran tidak berhasil diperbarui.");

      return {
        success: true,
        message: "Transaction berhasil dibuat dari expense.",
        data: createdTransaction,
      };
    } catch (error) {
      if (createdTransaction) {
        if (balanceApplied) {
          await reverseBalance(createdTransaction, session).catch((rollbackError) => {
            console.error("Failed to reverse an expense balance update:", rollbackError);
          });
        }
        await deleteSplits(createdTransaction._id, session).catch((rollbackError) => {
          console.error("Failed to remove partial expense splits:", rollbackError);
        });
        await deleteTransaction(createdTransaction._id, session).catch((rollbackError) => {
          console.error("Failed to remove a partial expense transaction:", rollbackError);
        });
      }
      if (receiptFile) removeReceipt(receiptFile);
      throw error;
    }
  };
}

const postExpenseTransaction = createExpenseTransactionPoster({
  findExistingTransaction: async ({ expenseId, savingsWithdrawalId, session }) => {
    const filter = savingsWithdrawalId
      ? { $or: [{ savingsWithdrawalId }, { expenseId }] }
      : { expenseId };
    const query = AccountingTransaction.findOne(filter);
    return session ? query.session(session) : query;
  },
  findExpenseLines: async (expenseId, session) => {
    let query = ExpenseLine.find({ expenseId }).sort({ createdAt: 1, _id: 1 });
    if (session) query = query.session(session);
    return query.lean();
  },
  copyReceipt: copyFirstAttachmentAsReceipt,
  createTransaction: async (payload, session) => {
    const documents = await AccountingTransaction.create([payload], session ? { session } : {});
    return documents[0];
  },
  createSplits: (rows, session) => TransactionSplit.insertMany(rows, session ? { session } : {}),
  deleteSplits: (transactionId, session) => TransactionSplit.deleteMany(
    { transactionId },
    session ? { session } : {},
  ),
  deleteTransaction: (transactionId, session) => AccountingTransaction.deleteOne(
    { _id: transactionId },
    session ? { session } : {},
  ),
  applyBalance: (transaction, session) => updateAccountBalance(
    transaction.accountId,
    transaction.amount,
    transaction.transactionType,
    false,
    { session },
  ),
  reverseBalance: (transaction, session) => updateAccountBalance(
    transaction.accountId,
    transaction.amount,
    transaction.transactionType,
    true,
    { session },
  ),
  removeReceipt: removeTransactionReceiptFile,
});

export async function createTransactionFromExpense(expense, options = {}) {
  if (options.session) return postExpenseTransaction(expense, options);
  if (!options.transactional) return postExpenseTransaction(expense, options);

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await postExpenseTransaction(expense, { ...options, session });
      if (!result.success) {
        const error = new Error(result.message);
        error.statusCode = 422;
        throw error;
      }
    });
    return result;
  } catch (error) {
    return { success: false, message: error.message || "Transaksi Expense gagal dibukukan." };
  } finally {
    await session.endSession();
  }
}

export async function syncTransactionDateForExpense(expenseId, transferDate) {
  if (!expenseId || !transferDate) return;
  const parsedDate = new Date(transferDate);
  if (Number.isNaN(parsedDate.getTime())) return;

  await AccountingTransaction.findOneAndUpdate(
    { expenseId: toIdString(expenseId) },
    { transactionDate: parsedDate }
  );
}

export async function deleteLinkedTransactionForExpense(expenseId) {
  const expenseIdText = toIdString(expenseId);
  if (!expenseIdText) return { success: true, deleted: false };

  const linkedTransaction = await AccountingTransaction.findOne({ expenseId: expenseIdText });
  if (!linkedTransaction) {
    return { success: true, deleted: false };
  }

  const affectedItems = await BankReconciliationItem.find({ transactionId: linkedTransaction._id });
  const affectedReconIds = [...new Set(affectedItems.map((item) => toIdString(item.reconciliationId)).filter(Boolean))];
  await BankReconciliationItem.deleteMany({ transactionId: linkedTransaction._id });

  await updateAccountBalance(
    linkedTransaction.accountId,
    normalizeMoney(linkedTransaction.amount),
    linkedTransaction.transactionType,
    true
  );

  removeTransactionReceiptFile(linkedTransaction.receiptFile);

  await TransactionSplit.deleteMany({ transactionId: linkedTransaction._id });
  await AccountingTransaction.deleteOne({ _id: linkedTransaction._id });

  for (const reconciliationId of affectedReconIds) {
    try {
      const recon = await BankReconciliation.findById(reconciliationId);
      if (!recon || recon.status !== "in_progress") continue;
      const matchedBalance = await calculateMatchedBalance(reconciliationId);
      const totalMatched = matchedBalance + (recon.startingBalance || 0);
      recon.matchedBalance = totalMatched;
      recon.difference = (recon.closingBalance || 0) - totalMatched;
      await recon.save();
    } catch {
      // ignore per reconciliation update failure
    }
  }

  return { success: true, deleted: true, transactionId: toIdString(linkedTransaction._id) };
}
