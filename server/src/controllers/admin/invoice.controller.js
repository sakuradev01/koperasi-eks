import {
  enrichCustomerSnapshotReferral,
} from "../services/panelStudentReferral.service.js";
import mongoose from "mongoose";
import fs from "fs";
import { Invoice } from "../../models/invoice.model.js";
import { Member } from "../../models/member.model.js";
import { Tos } from "../../models/tos.model.js";
import { AccountingTransaction } from "../../models/accountingTransaction.model.js";
import { TransactionSplit } from "../../models/transactionSplit.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";
import { BankReconciliationItem } from "../../models/bankReconciliationItem.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";

const AVAILABLE_CURRENCIES = ["IDR", "JPY", "USD", "AUD", "EUR", "GBP"];
const AVAILABLE_PAYMENT_METHODS = [
  "Bank",
  "Cash",
  "Transfer",
  "QRIS",
  "Check",
  "CC",
  "PayPal",
  "Other",
];

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMoney(value) {
  return Math.round((normalizeNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    return trimmed;
  }
  return value;
}

function normalizeCategoryType(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["master", "submenu", "account"].includes(normalized)
    ? normalized
    : null;
}

function normalizeObjectId(value) {
  const normalized = normalizeNullable(value);
  return normalized && mongoose.Types.ObjectId.isValid(String(normalized))
    ? normalized
    : null;
}

function sameObjectId(left, right) {
  if (!left || !right) return false;
  return String(left) === String(right);
}

function parseFlexibleArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function normalizeBooleanish(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeSplitRows(rawSplits) {
  return parseFlexibleArray(rawSplits)
    .map((item) => {
      const amount = clampMoney(item?.amount ?? item?.split_amount);
      const categoryId = normalizeObjectId(
        item?.categoryId ?? item?.category_id,
      );
      const categoryType =
        normalizeCategoryType(item?.categoryType ?? item?.category_type) ||
        "account";
      const description = normalizeString(item?.description || item?.notes);

      if (amount <= 0 || !categoryId) return null;

      return {
        amount,
        categoryId,
        categoryType,
        description,
      };
    })
    .filter(Boolean);
}

function getUploadedPaymentAttachment(req) {
  if (req.file) return req.file;
  if (req.files?.proofAttachment?.[0]) return req.files.proofAttachment[0];
  if (req.files?.receiptFile?.[0]) return req.files.receiptFile[0];
  if (req.files?.receipt_file?.[0]) return req.files.receipt_file[0];
  return null;
}

function removeTransactionReceiptFile(storedValue) {
  if (!storedValue) return;

  const candidates = [
    resolveUploadedFilePath(storedValue, { defaultSubdir: "transactions" }),
    resolveUploadedFilePath(`/uploads/transactions/${storedValue}`),
    resolveUploadedFilePath(`/upload/transactions/${storedValue}`),
  ].filter(Boolean);

  for (const fullPath of candidates) {
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return;
      }
    } catch {
      // File cleanup should not block invoice/payment flow.
    }
  }
}

async function updateAccountBalance(
  accountId,
  amount,
  transactionType,
  reverse = false,
) {
  if (!accountId) return false;
  const account = await CoaAccount.findById(accountId);
  if (!account) return false;

  const safeAmount = clampMoney(amount);
  if (reverse) {
    account.balance += transactionType === "Deposit" ? -safeAmount : safeAmount;
  } else {
    account.balance += transactionType === "Deposit" ? safeAmount : -safeAmount;
  }
  account.lastTransaction = new Date();
  await account.save();
  return true;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function ensureDate(value, fieldName) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} tidak valid`);
  }
  return date;
}

function buildCustomerSnapshot(member) {
  return {
    uuid: member?.uuid || "",
    name: member?.name || "",
    email: member?.email || "",
    phone: member?.phone || "",
    completeAddress: member?.completeAddress || "",
    productTitle: member?.product?.title || "",
  };
}

function normalizeItems(rawItems) {
  const items = parseFlexibleArray(rawItems)
    .map((item) => {
      const quantity = clampMoney(item?.quantity);
      const price = clampMoney(item?.price);
      const title = normalizeString(item?.title);
      const productId =
        item?.productId &&
        mongoose.Types.ObjectId.isValid(String(item.productId))
          ? item.productId
          : null;
      if (!title || quantity <= 0 || price < 0) return null;

      return {
        productId,
        title,
        description: normalizeString(item?.description),
        quantity,
        price,
        amount: clampMoney(quantity * price),
      };
    })
    .filter(Boolean);

  if (!items.length) {
    throw new ApiError(400, "Minimal 1 item invoice wajib diisi");
  }

  return items;
}

function normalizeDiscounts(rawDiscounts, subtotal) {
  let runningTotal = subtotal;

  return parseFlexibleArray(rawDiscounts)
    .map((discount, index) => {
      const label = normalizeString(discount?.label) || `Discount ${index + 1}`;
      const type = discount?.type === "percentage" ? "percentage" : "fixed";
      const value = clampMoney(discount?.value);
      const amount =
        type === "percentage"
          ? clampMoney((runningTotal * value) / 100)
          : clampMoney(value);

      if (amount <= 0) return null;

      runningTotal = Math.max(clampMoney(runningTotal - amount), 0);

      return {
        label,
        type,
        value,
        amount,
      };
    })
    .filter(Boolean);
}

function normalizeProjections(rawProjections, currentProjections = []) {
  return parseFlexibleArray(rawProjections)
    .map((projection, index) => {
      const estimateDate = ensureDate(
        projection?.estimateDate || projection?.estimate || projection?.date,
        `Tanggal proyeksi #${index + 1}`,
      );
      const amount = clampMoney(projection?.amount);
      if (amount <= 0) {
        throw new ApiError(
          400,
          `Nominal proyeksi #${index + 1} wajib lebih dari 0`,
        );
      }

      const normalizedProjection = {
        description:
          normalizeString(projection?.description) || `Cicilan ${index + 1}`,
        estimateDate,
        amount,
      };

      if (
        projection?._id &&
        mongoose.Types.ObjectId.isValid(String(projection._id))
      ) {
        normalizedProjection._id = projection._id;
      } else if (
        currentProjections[index]?._id &&
        mongoose.Types.ObjectId.isValid(String(currentProjections[index]._id))
      ) {
        normalizedProjection._id = currentProjections[index]._id;
      }

      return normalizedProjection;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.estimateDate) - new Date(b.estimateDate));
}

