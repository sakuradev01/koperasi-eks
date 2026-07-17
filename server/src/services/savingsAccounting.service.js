import { AccountingTransaction } from "../models/accountingTransaction.model.js";
import { TransactionSplit } from "../models/transactionSplit.model.js";
import { CoaAccount } from "../models/coaAccount.model.js";
import { BankReconciliationItem } from "../models/bankReconciliationItem.model.js";
import { ApiError } from "../utils/ApiError.js";

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.toString) return value.toString();
  return String(value);
}

function normalizeObjectId(value) {
  const text = toIdString(value).trim();
  if (!text || text.length !== 24 || !/^[a-fA-F0-9]{24}$/.test(text)) return null;
  return text;
}

function normalizeMoney(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function normalizeCategoryType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "master" || text === "submenu" || text === "account") return text;
  return null;
}

function normalizeBooleanish(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(text)) return true;
  if (["0", "false", "no", "n", "off"].includes(text)) return false;
  return fallback;
}

function savingsTransactionType(savingsType) {
  return String(savingsType || "").trim() === "Penarikan" ? "Withdrawal" : "Deposit";
}

function normalizeSplitRows(raw) {
  let rows = raw;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const amount = normalizeMoney(row?.amount ?? row?.value ?? 0);
      const categoryId = normalizeObjectId(row?.categoryId ?? row?.category_id);
      const categoryType = normalizeCategoryType(row?.categoryType ?? row?.category_type) || "account";
      const description = String(row?.description || "").trim();
      return { amount, categoryId, categoryType, description };
    })
    .filter((row) => row.amount > 0 && row.categoryId);
}

export async function updateAccountBalance(accountId, amount, transactionType, reverse = false) {
  if (!accountId) return false;
  const account = await CoaAccount.findById(accountId);
  if (!account) return false;

  const safeAmount = normalizeMoney(amount);
  if (reverse) {
    account.balance += transactionType === "Deposit" ? -safeAmount : safeAmount;
  } else {
    account.balance += transactionType === "Deposit" ? safeAmount : -safeAmount;
  }
  account.lastTransaction = new Date();
  await account.save();
  return true;
}

/**
 * Normalize COA payload from body or savings document.
 * Throws ApiError when required fields missing/invalid.
 */
export function resolveSavingsCoaInput(source = {}, options = {}) {
  const requireAccount = options.requireAccount !== false;
  const accountId = normalizeObjectId(source.accountId ?? source.account_id);
  const rawSplits = source.splits ?? source.split_data ?? source.splitRows;
  const hasSplitInput =
    rawSplits !== undefined && rawSplits !== null && rawSplits !== "";
  const splitRows = normalizeSplitRows(rawSplits);
  const preserveExistingSplits =
    !hasSplitInput && normalizeBooleanish(source.isSplit, false);
  const isSplit = hasSplitInput ? splitRows.length > 0 : preserveExistingSplits;

  const categoryId = isSplit
    ? null
    : normalizeObjectId(source.categoryId ?? source.category_id);
  const categoryType = isSplit
    ? null
    : normalizeCategoryType(source.categoryType ?? source.category_type);
  const senderName = String(source.senderName ?? source.sender_name ?? "").trim();

  if (requireAccount && !accountId) {
    throw new ApiError(400, "Record Account wajib dipilih");
  }

  if (accountId && !isSplit && (!categoryId || !categoryType)) {
    throw new ApiError(400, "Category wajib dipilih");
  }

  if (isSplit && hasSplitInput) {
    if (splitRows.length < 2) {
      throw new ApiError(400, "Split transaction minimal 2 baris");
    }
  }

  return {
    accountId,
    categoryId,
    categoryType,
    isSplit,
    senderName,
    splitRows,
    preserveExistingSplits,
  };
}

export async function assertCoaAccountExists(accountId) {
  if (!accountId) return null;
  const account = await CoaAccount.findById(accountId).lean();
  if (!account) {
    throw new ApiError(404, "Record Account tidak ditemukan");
  }
  return account;
}

function buildTransactionPayload(savings, coa, amountOverride) {
  const amount = normalizeMoney(amountOverride ?? savings.amount);
  const transactionDate =
    savings.paymentDate || savings.savingsDate || savings.approvedAt || new Date();
  const memberLabel =
    savings.memberId?.name ||
    (typeof savings.memberId === "object" && savings.memberId?.toString
      ? ""
      : "") ||
    "";
  const typeLabel = savings.type || "Setoran";
  const periodLabel = savings.installmentPeriod
    ? `Periode ${savings.installmentPeriod}`
    : "";
  const description = [
    "Simpanan",
    typeLabel,
    periodLabel,
    memberLabel,
    coa.senderName,
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    savingsId: savings._id,
    transactionDate: new Date(transactionDate),
    description,
    accountId: coa.accountId,
    transactionType: savingsTransactionType(savings.type),
    amount,
    categoryId: coa.isSplit ? null : coa.categoryId,
    categoryType: coa.isSplit ? null : coa.categoryType,
    customerId: savings.memberId?._id || savings.memberId || null,
    notes: savings.notes || "",
    receiptFile: savings.proofFile || null,
    isSplit: Boolean(coa.isSplit),
    senderName: coa.senderName || "",
  };
}

