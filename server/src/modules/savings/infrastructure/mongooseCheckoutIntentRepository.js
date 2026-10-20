import { CheckoutIntent } from "../../../models/checkoutIntent.model.js";

export function createMongooseCheckoutIntentRepository() {
  return {
    async claim(invoiceNumber, now, staleBefore) {
      const claimed = await CheckoutIntent.findOneAndUpdate(
        {
          invoiceNumber,
          $or: [
            { status: "Pending" },
            { status: "Processing", processingAt: { $lt: staleBefore } },
            { status: "Processing", processingAt: null },
          ],
        },
        {
          $set: {
            status: "Processing",
            processingAt: now,
          },
        },
        { new: true },
      );

      if (claimed) return { intent: claimed, claimed: true };
      const intent = await CheckoutIntent.findOne({ invoiceNumber });
      return { intent, claimed: false };
    },

    resetProcessing(intentId) {
      return CheckoutIntent.updateOne(
        { _id: intentId, status: "Processing" },
        { $set: { status: "Pending" }, $unset: { processingAt: 1 } },
      );
    },

    async markPaid(intent, processedAt) {
      intent.status = "Paid";
      intent.processedAt = processedAt;
      intent.processingAt = null;
      await intent.save();
      return intent;
    },
  };
}