function normalizePayments(rawPayments) {
  return parseFlexibleArray(rawPayments)
    .map((payment) => {
      const amount = clampMoney(payment?.amount);
      if (amount <= 0) return null;
      const categoryType = normalizeCategoryType(payment?.categoryType);
      const isSplit = normalizeBooleanish(payment?.isSplit, false);

      const normalizedPayment = {
        paymentDate: ensureDate(
          payment?.paymentDate || payment?.date,
          "Tanggal pembayaran",
        ),
        amount,
        method: normalizeString(payment?.method) || "Bank",
        notes: normalizeString(payment?.notes),
        accountId: normalizeObjectId(payment?.accountId),
        categoryId: isSplit ? null : normalizeObjectId(payment?.categoryId),
        categoryType: isSplit ? null : categoryType,
        projectionId: normalizeObjectId(payment?.projectionId),
        projectionIndex:
          Number.isFinite(Number(payment?.projectionIndex)) &&
          Number(payment?.projectionIndex) > 0
            ? Number(payment.projectionIndex)
            : null,
        projectionDescription: normalizeString(
          payment?.projectionDescription,
        ),
        projectionDueDate: payment?.projectionDueDate
          ? ensureDate(payment.projectionDueDate, "Tanggal jatuh tempo proyeksi")
          : null,
        isSplit,
        senderName: normalizeString(payment?.senderName),
        attachment: normalizeString(payment?.attachment),
        attachmentOriginalName: normalizeString(
          payment?.attachmentOriginalName,
        ),
        transactionId: normalizeObjectId(payment?.transactionId),
      };

      if (
        payment?._id &&
        mongoose.Types.ObjectId.isValid(String(payment._id))
      ) {
        normalizedPayment._id = payment._id;
      }

      return normalizedPayment;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));
}

function computeInvoiceStatus(statusInput, dueDate, total, totalPaid) {
  if ((statusInput || "draft") === "draft" && totalPaid <= 0) {
    return "draft";
  }

  if (clampMoney(totalPaid) >= clampMoney(total)) {
    return "paid";
  }

  const today = startOfDay(new Date());
  const safeDueDate = startOfDay(dueDate);

  if (safeDueDate < today) {
    return "overdue";
  }

  if (totalPaid > 0) {
    return "partial";
  }

  return "sent";
}