async function writeSplits(transactionId, splitRows) {
  await TransactionSplit.deleteMany({ transactionId });
  if (!splitRows?.length) return;
  await TransactionSplit.insertMany(
    splitRows.map((split) => ({
      transactionId,
      amount: normalizeMoney(split.amount),
      categoryId: split.categoryId,
      categoryType: split.categoryType || "account",
      description: split.description || "",
    })),
  );
}

/**
 * Create or update AccountingTransaction linked to a savings row.
 * Validates split total against savings amount when splits provided.
 */
export async function syncSavingsAccountingTransaction(savings, coaInput = {}, options = {}) {
  if (!savings?._id) {
    throw new ApiError(400, "Data simpanan tidak valid");
  }

  const coa = {
    accountId: normalizeObjectId(coaInput.accountId ?? savings.accountId),
    categoryId: normalizeObjectId(coaInput.categoryId ?? savings.categoryId),
    categoryType:
      normalizeCategoryType(coaInput.categoryType ?? savings.categoryType) ||
      null,
    isSplit: normalizeBooleanish(
      coaInput.isSplit !== undefined ? coaInput.isSplit : savings.isSplit,
      false,
    ),
    senderName: String(coaInput.senderName ?? "").trim(),
    splitRows: Array.isArray(coaInput.splitRows) ? coaInput.splitRows : [],
    preserveExistingSplits: Boolean(coaInput.preserveExistingSplits),
  };

  if (!coa.accountId) {
    throw new ApiError(400, "Record Account wajib dipilih");
  }

  await assertCoaAccountExists(coa.accountId);

  if (!coa.isSplit && (!coa.categoryId || !coa.categoryType)) {
    throw new ApiError(400, "Category wajib dipilih");
  }

  const amount = normalizeMoney(options.amount ?? savings.amount);
  if (amount <= 0) {
    throw new ApiError(400, "Jumlah simpanan tidak valid");
  }

  if (coa.isSplit && coa.splitRows.length > 0) {
    const totalSplit = normalizeMoney(
      coa.splitRows.reduce((sum, row) => sum + normalizeMoney(row.amount), 0),
    );
    if (Math.abs(totalSplit - amount) > 0.01) {
      throw new ApiError(
        400,
        `Total split harus sama dengan nominal simpanan. Selisih: ${normalizeMoney(amount - totalSplit)}`,
      );
    }
  }

  const payload = buildTransactionPayload(savings, coa, amount);
  const existingId =
    normalizeObjectId(options.transactionId ?? savings.transactionId) ||
    null;

  let existing = null;
  if (existingId) {
    existing = await AccountingTransaction.findById(existingId);
  }
  if (!existing) {
    existing = await AccountingTransaction.findOne({ savingsId: savings._id });
  }

  if (existing) {
    await BankReconciliationItem.deleteMany({ transactionId: existing._id });
    await updateAccountBalance(
      existing.accountId,
      existing.amount,
      existing.transactionType,
      true,
    );

    Object.assign(existing, payload);
    await existing.save();

    if (coa.isSplit && coa.splitRows.length > 0) {
      await writeSplits(existing._id, coa.splitRows);
    } else if (!coa.preserveExistingSplits) {
      await TransactionSplit.deleteMany({ transactionId: existing._id });
    }

    await updateAccountBalance(
      existing.accountId,
      existing.amount,
      existing.transactionType,
      false,
    );

    return existing;
  }

  const created = await AccountingTransaction.create(payload);
  if (coa.isSplit && coa.splitRows.length > 0) {
    await writeSplits(created._id, coa.splitRows);
  }
  await updateAccountBalance(
    created.accountId,
    created.amount,
    created.transactionType,
    false,
  );
  return created;
}

/**
 * Reverse balance and delete linked AccountingTransaction + splits.
 * Returns deleted transaction id string or null.
 */
export async function reverseSavingsAccountingTransaction(savingsOrTxnId) {
  let transaction = null;

  if (savingsOrTxnId && typeof savingsOrTxnId === "object" && savingsOrTxnId._id) {
    const savings = savingsOrTxnId;
    const txnId = normalizeObjectId(savings.transactionId);
    if (txnId) {
      transaction = await AccountingTransaction.findById(txnId);
    }
    if (!transaction) {
      transaction = await AccountingTransaction.findOne({ savingsId: savings._id });
    }
  } else {
    const txnId = normalizeObjectId(savingsOrTxnId);
    if (txnId) {
      transaction = await AccountingTransaction.findById(txnId);
    }
  }

  if (!transaction) {
    return { deleted: false, transactionId: null };
  }

  await BankReconciliationItem.deleteMany({ transactionId: transaction._id });
  await updateAccountBalance(
    transaction.accountId,
    transaction.amount,
    transaction.transactionType,
    true,
  );
  await TransactionSplit.deleteMany({ transactionId: transaction._id });
  await AccountingTransaction.deleteOne({ _id: transaction._id });

  return { deleted: true, transactionId: toIdString(transaction._id) };
}

export {
  normalizeObjectId,
  normalizeMoney,
  normalizeCategoryType,
  savingsTransactionType,
  toIdString,
};
