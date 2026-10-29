import { ExpensePaymentProof } from "../../models/expensePaymentProof.model.js";
import { SavingsWithdrawal } from "../../models/savingsWithdrawal.model.js";
import { createMongooseWithdrawalRepository } from "../../modules/savings-withdrawal/infrastructure/mongooseWithdrawalRepository.js";
import {
  calculateSavingsWithdrawalSnapshot,
} from "../../modules/savings-withdrawal/domain/withdrawalPolicy.js";
import {
  createSubmitSavingsWithdrawal,
  SavingsWithdrawalError,
} from "../../modules/savings-withdrawal/application/submitWithdrawal.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";
import { getEffectiveMembershipStatus } from "../../utils/membershipStatus.js";

const repository = createMongooseWithdrawalRepository();
const submitWithdrawal = createSubmitSavingsWithdrawal({
  settingsRepository: repository,
  memberRepository: repository,
  savingsRepository: repository,
  withdrawalRepository: repository,
  expenseRepository: repository,
});

function respondError(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    success: false,
    code: error?.code || "SAVINGS_WITHDRAWAL_ERROR",
    message: statusCode === 500 ? "Pengajuan tutup tabungan gagal diproses." : error.message,
  });
}

export async function getMemberSavingsWithdrawalState(req, res) {
  try {
    const memberId = req.member?.memberId;
    const member = await repository.findForWithdrawal(memberId);
    if (!member) return res.status(404).json({ success: false, message: "Anggota tidak ditemukan." });

    const [setting, savings, latestRequest, openRequest, hasUnsettledSavingsPayment] = await Promise.all([
      repository.getStudentRequestSetting(),
      repository.findSavingsForMember(member._id),
      repository.findLatestByMember(member._id),
      repository.findOpenByMember(member._id),
      repository.hasUnsettledSavingsPayment({ memberId: member._id, memberUuid: member.uuid }),
    ]);
    const snapshot = calculateSavingsWithdrawalSnapshot({
      product: member.productId || {},
      upgrade: member.currentUpgradeId,
      savings,
    });
    const account = {
      bankName: member.bankName || "",
      accountNumber: member.accountNumber || "",
      accountHolder: member.accountHolderName || "",
    };
    const membershipStatus = getEffectiveMembershipStatus(member);
    const eligible = snapshot.canRequest && membershipStatus === "active";
    const expenseId = latestRequest?.expenseId?._id || latestRequest?.expenseId || null;
    const paymentProofs = latestRequest?.status === "paid" && expenseId
      ? await ExpensePaymentProof.find({ expenseId }).select("_id fileName uploadedAt").sort({ uploadedAt: -1 }).lean()
      : [];

    return res.status(200).json({
      success: true,
      data: {
        studentRequestEnabled: setting.studentRequestEnabled === true,
        canSubmit: setting.studentRequestEnabled === true && eligible && !openRequest && !hasUnsettledSavingsPayment,
        hasOpenRequest: Boolean(openRequest),
        hasUnsettledSavingsPayment,
        membershipStatus,
        productName: member.productId?.title || "",
        bankAccount: account,
        eligibility: snapshot,
        currentRequest: latestRequest ? { ...latestRequest, paymentProofs } : null,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function submitMemberSavingsWithdrawal(req, res) {
  try {
    const result = await submitWithdrawal.execute({
      memberId: req.member?.memberId,
      input: req.body || {},
    });
    return res.status(201).json({
      success: true,
      message: "Pengajuan tutup tabungan berhasil dikirim ke Finance.",
      data: result.request,
    });
  } catch (error) {
    return respondError(res, error);
  }
}

export async function streamMemberSavingsWithdrawalProof(req, res) {
  try {
    const memberId = req.member?.memberId;
    const request = await SavingsWithdrawal.findOne({ _id: req.params.id, memberId })
      .select("_id expenseId status")
      .lean();
    if (!request || request.status !== "paid" || !request.expenseId) {
      return res.status(404).json({ success: false, message: "Bukti pencairan tidak ditemukan." });
    }

    const proof = await ExpensePaymentProof.findOne({
      _id: req.params.proofId,
      expenseId: request.expenseId,
    }).lean();
    if (!proof) return res.status(404).json({ success: false, message: "Bukti pencairan tidak ditemukan." });

    const absolutePath = resolveUploadedFilePath(proof.fileName, { defaultSubdir: "expense-payment-proofs" });
    if (!absolutePath) return res.status(404).json({ success: false, message: "Berkas bukti tidak tersedia." });
    return res.sendFile(absolutePath, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return respondError(res, error);
  }
}

export { SavingsWithdrawalError };