function dateDiffInDays(left, right) {
  const leftDate = startOfDay(left);
  const rightDate = startOfDay(right);
  if (
    Number.isNaN(leftDate.getTime()) ||
    Number.isNaN(rightDate.getTime())
  ) {
    return 0;
  }
  return Math.round((leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

function paymentMatchesProjection(payment, projection, projectionIndex) {
  if (!payment || !projection) return false;

  // projectionId harus jadi source of truth.
  // Kalau projectionId ada, jangan fallback ke projectionIndex.
  if (payment.projectionId) {
    return sameObjectId(payment.projectionId, projection._id);
  }

  // Fallback ini hanya untuk payment lama/legacy yang belum punya projectionId.
  return (
    Number(payment.projectionIndex || 0) > 0 &&
    Number(payment.projectionIndex) === Number(projectionIndex)
  );
}

function enrichProjections(projections, payments) {
  const safePayments = payments || [];
  const today = new Date();

  return (projections || []).map((projection, index) => {
    const projectionIndex = index + 1;
    const realizations = safePayments
      .filter((payment) =>
        paymentMatchesProjection(payment, projection, projectionIndex),
      )
      .map((payment) => ({
        ...payment,
        agingDays: payment.paymentDate
          ? dateDiffInDays(payment.paymentDate, projection.estimateDate)
          : 0,
      }));
    const paidAmount = clampMoney(
      realizations.reduce((sum, payment) => sum + clampMoney(payment.amount), 0),
    );
    const projectionAmount = clampMoney(projection.amount);
    const remainingAmount = clampMoney(Math.max(projectionAmount - paidAmount, 0));

    let status = "Unpaid";
    if (paidAmount >= projectionAmount && projectionAmount > 0) {
      status = "Paid";
    } else if (paidAmount > 0) {
      status = "Partial";
    }

    const agingDays = realizations.length
      ? Math.max(...realizations.map((payment) => payment.agingDays || 0))
      : new Date(projection.estimateDate) < startOfDay(today)
        ? dateDiffInDays(today, projection.estimateDate)
        : 0;

    return {
      ...projection,
      projectionIndex,
      paidAmount,
      remainingAmount,
      status,
      agingDays,
      realizations,
    };
  });
}

function serializeInvoice(invoiceDoc) {
  const invoice =
    typeof invoiceDoc.toObject === "function"
      ? invoiceDoc.toObject()
      : invoiceDoc;
  const projections = enrichProjections(
    invoice.projections || [],
    invoice.payments || [],
  );

  return {
    ...invoice,
    projections,
  };
}

async function attachSplitRowsToSerializedInvoice(invoice) {
  const transactionIds = new Set();
  const collect = (payment) => {
    if (payment?.isSplit && payment?.transactionId) {
      transactionIds.add(String(payment.transactionId));
    }
  };

  (invoice.payments || []).forEach(collect);
  (invoice.projections || []).forEach((projection) => {
    (projection.realizations || []).forEach(collect);
  });

  if (!transactionIds.size) {
    return invoice;
  }

  const splits = await TransactionSplit.find({
    transactionId: { $in: Array.from(transactionIds) },
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const splitsByTransactionId = new Map();

  splits.forEach((split) => {
    const transactionId = String(split.transactionId);
    if (!splitsByTransactionId.has(transactionId)) {
      splitsByTransactionId.set(transactionId, []);
    }
    splitsByTransactionId.get(transactionId).push({
      _id: split._id,
      amount: split.amount,
      categoryId: split.categoryId,
      categoryType: split.categoryType || "account",
      description: split.description || "",
    });
  });

  const hydrate = (payment) => {
    if (!payment) return payment;
    return {
      ...payment,
      splits: payment.isSplit
        ? splitsByTransactionId.get(String(payment.transactionId)) || []
        : [],
    };
  };

  invoice.payments = (invoice.payments || []).map(hydrate);
  invoice.projections = (invoice.projections || []).map((projection) => ({
    ...projection,
    realizations: (projection.realizations || []).map(hydrate),
  }));

  return invoice;
}

async function serializeInvoiceWithSplits(invoiceDoc) {
  const invoice = await attachSplitRowsToSerializedInvoice(
    serializeInvoice(invoiceDoc),
  );
  if (invoice?.customerSnapshot) {
    invoice.customerSnapshot = await enrichCustomerSnapshotReferral(
      invoice.customerSnapshot,
    );
  }
  return invoice;
}

function serializePublicInvoice(invoiceDoc) {
  const invoice = serializeInvoice(invoiceDoc);

  return {
    invoiceNumber: invoice.invoiceNumber,
    customerSnapshot: invoice.customerSnapshot,
    salesCode: invoice.salesCode,
    issuedDate: invoice.issuedDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
    status: invoice.status,
    items: (invoice.items || []).map((item) => ({
      _id: item._id,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      amount: item.amount,
    })),
    discounts: (invoice.discounts || []).map((discount) => ({
      _id: discount._id,
      label: discount.label,
      type: discount.type,
      value: discount.value,
      amount: discount.amount,
    })),
    projections: (invoice.projections || []).map((projection) => ({
      _id: projection._id,
      description: projection.description,
      estimateDate: projection.estimateDate,
      amount: projection.amount,
      paidAmount: projection.paidAmount,
      remainingAmount: projection.remainingAmount,
      status: projection.status,
      agingDays: projection.agingDays,
    })),
    payments: (invoice.payments || []).map((payment) => ({
      _id: payment._id,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      method: payment.method,
    })),
    terms: invoice.terms,
    termsTitle: invoice.termsTitle,
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    total: invoice.total,
    totalPaid: invoice.totalPaid,
    amountDue: invoice.amountDue,
  };
}

async function generateNextInvoiceNumber(issuedDate, excludeInvoiceId = null) {
  const issued = ensureDate(issuedDate || new Date(), "Tanggal invoice");
  const yy = String(issued.getFullYear()).slice(-2);
  const mm = String(issued.getMonth() + 1).padStart(2, "0");
  const prefix = `A${yy}${mm}`;

  const query = { invoiceNumber: new RegExp(`^${prefix}`) };
  if (excludeInvoiceId) {
    query._id = { $ne: excludeInvoiceId };
  }

  const invoices = await Invoice.find(query).select("invoiceNumber").lean();
  const maxSequence = invoices.reduce((max, invoice) => {
    const raw = String(invoice.invoiceNumber || "").slice(prefix.length);
    const current = Number.parseInt(raw, 10);
    return Number.isFinite(current) && current > max ? current : max;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

async function buildInvoicePayload(payload, options = {}) {
  const currentInvoice = options.currentInvoice || null;
  const memberId = payload?.memberId || currentInvoice?.memberId;

  if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
    throw new ApiError(400, "Customer anggota wajib dipilih");
  }

  const member = await Member.findById(memberId)
    .populate("product", "title")
    .lean();

  if (!member) {
    throw new ApiError(404, "Anggota tidak ditemukan");
  }

  const issuedDate = ensureDate(
    payload?.issuedDate || currentInvoice?.issuedDate || new Date(),
    "Tanggal invoice",
  );
  const dueDate = ensureDate(
    payload?.dueDate || currentInvoice?.dueDate || issuedDate,
    "Tanggal jatuh tempo",
  );
  const items = normalizeItems(payload?.items || currentInvoice?.items || []);
  const subtotal = clampMoney(
    items.reduce((sum, item) => sum + item.amount, 0),
  );
  const discounts = normalizeDiscounts(
    payload?.discounts || currentInvoice?.discounts || [],
    subtotal,
  );
  const discountTotal = clampMoney(
    discounts.reduce((sum, discount) => sum + discount.amount, 0),
  );
  const total = Math.max(clampMoney(subtotal - discountTotal), 0);
  const projections = normalizeProjections(
    payload?.projections || currentInvoice?.projections || [],
    currentInvoice?.projections || [],
  );
  const payments = normalizePayments(
    payload?.payments || currentInvoice?.payments || [],
  );
  const totalPaid = clampMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );
  const amountDue = clampMoney(total - totalPaid);
  const paymentDates = payments
    .map((payment) => new Date(payment.paymentDate).getTime())
    .filter(Number.isFinite);
  const invoiceNumberInput = normalizeString(payload?.invoiceNumber);
  const invoiceNumber = (
    invoiceNumberInput ||
    (await generateNextInvoiceNumber(issuedDate, currentInvoice?._id))
  ).toUpperCase();
  const statusInput = normalizeString(
    payload?.status || currentInvoice?.status || "draft",
  ).toLowerCase();
  const requestedStatus = statusInput === "draft" ? "draft" : "sent";
  let tosId = null;
  let termsTitle = normalizeString(
    payload?.termsTitle || currentInvoice?.termsTitle,
  );
  let terms = normalizeString(payload?.terms || currentInvoice?.terms);

  if (
    payload?.tosId &&
    mongoose.Types.ObjectId.isValid(String(payload.tosId))
  ) {
    const tos = await Tos.findById(payload.tosId).lean();
    if (!tos) {
      throw new ApiError(404, "Term of Services tidak ditemukan");
    }
    tosId = tos._id;
    termsTitle = tos.title || termsTitle;
    terms = terms || tos.content || "";
  } else if (currentInvoice?.tosId) {
    tosId = currentInvoice.tosId;
  }

  if (
    !AVAILABLE_CURRENCIES.includes(
      payload?.currency || currentInvoice?.currency || "IDR",
    )
  ) {
    throw new ApiError(400, "Currency invoice tidak didukung");
  }

  const status = computeInvoiceStatus(
    requestedStatus,
    dueDate,
    total,
    totalPaid,
  );

  return {
    invoiceNumber,
    memberId: member._id,
    customerSnapshot: buildCustomerSnapshot(member),
    salesCode: normalizeString(payload?.salesCode),
    issuedDate,
    dueDate,
    currency: payload?.currency || currentInvoice?.currency || "IDR",
    exchangeRate:
      clampMoney(payload?.exchangeRate || currentInvoice?.exchangeRate || 1) ||
      1,
    status,
    items,
    discounts,
    projections,
    payments,
    notes: normalizeString(payload?.notes),
    terms,
    tosId,
    termsTitle,
    subtotal,
    discountTotal,
    total,
    totalPaid,
    amountDue,
    lastPaymentDate: paymentDates.length
      ? new Date(Math.max(...paymentDates))
      : null,
  };
}

function getPaymentBodyValue(body, keys) {
  for (const key of keys) {
    if (body?.[key] !== undefined && body?.[key] !== null) return body[key];
  }
  return undefined;
}

function resolveInvoiceProjectionForPayment(
  invoice,
  body,
  amount,
  excludePaymentId = null,
) {
  const projections = invoice?.projections || [];
  if (!projections.length) return null;

  const projectionId = normalizeObjectId(
    getPaymentBodyValue(body, ["projectionId", "projection_id"]),
  );
  const projectionIndexInput = normalizeNumber(
    getPaymentBodyValue(body, [
      "projectionIndex",
      "projection_index",
      "installment",
      "installmentIndex",
    ]),
    0,
  );
  const projectionIndex =
    projectionIndexInput > 0 ? Math.floor(projectionIndexInput) : null;

  if (!projectionId && !projectionIndex) {
    throw new ApiError(400, "Pilih cicilan/proyeksi pembayaran");
  }

  const projectionWithIndex = projections
    .map((projection, index) => ({ projection, projectionIndex: index + 1 }))
    .find(({ projection, projectionIndex: currentIndex }) => {
      if (projectionId && sameObjectId(projection._id, projectionId)) {
        return true;
      }
      return projectionIndex && projectionIndex === currentIndex;
    });

  if (!projectionWithIndex) {
    throw new ApiError(404, "Cicilan/proyeksi pembayaran tidak ditemukan");
  }

  const { projection, projectionIndex: resolvedIndex } = projectionWithIndex;
  const paidAmount = clampMoney(
    (invoice.payments || [])
      .filter(
        (payment) =>
          !excludePaymentId || String(payment._id) !== String(excludePaymentId),
      )
      .filter((payment) =>
        paymentMatchesProjection(payment, projection, resolvedIndex),
      )
      .reduce((sum, payment) => sum + clampMoney(payment.amount), 0),
  );
  const remainingAmount = clampMoney(
    Math.max(clampMoney(projection.amount) - paidAmount, 0),
  );

  if (amount > remainingAmount + 0.01) {
    throw new ApiError(
      400,
      `Nominal pembayaran melebihi sisa cicilan ${resolvedIndex}. Sisa: ${remainingAmount}`,
    );
  }

  return {
    projectionId: projection._id,
    projectionIndex: resolvedIndex,
    projectionDescription:
      normalizeString(projection.description) || `Cicilan ${resolvedIndex}`,
    projectionDueDate: projection.estimateDate,
    remainingAmount,
  };
}

async function normalizeInvoicePaymentInput(req, invoice, options = {}) {
  const { existingPayment = null, excludePaymentId = null } = options;
  const body = req.body || {};
  const amount = clampMoney(
    getPaymentBodyValue(body, ["amount", "paymentAmount", "payment-amount"]),
  );
  const paymentDate = ensureDate(
    getPaymentBodyValue(body, ["paymentDate", "payment-date", "date"]),
    "Tanggal pembayaran",
  );
  const method =
    normalizeString(
      getPaymentBodyValue(body, ["method", "paymentMethod", "payment-method"]),
    ) || "Bank";
  const notes = normalizeString(
    getPaymentBodyValue(body, ["notes", "paymentNote", "payment-note"]),
  );
  const senderName = normalizeString(
    getPaymentBodyValue(body, ["senderName", "sender_name"]),
  );
  const accountId = normalizeObjectId(
    getPaymentBodyValue(body, ["accountId", "account_id"]),
  );
  const rawSplitRows = getPaymentBodyValue(body, ["splits", "split_data"]);
  const hasSplitInput =
    rawSplitRows !== undefined && rawSplitRows !== null && rawSplitRows !== "";
  const splitRows = normalizeSplitRows(rawSplitRows);
  const preserveExistingSplits =
    !hasSplitInput && normalizeBooleanish(existingPayment?.isSplit, false);
  const isSplit = hasSplitInput ? splitRows.length > 0 : preserveExistingSplits;
  const categoryId = isSplit
    ? null
    : normalizeObjectId(
        getPaymentBodyValue(body, ["categoryId", "category_id"]),
      );
  const categoryType = isSplit
    ? null
    : normalizeCategoryType(
        getPaymentBodyValue(body, ["categoryType", "category_type"]),
      );
  const uploadedAttachment = getUploadedPaymentAttachment(req);

  if (amount <= 0) {
    throw new ApiError(400, "Nominal pembayaran tidak valid");
  }
  const projectionMarker = resolveInvoiceProjectionForPayment(
    invoice,
    body,
    amount,
    excludePaymentId,
  );
  if (!accountId) {
    throw new ApiError(400, "Record Account wajib dipilih");
  }

  const account = await CoaAccount.findById(accountId).lean();
  if (!account) {
    throw new ApiError(404, "Record Account tidak ditemukan");
  }

  if (!isSplit && (!categoryId || !categoryType)) {
    throw new ApiError(400, "Category wajib dipilih");
  }

  if (isSplit && !preserveExistingSplits) {
    if (splitRows.length < 2) {
      throw new ApiError(400, "Split transaction minimal 2 baris");
    }
    const totalSplit = clampMoney(
      splitRows.reduce((sum, split) => sum + clampMoney(split.amount), 0),
    );
    if (Math.abs(totalSplit - amount) > 0.01) {
      throw new ApiError(
        400,
        `Total split harus sama dengan nominal pembayaran. Selisih: ${clampMoney(amount - totalSplit)}`,
      );
    }
  }

  return {
    payment: {
      paymentDate,
      amount,
      method,
      notes,
      accountId,
      categoryId,
      categoryType,
      projectionId: projectionMarker?.projectionId || null,
      projectionIndex: projectionMarker?.projectionIndex || null,
      projectionDescription: projectionMarker?.projectionDescription || "",
      projectionDueDate: projectionMarker?.projectionDueDate || null,
      isSplit,
      senderName,
      attachment: uploadedAttachment?.filename || existingPayment?.attachment || "",
      attachmentOriginalName:
        uploadedAttachment?.originalname ||
        existingPayment?.attachmentOriginalName ||
        "",
    },
    splitRows,
    preserveExistingSplits,
    uploadedAttachment,
  };
}

function buildAccountingTransactionPayload(invoice, payment) {
  const customerName = invoice.customerSnapshot?.name || "Customer";
  const projectionLabel = payment.projectionIndex
    ? `Cicilan ${payment.projectionIndex}`
    : "";
  const description = [
    invoice.invoiceNumber,
    projectionLabel,
    customerName,
    payment.senderName,
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    transactionDate: payment.paymentDate,
    description,
    accountId: payment.accountId,
    transactionType: "Deposit",
    amount: payment.amount,
    categoryId: payment.isSplit ? null : payment.categoryId,
    categoryType: payment.isSplit ? null : payment.categoryType,
    invoiceNumber: invoice.invoiceNumber,
    invoicePaymentId: payment._id || null,
    invoiceProjectionId: payment.projectionId || null,
    invoiceProjectionIndex: payment.projectionIndex || null,
    invoiceProjectionDescription: payment.projectionDescription || "",
    invoiceProjectionDueDate: payment.projectionDueDate || null,
    customerId: invoice.memberId,
    notes: payment.notes,
    receiptFile: payment.attachment || null,
    isSplit: payment.isSplit,
    senderName: payment.senderName,
  };
}

async function createAccountingTransactionFromPayment(
  invoice,
  payment,
  splitRows,
) {
  const transaction = await AccountingTransaction.create({
    ...buildAccountingTransactionPayload(invoice, payment),
  });

  if (payment.isSplit) {
    await TransactionSplit.insertMany(
      splitRows.map((split) => ({
        transactionId: transaction._id,
        amount: split.amount,
        categoryId: split.categoryId,
        categoryType: split.categoryType,
        description: split.description,
      })),
    );
  }

  await updateAccountBalance(payment.accountId, payment.amount, "Deposit");
  return transaction;
}

async function updateAccountingTransactionFromPayment(
  transactionId,
  invoice,
  previousPayment,
  nextPayment,
  splitRows,
) {
  const normalizedTransactionId = normalizeObjectId(transactionId);
  if (!normalizedTransactionId) {
    return createAccountingTransactionFromPayment(invoice, nextPayment, splitRows);
  }

  const transaction = await AccountingTransaction.findById(
    normalizedTransactionId,
  );
  if (!transaction) {
    return createAccountingTransactionFromPayment(invoice, nextPayment, splitRows);
  }

  await BankReconciliationItem.deleteMany({ transactionId: transaction._id });
  await updateAccountBalance(
    transaction.accountId,
    transaction.amount,
    transaction.transactionType,
    true,
  );

  Object.assign(transaction, buildAccountingTransactionPayload(invoice, nextPayment));
  await transaction.save();

  await TransactionSplit.deleteMany({ transactionId: transaction._id });
  if (nextPayment.isSplit) {
    await TransactionSplit.insertMany(
      splitRows.map((split) => ({
        transactionId: transaction._id,
        amount: split.amount,
        categoryId: split.categoryId,
        categoryType: split.categoryType,
        description: split.description,
      })),
    );
  }

  if (
    nextPayment.attachment &&
    previousPayment?.attachment &&
    nextPayment.attachment !== previousPayment.attachment
  ) {
    removeTransactionReceiptFile(previousPayment.attachment);
  }

  await updateAccountBalance(nextPayment.accountId, nextPayment.amount, "Deposit");
  return transaction;
}

async function deleteLinkedAccountingTransaction(
  transactionId,
  fallbackPayment = null,
) {
  const normalizedTransactionId = normalizeObjectId(transactionId);
  if (!normalizedTransactionId) return;

  const transaction = await AccountingTransaction.findById(
    normalizedTransactionId,
  );
  if (!transaction) return;

  await BankReconciliationItem.deleteMany({ transactionId: transaction._id });
  await updateAccountBalance(
    transaction.accountId,
    transaction.amount,
    transaction.transactionType,
    true,
  );
  removeTransactionReceiptFile(
    transaction.receiptFile || fallbackPayment?.attachment,
  );
  await TransactionSplit.deleteMany({ transactionId: transaction._id });
  await AccountingTransaction.deleteOne({ _id: transaction._id });
}

export const getInvoiceMeta = asyncHandler(async (req, res) => {
  const issuedDate = req.query.issuedDate || new Date();
  const nextInvoiceNumber = await generateNextInvoiceNumber(issuedDate);

  res.status(200).json(
    new ApiResponse(200, {
      nextInvoiceNumber,
      currencies: AVAILABLE_CURRENCIES,
      paymentMethods: AVAILABLE_PAYMENT_METHODS,
    }),
  );
});

export const validateInvoiceNumber = asyncHandler(async (req, res) => {
  const invoiceNumber = normalizeString(req.query.invoiceNumber).toUpperCase();
  const exclude = normalizeString(req.query.exclude).toUpperCase();

  if (!invoiceNumber) {
    throw new ApiError(400, "Nomor invoice wajib diisi");
  }

  const duplicate = await Invoice.findOne({ invoiceNumber }).lean();
  const available =
    !duplicate || (exclude && duplicate.invoiceNumber === exclude);

  res.status(200).json(
    new ApiResponse(200, {
      invoiceNumber,
      available,
    }),
  );
});

export const getAllInvoices = asyncHandler(async (req, res) => {
  const page = Math.max(normalizeNumber(req.query.page, 1), 1);
  const limit = Math.min(
    Math.max(normalizeNumber(req.query.limit, 12), 1),
    100,
  );
  const search = normalizeString(req.query.search);
  const memberId = normalizeString(req.query.memberId);
  const statusFilter = normalizeString(req.query.status).toLowerCase();
  const tag = normalizeString(req.query.tag).toLowerCase();
  const issuedFrom = normalizeString(req.query.issuedFrom);
  const issuedTo = normalizeString(req.query.issuedTo);
  const dueFrom = normalizeString(req.query.dueFrom);
  const dueTo = normalizeString(req.query.dueTo);
  const dueState = normalizeString(req.query.dueState).toLowerCase();
  const order = normalizeString(
    req.query.order || req.query.sortBy,
  ).toLowerCase();
  const by = normalizeString(req.query.by || req.query.sortDir).toLowerCase();
  const sortDirection = by === "asc" ? 1 : -1;

  const query = {};
  if (memberId && mongoose.Types.ObjectId.isValid(memberId)) {
    query.memberId = memberId;
  }
  if (issuedFrom || issuedTo) {
    query.issuedDate = {};
    if (issuedFrom) query.issuedDate.$gte = startOfDay(issuedFrom);
    if (issuedTo) query.issuedDate.$lte = endOfDay(issuedTo);
  }
  if (dueFrom || dueTo) {
    query.dueDate = {};
    if (dueFrom) query.dueDate.$gte = startOfDay(dueFrom);
    if (dueTo) query.dueDate.$lte = endOfDay(dueTo);
  }
  if (search) {
    const regex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    query.$or = [
      { invoiceNumber: regex },
      { salesCode: regex },
      { "customerSnapshot.name": regex },
      { "customerSnapshot.uuid": regex },
    ];
  }

  const rawInvoices = await Invoice.find(query)
    .sort({ issuedDate: -1, createdAt: -1 })
    .lean();
  const hydrated = rawInvoices.map((invoice) => {
    const serialized = serializeInvoice(invoice);
    return {
      ...serialized,
      status: computeInvoiceStatus(
        serialized.status,
        serialized.dueDate,
        serialized.total,
        serialized.totalPaid,
      ),
    };
  });
  const today = startOfDay(new Date());

  const filtered = hydrated.filter((invoice) => {
    if (tag === "draft" && invoice.status !== "draft") return false;
    if (tag === "unpaid" && ["paid", "draft"].includes(invoice.status))
      return false;
    if (statusFilter && invoice.status !== statusFilter) return false;
    if (dueState) {
      const dueDate = startOfDay(invoice.dueDate);
      const daysUntilDue = dateDiffInDays(dueDate, today);
      const isCollectible =
        !["draft", "paid"].includes(invoice.status) &&
        clampMoney(invoice.amountDue) > 0;

      if (dueState === "overdue" && !(isCollectible && daysUntilDue < 0)) {
        return false;
      }
      if (dueState === "due_today" && !(isCollectible && daysUntilDue === 0)) {
        return false;
      }
      if (
        dueState === "due_7" &&
        !(isCollectible && daysUntilDue >= 0 && daysUntilDue <= 7)
      ) {
        return false;
      }
      if (
        dueState === "due_30" &&
        !(isCollectible && daysUntilDue >= 0 && daysUntilDue <= 30)
      ) {
        return false;
      }
      if (dueState === "not_due" && !(isCollectible && daysUntilDue > 0)) {
        return false;
      }
    }
    return true;
  });

  const sortKeyMap = {
    status: (invoice) =>
      ({ draft: 1, sent: 2, partial: 3, overdue: 4, paid: 5 }[
        invoice.status
      ] || 99),
    due: (invoice) => new Date(invoice.dueDate).getTime(),
    duedate: (invoice) => new Date(invoice.dueDate).getTime(),
    issued: (invoice) => new Date(invoice.issuedDate).getTime(),
    issueddate: (invoice) => new Date(invoice.issuedDate).getTime(),
  };
  const sorter = sortKeyMap[order];
  if (sorter) {
    filtered.sort((left, right) => {
      const leftValue = sorter(left);
      const rightValue = sorter(right);
      if (leftValue === rightValue) {
        return String(left.invoiceNumber || "").localeCompare(
          String(right.invoiceNumber || ""),
        );
      }
      return leftValue > rightValue ? sortDirection : -sortDirection;
    });
  }

  const summary = {
    totalInvoices: filtered.length,
    totalDraft: filtered.filter((invoice) => invoice.status === "draft").length,
    totalPaid: filtered.filter((invoice) => invoice.status === "paid").length,
    totalOutstanding: clampMoney(
      filtered.reduce(
        (sum, invoice) => sum + Math.max(invoice.amountDue || 0, 0),
        0,
      ),
    ),
    totalValue: clampMoney(
      filtered.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
    ),
  };

  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  res.status(200).json(
    new ApiResponse(200, {
      invoices: paginated,
      summary,
      pagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(filtered.length / limit), 1),
        totalItems: filtered.length,
        itemsPerPage: limit,
      },
    }),
  );
});

export const getInvoiceByNumber = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const invoice = await Invoice.findOne({ invoiceNumber }).lean();

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  res.status(200).json(new ApiResponse(200, await serializeInvoiceWithSplits(invoice)));
});

export const getPublicInvoiceByNumber = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const invoice = await Invoice.findOne({
    invoiceNumber,
    status: { $ne: "draft" },
  }).lean();

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan atau belum dipublish");
  }

  res.status(200).json(new ApiResponse(200, serializePublicInvoice(invoice)));
});

