import express from "express";
import {
  createDokuSavingsPaymentWorkflow,
} from "../modules/savings/application/dokuSavingsPaymentWorkflow.js";
import {
  createMongooseCheckoutIntentRepository,
} from "../modules/savings/infrastructure/mongooseCheckoutIntentRepository.js";
import {
  createMongooseDokuPaymentGateway,
} from "../modules/savings/infrastructure/mongooseDokuPaymentGateway.js";

const router = express.Router();

const dokuPaymentGateway = createMongooseDokuPaymentGateway();
const dokuSavingsPaymentWorkflow = createDokuSavingsPaymentWorkflow({
  checkoutIntentRepository: createMongooseCheckoutIntentRepository(),
  memberRepository: dokuPaymentGateway.memberRepository,
  paymentCreator: dokuPaymentGateway.paymentCreator,
});

async function processSuccessfulPayment({ invoiceNumber, amount, channelId }) {
  return dokuSavingsPaymentWorkflow.process({
    invoiceNumber,
    amount,
    channelId,
  });
}
router.post("/doku-checkout", async (req, res) => {
  try {
    console.log("DOKU Checkout Webhook received:", JSON.stringify(req.body, null, 2));

    const { order, transaction, channel } = req.body;
    if (!order || !transaction) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const invoiceNumber = order.invoice_number;
    const amount = order.amount;
    const status = transaction.status;
    const channelId = channel?.id || transaction.payment_channel || null;

    if (status !== "SUCCESS") {
      return res.status(200).json({ message: "Webhook received" });
    }

    const result = await processSuccessfulPayment({
      invoiceNumber,
      amount,
      channelId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error processing DOKU webhook:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.post("/doku-qris", async (req, res) => {
  try {
    console.log("DOKU QRIS Webhook received:", JSON.stringify(req.body, null, 2));

    const invoiceNumber = req.body.INVOICE;
    const amount = req.body.AMOUNT;
    const txnStatus = req.body.TXNSTATUS;

    if (txnStatus !== "S") {
      return res.status(200).json({ message: "Webhook received" });
    }

    const result = await processSuccessfulPayment({
      invoiceNumber,
      amount,
      channelId: "QRIS",
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error processing DOKU QRIS webhook:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

export default router;
