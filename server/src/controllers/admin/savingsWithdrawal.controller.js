import { createMongooseWithdrawalRepository } from "../../modules/savings-withdrawal/infrastructure/mongooseWithdrawalRepository.js";
import { createTransactionFromExpense, deleteLinkedTransactionForExpense } from "../../services/expenseAccounting.service.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";
import {
  createRecordLegacySavingsWithdrawal,
} from "../../modules/savings-withdrawal/application/recordLegacyWithdrawal.js";
import {
  updateSavingsWithdrawalBankFee,
} from "../../modules/savings-withdrawal/application/syncWithdrawalExpense.js";
import fs from "fs/promises";

const repository = createMongooseWithdrawalRepository();
const legacyWithdrawal = createRecordLegacySavingsWithdrawal({
  memberRepository: {
    findForWithdrawalById: (id) => repository.findForWithdrawalById(id),
    markWithdrawalPaid: ({ memberId, userId, now }) => repository.updateMemberPaid({ memberId, userId, now }),
  },
  savingsRepository: { findForMember: (memberId) => repository.findSavingsForMember(memberId) },
  withdrawalRepository: repository,
  expenseRepository: {
    assertAccountsExist: (accountId, categoryIds) => repository.assertAccountsExist(accountId, categoryIds),
    create: (data) => repository.createExpense(data),
    createLines: (expenseId, lines) => repository.createLines(expenseId, lines),
    createPaymentProof: (expenseId, fileName, paidBy) => repository.createPaymentProof(expenseId, fileName, paidBy),
    deleteById: (expenseId) => repository.deleteExpenseById(expenseId),
    deleteLines: (expenseId) => repository.deleteLines(expenseId),
    deletePaymentProofs: (expenseId) => repository.deletePaymentProofs(expenseId),
  },
  accountingGateway: {
    createTransactionFromExpense,
    deleteLinkedTransaction: deleteLinkedTransactionForExpense,
  },
  proofStorage: {
    discard: async (file) => {
      if (!file?.filename) return;
      const filePath = resolveUploadedFilePath(file.filename, { defaultSubdir: "expense-payment-proofs" });
      if (filePath) await fs.unlink(filePath).catch(() => {});
    },
  },
});

const respondError = (res, error) => res.status(Number(error?.statusCode) || 500).json({
  success: false,
  message: Number(error?.statusCode) ? error.message : "Permintaan penutupan tabungan gagal diproses.",
});

export async function getSavingsWithdrawalSettings(req, res) {
  try {
    const settings = await repository.getStudentRequestSetting();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function updateSavingsWithdrawalSettings(req, res) {
  const enabled = req.body?.studentRequestEnabled;
  if (typeof enabled !== "boolean") {
    return res.status(422).json({ success: false, message: "Nilai toggle harus true atau false." });
  }
  try {
    const settings = await repository.updateStudentRequestSetting({
      enabled,
      userId: req.user?.userId,
    });
    return res.status(200).json({
      success: true,
      message: enabled ? "Pengajuan tutup tabungan siswa diaktifkan." : "Pengajuan tutup tabungan siswa dinonaktifkan.",
      data: settings,
    });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function listSavingsWithdrawals(req, res) {
  try {
    const data = await repository.list({
      status: req.query.status || "all",
      memberId: req.query.memberId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function getSavingsWithdrawalDetail(req, res) {
  try {
    const request = await repository.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan." });
    return res.status(200).json({ success: true, data: request });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function setSavingsWithdrawalBankFee(req, res) {
  try {
    const request = await updateSavingsWithdrawalBankFee({
      requestId: req.params.id,
      feeAmount: req.body?.bankFeeAmount,
      withdrawalRepository: repository,
      userId: req.user?.userId,
    });
    return res.status(200).json({
      success: true,
      message: "Biaya antarbank dan estimasi pencairan berhasil diperbarui.",
      data: request,
    });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function recordLegacySavingsWithdrawal(req, res) {
  const uploadedProof = req.file;
  let lines = req.body?.lines;
  if (typeof lines === "string") {
    try {
      lines = JSON.parse(lines);
    } catch {
      lines = [];
    }
  }
  try {
    const member = await repository.findForWithdrawalByUuid(req.params.uuid);
    if (!member) return res.status(404).json({ success: false, message: "Anggota tidak ditemukan." });
    const result = await legacyWithdrawal.execute({
      memberId: member._id,
      input: { ...req.body, lines },
      proofFile: uploadedProof,
      actor: { id: req.user?.userId, name: req.user?.name },
    });
    return res.status(201).json({
      success: true,
      message: "Penutupan tabungan lama berhasil dibukukan ke Expense dan transaksi.",
      data: {
        request: result.request,
        expenseId: result.expense._id,
        transactionId: result.transaction?._id,
      },
    });
  } catch (error) {
    if (uploadedProof?.filename) {
      const filePath = resolveUploadedFilePath(uploadedProof.filename, { defaultSubdir: "expense-payment-proofs" });
      if (filePath) await fs.unlink(filePath).catch(() => {});
    }
    return respondError(res, error);
  }
}