export const getPublicMemberInvoicesByUuid = asyncHandler(async (req, res) => {
  const uuid = normalizeString(req.params.uuid);

  if (!uuid) {
    throw new ApiError(400, "UUID anggota wajib diisi");
  }

  const member = await Member.findOne({ uuid })
    .populate("productId", "title depositAmount returnProfit termDuration")
    .lean();

  if (!member) {
    res.status(200).json(
      new ApiResponse(200, {
        status: "not_registered",
        member: null,
        invoices: [],
        summary: {
          totalInvoices: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          totalValue: 0,
        },
      }),
    );
    return;
  }

  const rawInvoices = await Invoice.find({
    memberId: member._id,
  })
    .sort({ issuedDate: -1, createdAt: -1 })
    .lean();
  const invoices = rawInvoices.map((invoice) => serializePublicInvoice(invoice));

  res.status(200).json(
    new ApiResponse(200, {
      status: member.isVerified ? "verified" : "pending_verification",
      member: {
        id: member._id,
        uuid: member.uuid,
        name: member.name,
        email: member.email || "",
        phone: member.phone || "",
        isVerified: Boolean(member.isVerified),
        registeredAt: member.createdAt,
        product: member.productId
          ? {
              title: member.productId.title,
              depositAmount: member.productId.depositAmount,
              returnProfit: member.productId.returnProfit,
              termDuration: member.productId.termDuration,
            }
          : null,
      },
      invoices,
      summary: {
        totalInvoices: invoices.length,
        totalPaid: invoices.filter((invoice) => invoice.status === "paid").length,
        totalOutstanding: clampMoney(
          invoices.reduce(
            (sum, invoice) => sum + Math.max(invoice.amountDue || 0, 0),
            0,
          ),
        ),
        totalValue: clampMoney(
          invoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0),
        ),
      },
    }),
  );
});

