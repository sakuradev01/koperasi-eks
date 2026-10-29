import {
  calculateSavingsSchedule,
  getFirstIncompletePeriod,
  PAID_SAVINGS_STATUSES,
} from "../../../services/savingsSchedule.service.js";
import {
  getEffectiveMembershipStatus,
  getMembershipStatusMessage,
} from "../../../utils/membershipStatus.js";

const failure = (statusCode, body) => ({ statusCode, body });

const isBlankAddress = (value) => !String(value || "").trim();

const hasRequiredIdentityDocuments = (member) =>
  [
    member.ktpImage,
    member.selfieImage,
    member.livenessLeftImage,
    member.livenessRightImage,
  ].every((value) => String(value || "").trim().length > 10);

const isIdentityVerificationBlocked = (member) =>
  !hasRequiredIdentityDocuments(member) ||
  ["pending", "rejected"].includes(member.identityVerifyStatus || "none");

const isAddressVerificationBlocked = (member) =>
  ["pending", "rejected"].includes(member.addressUpdateStatus || "none");

export function createMemberSavingsSubmission({
  memberRepository,
  productRepository,
  savingsRepository,
  withdrawalRepository = null,
  proofStorage,
  scheduleCalculator = calculateSavingsSchedule,
  clock = () => new Date(),
}) {
  return {
    async execute({ memberId, input = {}, proofFile = null }) {
      const {
        amount,
        productId,
        description,
        installmentPeriod,
        paymentDate,
      } = input;
      const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;

      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return failure(400, {
          success: false,
          message: "Jumlah saving harus lebih dari 0",
        });
      }

      const member = await memberRepository.findForSavings(memberId);
      if (!member) {
        return failure(404, {
          success: false,
          message: "Member tidak ditemukan",
        });
      }

      const membershipStatus = getEffectiveMembershipStatus(member);
      if (membershipStatus !== "active") {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: membershipStatus === "draft" ? "MEMBERSHIP_DRAFT" : "MEMBERSHIP_INACTIVE",
          membershipStatus,
          message: getMembershipStatusMessage(membershipStatus),
        });
      }

      if (withdrawalRepository) {
        const openWithdrawal = await withdrawalRepository.findOpenByMember(member._id);
        if (openWithdrawal) {
          await proofStorage.discard(proofFile);
          return failure(409, {
            success: false,
            code: "SAVINGS_WITHDRAWAL_PENDING",
            message: "Pengajuan tutup tabungan sedang diproses. Setoran baru dibuka kembali jika pengajuan ditolak.",
          });
        }
      }

      if (isBlankAddress(member.completeAddress)) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: "ADDRESS_REQUIRED",
          message: "Mohon lengkapi alamat anda sebelum upload pembayaran.",
        });
      }

      if (isAddressVerificationBlocked(member)) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: member.addressUpdateStatus === "rejected"
            ? "ADDRESS_REJECTED"
            : "ADDRESS_PENDING_VERIFICATION",
          message: member.addressUpdateStatus === "rejected"
            ? "Alamat ditolak: " + (
              member.addressUpdateRejectionReason || "Silakan perbaiki dan kirim ulang."
            )
            : "Alamat terbaru sedang menunggu verifikasi admin. Upload pembayaran aktif kembali setelah disetujui.",
        });
      }

      if (isIdentityVerificationBlocked(member)) {
        await proofStorage.discard(proofFile);
        const identityStatus = member.identityVerifyStatus || "none";

        if (identityStatus === "pending") {
          return failure(409, {
            success: false,
            code: "IDENTITY_PENDING_VERIFICATION",
            message:
              "Dokumen verifikasi wajah sedang menunggu verifikasi admin. Upload pembayaran aktif kembali setelah disetujui.",
          });
        }
        if (identityStatus === "rejected") {
          return failure(409, {
            success: false,
            code: "IDENTITY_REJECTED",
            message: "Verifikasi wajah ditolak: " + (
              member.identityVerifyRejectionReason || "Silakan kirim ulang dokumen."
            ),
          });
        }
        return failure(409, {
          success: false,
          code: "IDENTITY_DOCS_REQUIRED",
          message:
            "Akun lama wajib melengkapi verifikasi wajah (KTP, selfie, liveness kiri/kanan) sebelum upload pembayaran.",
        });
      }

      if (!member.productId) {
        return failure(400, {
          success: false,
          message:
            "Product ID diperlukan untuk membuat saving. Silakan hubungi admin untuk mengatur produk member.",
        });
      }

      const requestedProductId = String(productId || member.productId);
      if (requestedProductId !== String(member.productId)) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: "PRODUCT_MISMATCH",
          message: "Produk pembayaran tidak sesuai dengan produk simpanan Anda.",
        });
      }

      const product = await productRepository.findById(member.productId);
      if (!product) {
        return failure(404, {
          success: false,
          message: "Product tidak ditemukan",
        });
      }

      const paidSavings = await savingsRepository.findPaidSetoran(
        member._id,
        PAID_SAVINGS_STATUSES,
      );
      const schedule = scheduleCalculator({
        termDuration: product.termDuration,
        baseDeposit: product.depositAmount,
        upgrade: member.currentUpgradeId,
        savings: paidSavings,
      });
      const firstIncompletePeriod = getFirstIncompletePeriod(schedule);

      if (!firstIncompletePeriod) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: "SAVINGS_COMPLETE",
          message: "Seluruh periode simpanan sudah lunas.",
        });
      }

      const parsedPeriod = installmentPeriod === undefined || installmentPeriod === ""
        ? firstIncompletePeriod.period
        : Number(installmentPeriod);
      const finalPeriod = Math.trunc(parsedPeriod);
      if (!Number.isInteger(finalPeriod) || finalPeriod < 1 || finalPeriod > schedule.termDuration) {
        await proofStorage.discard(proofFile);
        return failure(400, {
          success: false,
          code: "INVALID_INSTALLMENT_PERIOD",
          message: "Periode simpanan harus berada di antara 1 dan "
            + schedule.termDuration + ".",
        });
      }
      if (finalPeriod !== firstIncompletePeriod.period) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: "INSTALLMENT_SEQUENCE",
          message: "Pembayaran berikutnya adalah periode "
            + firstIncompletePeriod.period + ".",
          data: { nextPeriod: firstIncompletePeriod.period },
        });
      }

      const pendingExists = await savingsRepository.hasPendingSetoran(
        member._id,
        finalPeriod,
      );
      if (pendingExists) {
        await proofStorage.discard(proofFile);
        return failure(409, {
          success: false,
          code: "PAYMENT_PENDING",
          message: "Pembayaran pada periode ini masih menunggu verifikasi admin.",
        });
      }

      const existingSavingsCount = await savingsRepository.countForPeriod(
        member._id,
        product._id,
        finalPeriod,
      );
      const partialSequence = existingSavingsCount + 1;
      const paymentType =
        parsedAmount < firstIncompletePeriod.remaining ? "Partial" : "Full";
      const saving = await savingsRepository.create({
        memberId: member._id,
        productId: product._id,
        amount: parsedAmount,
        savingsDate: clock(),
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        installmentPeriod: finalPeriod,
        description: description
          || "Pembayaran Simpanan Periode - " + finalPeriod
            + (partialSequence > 1 ? " (#" + partialSequence + ")" : ""),
        type: "Setoran",
        status: "Pending",
        paymentType,
        partialSequence,
        notes: "",
        proofFile: proofFile ? proofFile.filename : null,
      });
      const populatedSaving = await savingsRepository.populateProduct(saving);

      return {
        statusCode: 201,
        body: {
          success: true,
          message: "Saving berhasil dibuat",
          data: {
            saving: populatedSaving,
            member: {
              uuid: member.uuid,
              name: member.name,
            },
          },
        },
      };
    },
  };
}
