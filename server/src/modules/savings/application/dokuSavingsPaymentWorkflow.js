import {
  getEffectiveMembershipStatus,
  getMembershipStatusMessage,
} from "../../../utils/membershipStatus.js";

export const normalizeWebhookAmount = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resetClaim = (repository, intentId) =>
  repository.resetProcessing(intentId);

export function createDokuSavingsPaymentWorkflow({
  checkoutIntentRepository,
  memberRepository,
  paymentCreator,
  clock = () => new Date(),
}) {
  return {
    async process({ invoiceNumber, amount, channelId }) {
      const now = clock();
      const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
      const { intent, claimed } = await checkoutIntentRepository.claim(
        invoiceNumber,
        now,
        staleBefore,
      );

      if (intent) {
        if (!claimed) {
          return {
            message: intent.status === "Paid"
              ? "Payment already processed"
              : "Payment is currently being processed",
          };
        }

        const callbackAmount = normalizeWebhookAmount(amount);
        if (
          callbackAmount > 0
          && Number(intent.chargedAmount) > 0
          && callbackAmount !== Number(intent.chargedAmount)
        ) {
          await resetClaim(checkoutIntentRepository, intent._id);
          throw new Error("Nominal callback tidak sesuai dengan checkout intent");
        }

        const member = await memberRepository.findByUuid(intent.studentUuid);
        if (intent.savingsAmount > 0 && !member) {
          await resetClaim(checkoutIntentRepository, intent._id);
          throw new Error("Member not found for UUID: " + intent.studentUuid);
        }

        if (
          intent.savingsAmount > 0
          && getEffectiveMembershipStatus(member) !== "active"
        ) {
          await resetClaim(checkoutIntentRepository, intent._id);
          throw new Error(
            getMembershipStatusMessage(getEffectiveMembershipStatus(member))
          );
        }

        try {
          const [saving, donation] = await Promise.all([
            paymentCreator.createSavingsFromIntent({ member, intent, channelId }),
            paymentCreator.createDonationFromIntent({ member, intent, channelId }),
          ]);

          await checkoutIntentRepository.markPaid(intent, clock());

          return {
            message: "Payment processed successfully",
            savingId: saving?._id || null,
            donationId: donation?._id || null,
          };
        } catch (error) {
          await resetClaim(checkoutIntentRepository, intent._id).catch(() => {});
          throw error;
        }
      }

      const { saving } = await paymentCreator.createLegacySaving({
        invoiceNumber,
        amount,
        channelId,
      });
      return {
        message: "Payment processed successfully",
        savingId: saving?._id || null,
      };
    },
  };
}