export const createInvoice = asyncHandler(async (req, res) => {
  const payload = await buildInvoicePayload(req.body);

  const duplicate = await Invoice.findOne({
    invoiceNumber: payload.invoiceNumber,
  }).lean();
  if (duplicate) {
    throw new ApiError(400, "Nomor invoice sudah digunakan");
  }

  const invoice = await Invoice.create({
    ...payload,
    createdBy: req.user?.userId || null,
    updatedBy: req.user?.userId || null,
  });

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await serializeInvoiceWithSplits(invoice),
        "Invoice berhasil dibuat",
      ),
    );
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const currentNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const currentInvoice = await Invoice.findOne({
    invoiceNumber: currentNumber,
  });

  if (!currentInvoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  const payload = await buildInvoicePayload(
    {
      ...currentInvoice.toObject(),
      ...req.body,
      payments: currentInvoice.payments,
    },
    { currentInvoice },
  );

  const duplicate = await Invoice.findOne({
    invoiceNumber: payload.invoiceNumber,
    _id: { $ne: currentInvoice._id },
  }).lean();
  if (duplicate) {
    throw new ApiError(400, "Nomor invoice sudah digunakan");
  }

  Object.assign(currentInvoice, {
    ...payload,
    updatedBy: req.user?.userId || null,
  });

  await currentInvoice.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeInvoiceWithSplits(currentInvoice),
        "Invoice berhasil diperbarui",
      ),
    );
});

