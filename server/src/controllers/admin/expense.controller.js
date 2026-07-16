import fs from "fs";
import { Expense } from "../../models/expense.model.js";
import { ExpenseLine } from "../../models/expenseLine.model.js";
import { ExpenseAttachment } from "../../models/expenseAttachment.model.js";
import { ExpensePaymentProof } from "../../models/expensePaymentProof.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";
import { Member } from "../../models/member.model.js";
import { AccountingTransaction } from "../../models/accountingTransaction.model.js";
import {
  createTransactionFromExpense,
  syncTransactionDateForExpense,
  deleteLinkedTransactionForExpense,
} from "../../services/expenseAccounting.service.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";

const VALID_STATUSES = new Set([
  "uncategorized",
  "pending",
  "waiting_approval",
  "approved",
  "waiting_payment",
  "paid",
  "rejected",
]);

function normalizeMoney(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseJsonArray(rawValue) {
  if (Array.isArray(rawValue)) return rawValue;
  if (!rawValue) return [];
  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseExpenseLines(body) {
  const source = body.expense_lines ?? body.expenseLine ?? body.lines ?? body.expenseLines;
  const rows = parseJsonArray(source);
  return rows
    .map((row) => ({
      categoryId: row.categoryId ?? row.category_id ?? row.category ?? null,
      description: normalizeText(row.description ?? row.notes ?? ""),
      amount: normalizeMoney(row.amount),
    }))
    .filter((row) => row.categoryId && row.amount > 0);
}

function getLineAmountTotal(lines = []) {
  return lines.reduce((sum, line) => sum + normalizeMoney(line.amount), 0);
}

function hasExpenseLinesInput(body) {
  return ["expense_lines", "expenseLine", "lines", "expenseLines"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function getUploadedFieldFiles(req, fieldNames = []) {
  const files = [];
  for (const fieldName of fieldNames) {
    if (Array.isArray(req.files?.[fieldName])) {
      files.push(...req.files[fieldName]);
    }
  }
  return files;
}

function removeUploadedFile(storedName, defaultSubdir) {
  if (!storedName) return;
  const fullPath = resolveUploadedFilePath(storedName, { defaultSubdir });
  if (!fullPath) return;
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // ignore cleanup failures
  }
}

async function resolveApplicantPayload(body, fallback = {}) {
  const requestedType = normalizeText(body.applicant_type ?? body.applicantType ?? fallback.applicantType).toLowerCase();
  const applicantType = requestedType === "member" ? "member" : "staff";

  if (applicantType === "member") {
    const memberId = body.applicant_member_id ?? body.applicantMemberId ?? fallback.applicantMemberId ?? null;
    if (!memberId) {
      return { error: "Applicant member wajib diisi." };
    }

    const member = await Member.findById(memberId).select("_id name uuid").lean();
    if (!member) {
      return { error: "Member applicant tidak ditemukan." };
    }

    return {
      applicantType: "member",
      applicantMemberId: member._id,
      applicantName: member.name || "-",
      applicantUuidSnapshot: member.uuid || "",
    };
  }

  const applicantName = normalizeText(body.applicant_name ?? body.applicantName ?? fallback.applicantName);
  if (!applicantName) {
    return { error: "Applicant name wajib diisi untuk staff." };
  }

  const applicantUuidSnapshot = normalizeText(
    body.applicant_uuid_snapshot ?? body.applicantUuidSnapshot ?? fallback.applicantUuidSnapshot
  );

  return {
    applicantType: "staff",
    applicantMemberId: null,
    applicantName,
    applicantUuidSnapshot,
  };
}

async function buildExpenseDetail(expenseDoc) {
  const expense = expenseDoc?.toObject ? expenseDoc.toObject() : expenseDoc;
  if (!expense) return null;

  const [linesRaw, attachments, paymentProofs, linkedTransaction, member, paymentAccount] = await Promise.all([
    ExpenseLine.find({ expenseId: expense._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    ExpenseAttachment.find({ expenseId: expense._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    ExpensePaymentProof.find({ expenseId: expense._id }).sort({ uploadedAt: -1, _id: -1 }).lean(),
    AccountingTransaction.findOne({ expenseId: expense._id }).select("_id transactionDate amount accountId").lean(),
    expense.applicantMemberId ? Member.findById(expense.applicantMemberId).select("_id name uuid email").lean() : null,
    expense.accountId ? CoaAccount.findById(expense.accountId).select("_id accountName accountCode currency").lean() : null,
  ]);

  const accountIds = linesRaw.map((line) => line.categoryId).filter(Boolean);
  const accountRows = accountIds.length
    ? await CoaAccount.find({ _id: { $in: accountIds } }).select("_id accountName accountCode").lean()
    : [];

  const accountMap = new Map(accountRows.map((row) => [String(row._id), row]));
  const lines = linesRaw.map((line) => {
    const account = accountMap.get(String(line.categoryId));
    return {
      ...line,
      accountName: account?.accountName || "-",
      accountCode: account?.accountCode || "",
    };
  });

  return {
    ...expense,
    lines,
    attachments,
    paymentProofs,
    linkedTransaction,
    member,
    paymentAccount,
  };
}

export const getExpenseAdmin = async (req, res) => {
  try {
    const year = Number.parseInt(req.query.year, 10) || new Date().getFullYear();
    const monthNow = new Date().getMonth() + 1;

    const startYear = new Date(year, 0, 1);
    const endYear = new Date(year + 1, 0, 1);

    const monthlyAgg = await Expense.aggregate([
      { $match: { dateStart: { $gte: startYear, $lt: endYear } } },
      {
        $group: {
          _id: { $month: "$dateStart" },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthlyData = Array.from({ length: 12 }, () => 0);
    for (const row of monthlyAgg) {
      const idx = Number(row._id) - 1;
      if (idx >= 0 && idx < 12) monthlyData[idx] = Number(row.total || 0);
    }

    const [sumApprovedYear, sumAll, sumWaiting, sumRejected, topApplicants, latestPending, pendingExpenses, approvedExpenses] = await Promise.all([
      Expense.aggregate([
        {
          $match: {
            dateStart: { $gte: startYear, $lt: endYear },
            status: { $in: ["approved", "waiting_payment", "paid"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
      Expense.aggregate([
        { $match: { status: { $in: ["pending", "waiting_approval", "waiting_payment"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: { status: "rejected" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        {
          $match: {
            dateStart: { $gte: startYear, $lt: endYear },
            $expr: { $eq: [{ $month: "$dateStart" }, monthNow] },
          },
        },
        {
          $group: {
            _id: "$applicantName",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),
      Expense.find({ status: "uncategorized" }).sort({ createdAt: -1 }).limit(5).lean(),
      Expense.find({ status: "pending" }).sort({ updatedAt: -1 }).limit(5).lean(),
      Expense.find({ status: { $in: ["approved", "paid"] } }).sort({ updatedAt: -1 }).limit(5).lean(),
    ]);

    const expenses = await Expense.find({}).select("_id").lean();
    const expenseIds = expenses.map((item) => item._id);
    const categoryTotals = expenseIds.length
      ? await ExpenseLine.aggregate([
        { $match: { expenseId: { $in: expenseIds } } },
        {
          $group: {
            _id: "$categoryId",
            total: { $sum: "$amount" },
          },
        },
        { $sort: { total: -1 } },
      ])
      : [];

    const categoryIds = categoryTotals.map((item) => item._id).filter(Boolean);
    const categoryAccounts = categoryIds.length
      ? await CoaAccount.find({ _id: { $in: categoryIds } }).select("_id accountName").lean()
      : [];
    const categoryNameMap = new Map(categoryAccounts.map((account) => [String(account._id), account.accountName]));

    res.status(200).json({
      success: true,
      data: {
        year,
        monthLabels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
        monthlyData,
        totalThisYear: Number(sumApprovedYear[0]?.total || 0),
        totalAll: Number(sumAll[0]?.total || 0),
        totalWaiting: Number(sumWaiting[0]?.total || 0),
        totalRejected: Number(sumRejected[0]?.total || 0),
        topApplicants,
        latestPending,
        pendingExpenses,
        approvedExpenses,
        categoryBreakdown: categoryTotals.map((item) => ({
          categoryId: item._id,
          categoryName: categoryNameMap.get(String(item._id)) || "Unknown",
          total: Number(item.total || 0),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getExpenseReport = async (req, res) => {
  try {
    const statusFilter = normalizeText(req.query.status || "").toLowerCase();
    const search = normalizeText(req.query.search || "");

    const filter = {};
    if (statusFilter && VALID_STATUSES.has(statusFilter)) {
      filter.status = statusFilter;
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { title: regex },
        { applicantName: regex },
        { applicantUuidSnapshot: regex },
        { seller: regex },
      ];
    }

    const expenses = await Expense.find(filter).sort({ createdAt: -1, _id: -1 }).lean();
    const expenseIds = expenses.map((item) => item._id);

    const [lines, attachments] = await Promise.all([
      expenseIds.length ? ExpenseLine.find({ expenseId: { $in: expenseIds } }).select("expenseId").lean() : [],
      expenseIds.length
        ? ExpenseAttachment.find({ expenseId: { $in: expenseIds } })
            .select("_id expenseId originalName mimeType size createdAt")
            .sort({ createdAt: 1, _id: 1 })
            .lean()
        : [],
    ]);

    const lineCountMap = new Map();
    for (const line of lines) {
      const key = String(line.expenseId);
      lineCountMap.set(key, (lineCountMap.get(key) || 0) + 1);
    }

    const attachmentMap = new Map();
    for (const attachment of attachments) {
      const key = String(attachment.expenseId);
      if (!attachmentMap.has(key)) attachmentMap.set(key, []);
      attachmentMap.get(key).push(attachment);
    }

    const enriched = expenses.map((expense) => {
      const key = String(expense._id);
      const attachmentList = attachmentMap.get(key) || [];
      return {
        ...expense,
        productionCount: lineCountMap.get(key) || 0,
        attachmentCount: attachmentList.length,
        firstAttachment: attachmentList[0] || null,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        items: enriched,
        statusFilter: statusFilter || null,
        searchQuery: search,
        total: enriched.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getExpenseDetail = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).lean();
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan" });
    }

    const detail = await buildExpenseDetail(expense);
    return res.status(200).json({ success: true, data: detail });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createExpense = async (req, res) => {
  try {
    const body = req.body || {};
    const title = normalizeText(body.title);
    const seller = normalizeText(body.seller);
    const description = normalizeText(body.description);
    const dateStart = toDate(body.date_start ?? body.dateStart);
    const dateEnd = toDate(body.date_end ?? body.dateEnd ?? body.date_start ?? body.dateStart);
    const amount = normalizeMoney(body.amount ?? body.total);
    const accountId = body.account_id ?? body.accountId ?? null;

    if (!title || !dateStart || !dateEnd || amount <= 0) {
      return res.status(400).json({ success: false, message: "Data expense tidak lengkap atau tidak valid." });
    }

    const applicantPayload = await resolveApplicantPayload(body, {});
    if (applicantPayload.error) {
      return res.status(400).json({ success: false, message: applicantPayload.error });
    }

    const lines = parseExpenseLines(body);
    if (lines.length > 0) {
      const linesTotal = getLineAmountTotal(lines);
      if (Math.abs(linesTotal - amount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: "Total kategori expense harus sama dengan total amount.",
        });
      }
    }

    const explicitStatus = normalizeText(body.status).toLowerCase();
    const status = VALID_STATUSES.has(explicitStatus)
      ? explicitStatus
      : (lines.length > 0 ? "pending" : "uncategorized");

    const expense = await Expense.create({
      ...applicantPayload,
      title,
      dateStart,
      dateEnd,
      seller,
      amount,
      description,
      accountId: accountId || null,
      status,
      createdBy: req.user?.userId || null,
      updatedBy: req.user?.userId || null,
    });

    if (lines.length) {
      await ExpenseLine.insertMany(
        lines.map((line) => ({
          expenseId: expense._id,
          categoryId: line.categoryId,
          description: line.description,
          amount: line.amount,
        }))
      );
    }

    const attachments = getUploadedFieldFiles(req, ["attachments", "expense_attachments"]);
    if (attachments.length) {
      await ExpenseAttachment.insertMany(
        attachments.map((file) => ({
          expenseId: expense._id,
          fileName: file.filename,
          formToken: "",
        }))
      );
    }

    return res.status(201).json({
      success: true,
      message: "Expense berhasil dibuat.",
      data: { id: expense._id, status: expense.status },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const body = req.body || {};
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan" });
    }

    const updatePayload = {
      updatedBy: req.user?.userId || null,
    };

    const shouldUpdateApplicant = ["applicant_type", "applicantType", "applicant_member_id", "applicantMemberId", "applicant_name", "applicantName"].some(
      (key) => Object.prototype.hasOwnProperty.call(body, key)
    );
    if (shouldUpdateApplicant) {
      const applicantPayload = await resolveApplicantPayload(body, expense.toObject());
      if (applicantPayload.error) {
        return res.status(400).json({ success: false, message: applicantPayload.error });
      }
      Object.assign(updatePayload, applicantPayload);
    }

    if (Object.prototype.hasOwnProperty.call(body, "title")) updatePayload.title = normalizeText(body.title);
    if (Object.prototype.hasOwnProperty.call(body, "seller")) updatePayload.seller = normalizeText(body.seller);
    if (Object.prototype.hasOwnProperty.call(body, "description")) updatePayload.description = normalizeText(body.description);

    if (Object.prototype.hasOwnProperty.call(body, "date_start") || Object.prototype.hasOwnProperty.call(body, "dateStart")) {
      const parsedDate = toDate(body.date_start ?? body.dateStart);
      if (!parsedDate) {
        return res.status(400).json({ success: false, message: "Tanggal mulai tidak valid." });
      }
      updatePayload.dateStart = parsedDate;
    }

    if (Object.prototype.hasOwnProperty.call(body, "date_end") || Object.prototype.hasOwnProperty.call(body, "dateEnd")) {
      const parsedDate = toDate(body.date_end ?? body.dateEnd);
      if (!parsedDate) {
        return res.status(400).json({ success: false, message: "Tanggal akhir tidak valid." });
      }
      updatePayload.dateEnd = parsedDate;
    }

    if (Object.prototype.hasOwnProperty.call(body, "amount") || Object.prototype.hasOwnProperty.call(body, "total")) {
      const parsedAmount = normalizeMoney(body.amount ?? body.total);
      if (parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: "Total amount tidak valid." });
      }
      updatePayload.amount = parsedAmount;
    }

    if (Object.prototype.hasOwnProperty.call(body, "account_id") || Object.prototype.hasOwnProperty.call(body, "accountId")) {
      updatePayload.accountId = body.account_id ?? body.accountId ?? null;
    }

    let lines = [];
    if (hasExpenseLinesInput(body)) {
      lines = parseExpenseLines(body);
      const effectiveAmount = updatePayload.amount !== undefined
        ? normalizeMoney(updatePayload.amount)
        : normalizeMoney(expense.amount);

      if (lines.length > 0) {
        const linesTotal = getLineAmountTotal(lines);
        if (Math.abs(linesTotal - effectiveAmount) > 0.01) {
          return res.status(400).json({
            success: false,
            message: "Total kategori expense harus sama dengan total amount.",
          });
        }
      }

      await ExpenseLine.deleteMany({ expenseId: expense._id });
      if (lines.length) {
        await ExpenseLine.insertMany(
          lines.map((line) => ({
            expenseId: expense._id,
            categoryId: line.categoryId,
            description: line.description,
            amount: line.amount,
          }))
        );
      }
    }

    const currentLinesCount = hasExpenseLinesInput(body)
      ? lines.length
      : await ExpenseLine.countDocuments({ expenseId: expense._id });

    const requestedStatus = normalizeText(body.status).toLowerCase();
    if (VALID_STATUSES.has(requestedStatus)) {
      if (requestedStatus === "paid" && expense.status !== "paid") {
        return res.status(400).json({
          success: false,
          message: "Gunakan aksi mark-paid untuk mengubah status menjadi paid.",
        });
      }
      updatePayload.status = requestedStatus;
    } else if (expense.status === "uncategorized" && currentLinesCount > 0) {
      updatePayload.status = "pending";
    }

    if ((updatePayload.status || expense.status) === "paid") {
      const paidByName = normalizeText(body.paid_by_name ?? body.paidByName);
      const transferDate = toDate(body.transfer_date ?? body.transferDate);

      if (paidByName) updatePayload.paidBy = paidByName;
      if (transferDate) {
        updatePayload.transferDate = transferDate;
        await syncTransactionDateForExpense(expense._id, transferDate);
      }

      const paymentProofFiles = getUploadedFieldFiles(req, ["payment_proof_files", "payment_proofs"]);
      if (paymentProofFiles.length) {
        const proofDocs = paymentProofFiles.map((file) => ({
          expenseId: expense._id,
          fileName: file.filename,
          uploadedBy: paidByName || expense.paidBy || req.user?.name || "",
          uploadedAt: new Date(),
        }));
        await ExpensePaymentProof.insertMany(proofDocs);
        updatePayload.paymentProof = proofDocs[0].fileName;
      }
    }

    const attachmentFiles = getUploadedFieldFiles(req, ["attachments", "expense_attachments"]);
    if (attachmentFiles.length) {
      await ExpenseAttachment.insertMany(
        attachmentFiles.map((file) => ({
          expenseId: expense._id,
          fileName: file.filename,
          formToken: "",
        }))
      );
    }

    await Expense.updateOne({ _id: expense._id }, { $set: updatePayload });

    return res.status(200).json({
      success: true,
      message: "Expense berhasil diupdate.",
      data: {
        id: expense._id,
        status: updatePayload.status || expense.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan." });
    }

    const status = expense.status || "pending";
    let nextStatus = null;

    if (status === "uncategorized" || status === "pending") {
      nextStatus = "waiting_approval";
    } else if (status === "waiting_approval") {
      nextStatus = "approved";
    } else if (status === "approved") {
      nextStatus = "waiting_payment";
    } else if (status === "waiting_payment") {
      return res.status(200).json({
        success: true,
        data: {
          status: "require_payment_proof",
          message: "Silakan upload bukti transfer untuk mark as paid.",
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Status expense saat ini tidak bisa di-approve.",
      });
    }

    expense.status = nextStatus;
    expense.updatedBy = req.user?.userId || null;
    await expense.save();

    return res.status(200).json({
      success: true,
      message: `Status berhasil diupdate ke ${nextStatus}.`,
      data: { new_status: nextStatus },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan." });
    }

    const reason = normalizeText(req.body.reason);
    if (!reason || reason.length < 5) {
      return res.status(400).json({ success: false, message: "Alasan penolakan minimal 5 karakter." });
    }

    const allowed = new Set(["pending", "waiting_approval", "waiting_payment"]);
    if (!allowed.has(expense.status)) {
      return res.status(400).json({
        success: false,
        message: "Status expense saat ini tidak bisa ditolak.",
      });
    }

    expense.status = "rejected";
    expense.rejectReason = reason;
    expense.rejectedBy = req.user?.name || "Unknown";
    expense.rejectedAt = new Date();
    expense.updatedBy = req.user?.userId || null;
    await expense.save();

    return res.status(200).json({
      success: true,
      message: "Expense berhasil ditolak.",
      data: { new_status: "rejected" },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const markExpensePaid = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan." });
    }

    if (expense.status !== "waiting_payment") {
      return res.status(400).json({
        success: false,
        message: 'Hanya expense status "waiting_payment" yang bisa ditandai paid.',
      });
    }

    if (!expense.accountId) {
      return res.status(400).json({
        success: false,
        message: "Bank account belum diisi. Update expense dulu sebelum mark as paid.",
      });
    }

    const transferDate = toDate(req.body.transfer_date ?? req.body.transferDate);
    if (!transferDate) {
      return res.status(400).json({ success: false, message: "Tanggal transfer wajib diisi." });
    }

    const paidByName = normalizeText(req.body.paid_by_name ?? req.body.paidByName);
    if (!paidByName || paidByName.length < 3) {
      return res.status(400).json({ success: false, message: "Nama pengirim minimal 3 karakter." });
    }

    const paymentProofFiles = getUploadedFieldFiles(req, ["payment_proofs", "payment_proof_files"]);
    if (!paymentProofFiles.length) {
      return res.status(400).json({ success: false, message: "Bukti transfer wajib diupload." });
    }

    const proofDocs = paymentProofFiles.map((file) => ({
      expenseId: expense._id,
      fileName: file.filename,
      uploadedBy: paidByName,
      uploadedAt: new Date(),
    }));

    await ExpensePaymentProof.insertMany(proofDocs);

    expense.status = "paid";
    expense.paymentProof = proofDocs[0].fileName;
    expense.transferDate = transferDate;
    expense.paidBy = paidByName;
    expense.paidAt = new Date();
    expense.updatedBy = req.user?.userId || null;
    await expense.save();

    const result = await createTransactionFromExpense(expense, { transferDate });
    if (!result.success) {
      await Expense.updateOne(
        { _id: expense._id },
        {
          $set: {
            status: "waiting_payment",
            paymentProof: null,
            transferDate: null,
            paidBy: "",
            paidAt: null,
          },
        }
      );

      for (const proof of proofDocs) {
        removeUploadedFile(proof.fileName, "expense-payment-proofs");
      }
      await ExpensePaymentProof.deleteMany({ expenseId: expense._id, fileName: { $in: proofDocs.map((proof) => proof.fileName) } });

      return res.status(400).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: `Expense berhasil ditandai paid (${proofDocs.length} bukti transfer).`,
      data: {
        new_status: "paid",
        transaction_id: result.data?._id || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).lean();
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense tidak ditemukan." });
    }

    await deleteLinkedTransactionForExpense(expense._id);

    const [proofs, attachments] = await Promise.all([
      ExpensePaymentProof.find({ expenseId: expense._id }).lean(),
      ExpenseAttachment.find({ expenseId: expense._id }).lean(),
    ]);

    for (const proof of proofs) {
      removeUploadedFile(proof.fileName, "expense-payment-proofs");
    }
    for (const attachment of attachments) {
      removeUploadedFile(attachment.fileName, "expenses");
    }

    await Promise.all([
      ExpensePaymentProof.deleteMany({ expenseId: expense._id }),
      ExpenseAttachment.deleteMany({ expenseId: expense._id }),
      ExpenseLine.deleteMany({ expenseId: expense._id }),
      Expense.deleteOne({ _id: expense._id }),
    ]);

    return res.status(200).json({ success: true, message: "Expense berhasil dihapus." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExpenseAttachment = async (req, res) => {
  try {
    const attachment = await ExpenseAttachment.findById(req.params.id).lean();
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment tidak ditemukan." });
    }

    removeUploadedFile(attachment.fileName, "expenses");
    await ExpenseAttachment.deleteOne({ _id: attachment._id });

    return res.status(200).json({ success: true, message: "Attachment berhasil dihapus." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExpensePaymentProof = async (req, res) => {
  try {
    const proof = await ExpensePaymentProof.findById(req.params.id).lean();
    if (!proof) {
      return res.status(404).json({ success: false, message: "Bukti transfer tidak ditemukan." });
    }

    removeUploadedFile(proof.fileName, "expense-payment-proofs");
    await ExpensePaymentProof.deleteOne({ _id: proof._id });

    const expense = await Expense.findById(proof.expenseId);
    if (expense && expense.paymentProof === proof.fileName) {
      const fallbackProof = await ExpensePaymentProof.findOne({ expenseId: proof.expenseId }).sort({ uploadedAt: -1, _id: -1 }).lean();
      expense.paymentProof = fallbackProof?.fileName || null;
      await expense.save();
    }

    return res.status(200).json({ success: true, message: "Bukti transfer berhasil dihapus." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
