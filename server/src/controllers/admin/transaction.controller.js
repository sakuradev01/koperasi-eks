import fs from "fs";
import { AccountingTransaction } from "../../models/accountingTransaction.model.js";
import { TransactionSplit } from "../../models/transactionSplit.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";
import { CoaMaster } from "../../models/coaMaster.model.js";
import { CoaSubmenu } from "../../models/coaSubmenu.model.js";
import { BankReconciliationItem } from "../../models/bankReconciliationItem.model.js";
import { BankReconciliation } from "../../models/bankReconciliation.model.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";

function normalizeNullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    return trimmed;
  }
  return value;
}

function normalizeBooleanish(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeTransactionType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "deposit") return "Deposit";
  if (normalized === "withdrawal") return "Withdrawal";
  return String(value || "").trim();
}

function normalizeSplits(rawSplits) {
  if (Array.isArray(rawSplits)) return rawSplits;
  if (!rawSplits) return [];

  if (typeof rawSplits === "string") {
    try {
      const parsed = JSON.parse(rawSplits);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeSplitRows(rawSplits) {
  return normalizeSplits(rawSplits)
    .map((item) => {
      const amount = Math.abs(parseFloat(item.amount ?? item.split_amount ?? 0)) || 0;
      const categoryId = normalizeNullable(item.categoryId ?? item.category_id);
      const categoryType = normalizeNullable(item.categoryType ?? item.category_type) || "account";
      const description = item.description ?? item.notes ?? "";

      return {
        amount,
        categoryId,
        categoryType,
        description,
      };
    })
    .filter((item) => item.amount > 0);
}

function getUploadedReceiptFile(req) {
  if (req.file) return req.file;
  if (req.files?.receiptFile?.[0]) return req.files.receiptFile[0];
  if (req.files?.receipt_file?.[0]) return req.files.receipt_file[0];
  return null;
}

function removeReceiptFile(storedValue) {
  if (!storedValue) return;

  const candidatePaths = [
    resolveUploadedFilePath(storedValue, { defaultSubdir: "transactions" }),
    resolveUploadedFilePath(`/upload/transactions/${storedValue}`),
    resolveUploadedFilePath(`/uploads/transactions/${storedValue}`),
  ].filter(Boolean);

  for (const fullPath of candidatePaths) {
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return;
      }
    } catch {
      // ignore cleanup errors so transaction flow is not blocked
    }
  }
}

/**
 * Helper: update account balance
 */
async function updateAccountBalance(accountId, amount, type, reverse = false) {
  const account = await CoaAccount.findById(accountId);
  if (!account) return false;

  let newBalance = account.balance || 0;
  if (reverse) {
    newBalance += type === "Deposit" ? -amount : amount;
  } else {
    newBalance += type === "Deposit" ? amount : -amount;
  }

  account.balance = newBalance;
  account.lastTransaction = new Date();
  await account.save();
  return true;
}

/**
 * Helper: resolve category name from categoryId + categoryType
 */
async function resolveCategoryName(categoryId, categoryType) {
  if (!categoryId || !categoryType) return null;
  try {
    if (categoryType === "master") {
      const m = await CoaMaster.findById(categoryId);
      return m ? m.masterName : null;
    } else if (categoryType === "submenu") {
      const s = await CoaSubmenu.findById(categoryId);
      return s ? s.submenuName : null;
    } else if (categoryType === "account") {
      const a = await CoaAccount.findById(categoryId);
      return a ? a.accountName : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * List all transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const { account } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const filter = {};
    if (account) filter.accountId = account;

    // List read: paginate + batch enrich (no per-row N+1)
    const [totalItems, transactions] = await Promise.all([
      AccountingTransaction.countDocuments(filter),
      AccountingTransaction.find(filter)
        .populate("accountId", "accountName accountCode currency balance")
        .populate("salesTaxId", "taxName abbreviation taxRate")
        .populate("customerId", "name uuid email")
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const txnIds = transactions.map((t) => t._id);
    const splitTxnIds = transactions.filter((t) => t.isSplit).map((t) => t._id);

    const [allSplits, reconItems, masters, submenus, accounts] = await Promise.all([
      splitTxnIds.length
        ? TransactionSplit.find({ transactionId: { $in: splitTxnIds } })
            .sort({ createdAt: 1, _id: 1 })
            .lean()
        : [],
      txnIds.length
        ? BankReconciliationItem.find({
            transactionId: { $in: txnIds },
            isMatched: true,
          })
            .select("transactionId")
            .lean()
        : [],
      CoaMaster.find({}).select("_id masterName").lean(),
      CoaSubmenu.find({}).select("_id submenuName").lean(),
      CoaAccount.find({}).select("_id accountName").lean(),
    ]);

    const masterMap = new Map(masters.map((m) => [String(m._id), m.masterName]));
    const submenuMap = new Map(submenus.map((s) => [String(s._id), s.submenuName]));
    const accountMap = new Map(accounts.map((a) => [String(a._id), a.accountName]));
    const nameFor = (categoryId, categoryType) => {
      if (!categoryId) return null;
      const id = String(categoryId);
      if (categoryType === "master") return masterMap.get(id) || null;
      if (categoryType === "submenu") return submenuMap.get(id) || null;
      if (categoryType === "account") return accountMap.get(id) || null;
      return accountMap.get(id) || submenuMap.get(id) || masterMap.get(id) || null;
    };

    const splitsByTxn = new Map();
    for (const sp of allSplits) {
      const key = String(sp.transactionId);
      if (!splitsByTxn.has(key)) splitsByTxn.set(key, []);
      splitsByTxn.get(key).push({
        ...sp,
        categoryName: nameFor(sp.categoryId, sp.categoryType),
      });
    }

    const reconciledSet = new Set(
      reconItems.map((r) => String(r.transactionId)),
    );

    const enriched = transactions.map((txn) => {
      const obj = { ...txn };
      obj.categoryName = nameFor(obj.categoryId, obj.categoryType);
      obj.splitCategories = obj.isSplit
        ? splitsByTxn.get(String(obj._id)) || []
        : [];
      obj.isReconciled = reconciledSet.has(String(obj._id));
      return obj;
    });

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(totalItems / limit), 1),
        totalItems,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get transaction detail (with splits)
 */
export const getTransaction = async (req, res) => {
  try {
    const txn = await AccountingTransaction.findById(req.params.id)
      .populate("accountId", "accountName accountCode currency")
      .populate("salesTaxId", "taxName abbreviation taxRate")
      .populate("customerId", "name uuid email");

    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const obj = txn.toObject();
    obj.categoryName = await resolveCategoryName(obj.categoryId, obj.categoryType);

    let splits = [];
    if (obj.isSplit) {
      const rawSplits = await TransactionSplit.find({ transactionId: obj._id });
      for (const sp of rawSplits) {
        const spObj = sp.toObject();
        spObj.categoryName = await resolveCategoryName(spObj.categoryId, spObj.categoryType);
        splits.push(spObj);
      }
    }

    res.status(200).json({ success: true, data: obj, splits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create transaction
 */
export const createTransaction = async (req, res) => {
  try {
    const body = req.body || {};
    const transactionDate = body.transactionDate ?? body.transaction_date;
    const description = body.description ?? "";
    const accountId = body.accountId ?? body.account_id;
    const transactionType = normalizeTransactionType(body.transactionType ?? body.transaction_type ?? body.type);
    const amountRaw = body.amount;
    const categoryId = normalizeNullable(body.categoryId ?? body.category_id);
    const categoryType = normalizeNullable(body.categoryType ?? body.category_type);
    const includeSalesTax = normalizeBooleanish(body.includeSalesTax ?? body.include_sales_tax, false);
    const salesTaxId = normalizeNullable(body.salesTaxId ?? body.sales_tax_id);
    const customerId = normalizeNullable(body.customerId ?? body.customer_id);
    const vendorId = normalizeNullable(body.vendorId ?? body.vendor_id);
    const notes = body.notes ?? "";
    const senderName = body.senderName ?? body.sender_name ?? "";
    const splitRows = normalizeSplitRows(body.splits ?? body.split_data);

    const parsedAmount = Math.abs(parseFloat(amountRaw));

    if (!transactionDate || !accountId || !transactionType || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Field wajib tidak lengkap" });
    }
    if (!["Deposit", "Withdrawal"].includes(transactionType)) {
      return res.status(400).json({ success: false, message: "Tipe transaksi tidak valid" });
    }

    const hasSplits = splitRows.length > 0;

    const txnData = {
      transactionDate,
      description,
      accountId,
      transactionType,
      amount: parsedAmount,
      categoryId: hasSplits ? null : categoryId,
      categoryType: hasSplits ? null : categoryType,
      includeSalesTax,
      salesTaxId,
      customerId,
      vendorId,
      notes,
      senderName,
      isSplit: hasSplits,
    };

    const uploadedReceipt = getUploadedReceiptFile(req);
    if (uploadedReceipt) {
      txnData.receiptFile = uploadedReceipt.filename;
    }

    const txn = await AccountingTransaction.create(txnData);

    if (hasSplits) {
      const splitDocs = splitRows.map((s) => ({
        transactionId: txn._id,
        amount: s.amount,
        categoryId: s.categoryId,
        categoryType: s.categoryType,
        description: s.description,
      }));
      await TransactionSplit.insertMany(splitDocs);
    }

    await updateAccountBalance(accountId, txnData.amount, transactionType);

    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: txn,
      hasSplits,
      splitCount: hasSplits ? splitRows.length : 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update transaction
 */
export const updateTransaction = async (req, res) => {
  try {
    const txn = await AccountingTransaction.findById(req.params.id);
    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const body = req.body || {};
    const transactionDate = body.transactionDate ?? body.transaction_date;
    const description = body.description;
    const accountId = body.accountId ?? body.account_id;
    const transactionType = normalizeTransactionType(body.transactionType ?? body.transaction_type ?? body.type);
    const amountRaw = body.amount;
    const categoryId = normalizeNullable(body.categoryId ?? body.category_id);
    const categoryType = normalizeNullable(body.categoryType ?? body.category_type);
    const includeSalesTaxRaw = body.includeSalesTax ?? body.include_sales_tax;
    const salesTaxId = normalizeNullable(body.salesTaxId ?? body.sales_tax_id);
    const customerId = normalizeNullable(body.customerId ?? body.customer_id);
    const vendorId = normalizeNullable(body.vendorId ?? body.vendor_id);
    const notes = body.notes;
    const senderName = body.senderName ?? body.sender_name;
    const splitRows = normalizeSplitRows(body.splits ?? body.split_data);

    const nextTransactionType = transactionType || txn.transactionType;
    const parsedAmount = amountRaw !== undefined && amountRaw !== null ? Math.abs(parseFloat(amountRaw)) : txn.amount;

    if (!["Deposit", "Withdrawal"].includes(nextTransactionType)) {
      return res.status(400).json({ success: false, message: "Tipe transaksi tidak valid" });
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah transaksi tidak valid" });
    }

    const hasSplits = splitRows.length > 0;

    await updateAccountBalance(txn.accountId, txn.amount, txn.transactionType, true);

    txn.transactionDate = transactionDate || txn.transactionDate;
    txn.description = description !== undefined ? description : txn.description;
    txn.accountId = accountId || txn.accountId;
    txn.transactionType = nextTransactionType;
    txn.amount = parsedAmount;
    txn.categoryId = hasSplits ? null : categoryId;
    txn.categoryType = hasSplits ? null : categoryType;
    txn.includeSalesTax = includeSalesTaxRaw !== undefined
      ? normalizeBooleanish(includeSalesTaxRaw, txn.includeSalesTax)
      : txn.includeSalesTax;
    txn.salesTaxId = salesTaxId;
    txn.customerId = customerId;
    txn.vendorId = vendorId;
    txn.notes = notes !== undefined ? notes : txn.notes;
    txn.senderName = senderName !== undefined ? senderName : txn.senderName;
    txn.isSplit = hasSplits;

    const uploadedReceipt = getUploadedReceiptFile(req);
    if (uploadedReceipt) {
      removeReceiptFile(txn.receiptFile);
      txn.receiptFile = uploadedReceipt.filename;
    }

    await txn.save();

    await TransactionSplit.deleteMany({ transactionId: txn._id });
    if (hasSplits) {
      const splitDocs = splitRows.map((s) => ({
        transactionId: txn._id,
        amount: s.amount,
        categoryId: s.categoryId,
        categoryType: s.categoryType,
        description: s.description,
      }));
      await TransactionSplit.insertMany(splitDocs);
    }

    await updateAccountBalance(txn.accountId, parsedAmount, txn.transactionType);

    res.status(200).json({ success: true, message: "Transaction updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete transaction
 */
export const deleteTransaction = async (req, res) => {
  try {
    const txn = await AccountingTransaction.findById(req.params.id);
    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const affectedItems = await BankReconciliationItem.find({ transactionId: txn._id });
    const affectedReconIds = [...new Set(affectedItems.map((i) => i.reconciliationId.toString()))];
    await BankReconciliationItem.deleteMany({ transactionId: txn._id });

    await updateAccountBalance(txn.accountId, txn.amount, txn.transactionType, true);

    removeReceiptFile(txn.receiptFile);

    await TransactionSplit.deleteMany({ transactionId: txn._id });
    await AccountingTransaction.findByIdAndDelete(txn._id);

    for (const rid of affectedReconIds) {
      try {
        const recon = await BankReconciliation.findById(rid);
        if (recon && recon.status === "in_progress") {
          const matchedBalance = await calculateMatchedBalance(rid);
          const totalMatched = matchedBalance + (recon.startingBalance || 0);
          recon.matchedBalance = totalMatched;
          recon.difference = (recon.closingBalance || 0) - totalMatched;
          await recon.save();
        }
      } catch {
        // ignore per reconciliation failure
      }
    }

    res.status(200).json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Toggle reviewed status
 */
export const toggleReviewed = async (req, res) => {
  try {
    const txn = await AccountingTransaction.findById(req.params.id);
    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    txn.reviewed = !txn.reviewed;
    await txn.save();

    res.status(200).json({ success: true, message: "Review status updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CSV bulk upload
 */
export const uploadTransactions = async (req, res) => {
  try {
    const { accountId, transactions: rows } = req.body;

    if (!accountId || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "Account ID dan data transaksi wajib diisi" });
    }

    const account = await CoaAccount.findById(accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    let imported = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 1;

      if (!row.date || row.amount === undefined || row.amount === null || row.amount === "") {
        errors.push(`Line ${lineNum}: Missing date or amount`);
        continue;
      }

      const date = new Date(row.date);
      if (isNaN(date.getTime())) {
        errors.push(`Line ${lineNum}: Invalid date format`);
        continue;
      }

      const rawAmount = parseFloat(row.amount);
      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        errors.push(`Line ${lineNum}: Invalid amount`);
        continue;
      }

      const amount = Math.abs(rawAmount);
      const providedType = normalizeTransactionType(row.type);
      const type = ["Deposit", "Withdrawal"].includes(providedType)
        ? providedType
        : rawAmount >= 0
          ? "Deposit"
          : "Withdrawal";

      await AccountingTransaction.create({
        transactionDate: date,
        description: row.description || "",
        accountId,
        transactionType: type,
        amount,
      });

      await updateAccountBalance(accountId, amount, type);
      imported++;
    }

    res.status(200).json({
      success: true,
      message: `${imported} transactions imported successfully`,
      imported,
      errors,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get account currency
 */
export const getAccountCurrency = async (req, res) => {
  try {
    const account = await CoaAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    res.status(200).json({
      success: true,
      currency: account.currency || "Rp",
      accountName: account.accountName,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper: calculate matched balance for reconciliation
 */
async function calculateMatchedBalance(reconciliationId) {
  const items = await BankReconciliationItem.find({ reconciliationId, isMatched: true });
  let deposits = 0;
  let withdrawals = 0;

  for (const item of items) {
    const txn = await AccountingTransaction.findById(item.transactionId);
    if (txn) {
      if (txn.transactionType === "Deposit") deposits += Math.abs(txn.amount);
      else withdrawals += Math.abs(txn.amount);
    }
  }

  return deposits - withdrawals;
}