export const approveInvoiceDraft = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  if (invoice.status !== "draft") {
    throw new ApiError(400, "Invoice ini bukan draft");
  }

  const rebuilt = await buildInvoicePayload(
    {
      ...invoice.toObject(),
      status: "sent",
      payments: invoice.payments,
    },
    { currentInvoice: invoice },
  );

  Object.assign(invoice, {
    ...rebuilt,
    updatedBy: req.user?.userId || null,
  });

  await invoice.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeInvoiceWithSplits(invoice),
        "Draft invoice berhasil di-approve",
      ),
    );
});

export const deleteInvoice = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const invoice = await Invoice.findOne({ invoiceNumber }).lean();

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  for (const payment of invoice.payments || []) {
    await deleteLinkedAccountingTransaction(payment.transactionId, payment);
  }
  await Invoice.deleteOne({ _id: invoice._id });

  res
    .status(200)
    .json(new ApiResponse(200, invoice, "Invoice berhasil dihapus"));
});

export const addInvoicePayment = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  if (invoice.status === "draft") {
    throw new ApiError(
      400,
      "Approve draft invoice dulu sebelum record payment",
    );
  }

  let createdTransaction = null;
  let payment = null;
  try {
    const normalized = await normalizeInvoicePaymentInput(req, invoice);
    payment = normalized.payment;
    payment._id = payment._id || new mongoose.Types.ObjectId();

    createdTransaction = await createAccountingTransactionFromPayment(
      invoice,
      payment,
      normalized.splitRows,
    );
    payment.transactionId = createdTransaction._id;

    invoice.payments.push(payment);
    const rebuilt = await buildInvoicePayload(invoice.toObject(), {
      currentInvoice: invoice,
    });
    Object.assign(invoice, {
      ...rebuilt,
      payments: normalizePayments(invoice.payments),
      updatedBy: req.user?.userId || null,
    });
    await invoice.save();
  } catch (error) {
    if (createdTransaction?._id) {
      await deleteLinkedAccountingTransaction(createdTransaction._id, payment);
    } else {
      const uploadedAttachment = getUploadedPaymentAttachment(req);
      if (uploadedAttachment?.filename) {
        removeTransactionReceiptFile(uploadedAttachment.filename);
      }
    }
    throw error;
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeInvoiceWithSplits(invoice),
        "Pembayaran berhasil ditambahkan",
      ),
    );
});

export const updateInvoicePayment = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const paymentId = String(req.params.paymentId || "").trim();
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  if (invoice.status === "draft") {
    throw new ApiError(
      400,
      "Approve draft invoice dulu sebelum edit payment",
    );
  }

  const existingPaymentDoc = (invoice.payments || []).find(
    (payment) => String(payment._id) === paymentId,
  );
  if (!existingPaymentDoc) {
    throw new ApiError(404, "Pembayaran tidak ditemukan");
  }

  const existingPayment =
    typeof existingPaymentDoc.toObject === "function"
      ? existingPaymentDoc.toObject()
      : existingPaymentDoc;

  let uploadedAttachment = null;
  let accountingTransactionUpdated = false;
  try {
    const normalized = await normalizeInvoicePaymentInput(req, invoice, {
      existingPayment,
      excludePaymentId: paymentId,
    });
    uploadedAttachment = normalized.uploadedAttachment;

    let splitRows = normalized.splitRows;
    if (normalized.preserveExistingSplits) {
      const existingSplits = existingPayment.transactionId
        ? await TransactionSplit.find({
            transactionId: existingPayment.transactionId,
          }).lean()
        : [];
      splitRows = existingSplits.map((split) => ({
        amount: clampMoney(split.amount),
        categoryId: split.categoryId,
        categoryType: split.categoryType,
        description: split.description,
      }));

      const totalSplit = clampMoney(
        splitRows.reduce((sum, split) => sum + clampMoney(split.amount), 0),
      );
      if (splitRows.length < 2 || Math.abs(totalSplit - normalized.payment.amount) > 0.01) {
        throw new ApiError(
          400,
          "Payment split lama tidak balance. Edit ulang split transaction dari transaksi terkait.",
        );
      }
    }

    const payment = {
      ...normalized.payment,
      _id: existingPayment._id,
      transactionId: existingPayment.transactionId || null,
    };

    const updatedTransaction = await updateAccountingTransactionFromPayment(
      existingPayment.transactionId,
      invoice,
      existingPayment,
      payment,
      splitRows,
    );
    accountingTransactionUpdated = true;
    payment.transactionId = updatedTransaction?._id || null;

    const nextPayments = (invoice.payments || []).map((item) =>
      String(item._id) === paymentId ? payment : item,
    );
    const rebuilt = await buildInvoicePayload(
      {
        ...invoice.toObject(),
        payments: nextPayments,
      },
      { currentInvoice: invoice },
    );

    Object.assign(invoice, {
      ...rebuilt,
      payments: normalizePayments(nextPayments),
      updatedBy: req.user?.userId || null,
    });
    await invoice.save();
  } catch (error) {
    if (uploadedAttachment?.filename && !accountingTransactionUpdated) {
      removeTransactionReceiptFile(uploadedAttachment.filename);
    }
    throw error;
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeInvoiceWithSplits(invoice),
        "Pembayaran berhasil diperbarui",
      ),
    );
});

export const deleteInvoicePayment = asyncHandler(async (req, res) => {
  const invoiceNumber = String(req.params.invoiceNumber || "")
    .trim()
    .toUpperCase();
  const paymentId = String(req.params.paymentId || "").trim();
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new ApiError(404, "Invoice tidak ditemukan");
  }

  const removedPayment = (invoice.payments || []).find(
    (payment) => String(payment._id) === paymentId,
  );
  const nextPayments = (invoice.payments || []).filter(
    (payment) => String(payment._id) !== paymentId,
  );
  if (nextPayments.length === (invoice.payments || []).length) {
    throw new ApiError(404, "Pembayaran tidak ditemukan");
  }

  await deleteLinkedAccountingTransaction(
    removedPayment?.transactionId,
    removedPayment,
  );

  const rebuilt = await buildInvoicePayload(
    {
      ...invoice.toObject(),
      payments: nextPayments,
    },
    { currentInvoice: invoice },
  );

  Object.assign(invoice, {
    ...rebuilt,
    payments: nextPayments,
    updatedBy: req.user?.userId || null,
  });
  await invoice.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await serializeInvoiceWithSplits(invoice),
        "Pembayaran berhasil dihapus",
      ),
    );
});