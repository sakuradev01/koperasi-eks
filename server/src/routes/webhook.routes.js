import express from "express";
import { Savings } from "../models/savings.model.js";
import { Member } from "../models/member.model.js";
import { Product } from "../models/product.model.js";
import { Donation } from "../models/donation.model.js";
import { DonationCampaign } from "../models/donationCampaign.model.js";
import { CheckoutIntent } from "../models/checkoutIntent.model.js";
import { buildStudentDonationCode } from "../utils/donation.js";
import { getEffectiveMembershipStatus, getMembershipStatusMessage } from "../utils/membershipStatus.js";

const router = express.Router();

async function findMemberByUuid(memberUuid) {
  if (!memberUuid) return null;

  let member = await Member.findOne({ uuid: memberUuid });
  if (member) return member;

  const regex = new RegExp(`^${memberUuid}`);
  member = await Member.findOne({ uuid: regex });
  if (member) return member;

  const altUuid = `${memberUuid}-1234`;
  member = await Member.findOne({ uuid: altUuid });
  if (member) return member;

  const regexWithSuffix = new RegExp(`^${memberUuid}.*(-1234)?$`);
  return Member.findOne({ uuid: regexWithSuffix });
}

async function resolveProductForMember(member) {
  if (!member) return null;

  if (member.productId) {
    const product = await Product.findById(member.productId);
    if (product) return product;
  }

  if (member.currentProductId) {
    const product = await Product.findById(member.currentProductId);
    if (product) return product;
  }

  return Product.findOne({ isActive: true }).sort({ createdAt: 1 });
}

function formatRupiah(amount) {
  return Number(amount || 0).toLocaleString("id-ID");
}

async function createSavingsFromIntent({ member, intent, channelId }) {
  if (!intent || !member || !intent.savingsAmount) {
    return null;
  }

  const existingSaving = await Savings.findOne({
    memberId: member._id,
    invoiceNumber: intent.invoiceNumber,
  });

  if (existingSaving) {
    return existingSaving;
  }

  const membershipStatus = getEffectiveMembershipStatus(member);
  if (membershipStatus !== "active") {
    throw new Error(getMembershipStatusMessage(membershipStatus));
  }

  const product = await resolveProductForMember(member);
  if (!product) {
    throw new Error("Produk simpanan member tidak ditemukan");
  }

  const installmentPeriod = parseInt(intent.installmentPeriod, 10) || 1;
  const existingSavingsCount = await Savings.countDocuments({
    memberId: member._id,
    productId: product._id,
    installmentPeriod,
  });
  const partialSequence = existingSavingsCount + 1;

  const projectionAmount = Number(intent.projectionAmount) || Number(product.depositAmount) || 0;
  const paidAmountBefore = Number(intent.alreadyPaidAmount) || 0;
  const paymentAmount = Number(intent.savingsAmount) || 0;
  const donationAmount = Number(intent.donationAmount) || 0;
  const finalPaidAmount = paidAmountBefore + paymentAmount;
  const calculatedPaymentType = paymentAmount < projectionAmount ? "Partial" : "Full";
  const savingStatus = projectionAmount > 0 && finalPaidAmount >= projectionAmount ? "Approved" : "Partial";
  const donationSuffix = donationAmount > 0 ? ` + Donasi Rp ${formatRupiah(donationAmount)}` : "";
  const description = `Pembayaran Simpanan Periode - ${installmentPeriod}${partialSequence > 1 ? ` (#${partialSequence})` : ""}${donationSuffix}`;

  const newSaving = new Savings({
    memberId: member._id,
    productId: product._id,
    type: "Setoran",
    amount: paymentAmount,
    installmentPeriod,
    savingsDate: new Date(),
    paymentDate: new Date(),
    status: savingStatus,
    paymentType: calculatedPaymentType,
    partialSequence,
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS") ? "QRIS" : "DOKU_CHECKOUT",
    description,
    notes: `Auto-approved via DOKU webhook${channelId ? ` - Channel: ${channelId}` : ""} - Invoice: ${intent.invoiceNumber}`,
    approvedBy: null,
    approvedAt: new Date(),
    invoiceNumber: intent.invoiceNumber,
  });

  await newSaving.save();
  return newSaving;
}

async function createDonationFromIntent({ member, intent, channelId }) {
  if (!intent || !intent.donationAmount) {
    return null;
  }

  const existingDonation = await Donation.findOne({
    invoiceNumber: intent.invoiceNumber,
  });

  if (existingDonation) {
    return existingDonation;
  }

  const campaign = intent.campaignId
    ? await DonationCampaign.findById(intent.campaignId)
    : await DonationCampaign.findOne({ isActive: true }).sort({ collectUntil: -1 });

  const studentUuid = String(intent.studentUuid || member?.uuid || "").trim();
  const studentName = String(intent.studentName || member?.name || studentUuid || "Student").trim();

  const donation = new Donation({
    studentUuid,
    studentName,
    studentCode: buildStudentDonationCode(studentUuid),
    memberId: member?._id || null,
    campaignId: campaign?._id || null,
    campaignTitle: campaign?.title || "",
    beneficiaryName: campaign?.beneficiaryName || "",
    amount: Number(intent.donationAmount),
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS") ? "QRIS" : "DOKU_CHECKOUT",
    source: intent.source === "savings_payment" ? "savings_payment" : "donation_page",
    status: "Approved",
    description:
      intent.source === "savings_payment"
        ? `Donasi ikut pembayaran tabungan - Invoice: ${intent.invoiceNumber}`
        : `Donasi via QRIS - Invoice: ${intent.invoiceNumber}`,
    notes: `Auto-approved via DOKU webhook${channelId ? ` - Channel: ${channelId}` : ""}`,
    invoiceNumber: intent.invoiceNumber,
    installmentPeriod: intent.installmentPeriod || null,
    paymentDate: new Date(),
    approvedAt: new Date(),
    checkoutIntentId: intent._id,
  });

  await donation.save();
  return donation;
}

async function createLegacySaving({ invoiceNumber, amount, channelId }) {
  const invoiceMatch = invoiceNumber.match(/^SAV-(.+?)-P(\d+)-(\d+)$/);
  if (!invoiceMatch) {
    throw new Error("Invalid invoice format");
  }

  const memberUuid = invoiceMatch[1];
  const installmentPeriod = parseInt(invoiceMatch[2], 10) || 1;
  const member = await findMemberByUuid(memberUuid);

  if (!member) {
    throw new Error(`Member not found for UUID: ${memberUuid}`);
  }

  const existingSaving = await Savings.findOne({
    memberId: member._id,
    invoiceNumber,
  });

  if (existingSaving) {
    return { saving: existingSaving, member };
  }

  const membershipStatus = getEffectiveMembershipStatus(member);
  if (membershipStatus !== "active") {
    throw new Error(getMembershipStatusMessage(membershipStatus));
  }

  const product = await resolveProductForMember(member);
  if (!product) {
    throw new Error("Produk simpanan member tidak ditemukan");
  }

  const existingSavingsCount = await Savings.countDocuments({
    memberId: member._id,
    productId: product._id,
    installmentPeriod,
  });
  const partialSequence = existingSavingsCount + 1;

  const parsedAmount = parseInt(amount, 10) || 0;
  const calculatedPaymentType = parsedAmount < product.depositAmount ? "Partial" : "Full";
  const savingStatus = calculatedPaymentType === "Partial" ? "Partial" : "Approved";
  const description = `Pembayaran Simpanan Periode - ${installmentPeriod}${partialSequence > 1 ? ` (#${partialSequence})` : ""}`;

  const saving = await Savings.create({
    memberId: member._id,
    productId: product._id,
    type: "Setoran",
    amount: parsedAmount,
    installmentPeriod,
    savingsDate: new Date(),
    paymentDate: new Date(),
    status: savingStatus,
    paymentType: calculatedPaymentType,
    partialSequence,
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS") ? "QRIS" : "DOKU_CHECKOUT",
    description,
    notes: `Auto-approved via DOKU webhook${channelId ? ` - Channel: ${channelId}` : ""} - Invoice: ${invoiceNumber}`,
    approvedBy: null,
    approvedAt: new Date(),
    invoiceNumber,
  });

  return { saving, member };
}

const normalizeWebhookAmount = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function claimCheckoutIntent(invoiceNumber) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
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
  const existing = await CheckoutIntent.findOne({ invoiceNumber });
  return { intent: existing, claimed: false };
}

async function processSuccessfulPayment({ invoiceNumber, amount, channelId }) {
  const { intent, claimed } = await claimCheckoutIntent(invoiceNumber);

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
      callbackAmount > 0 &&
      Number(intent.chargedAmount) > 0 &&
      callbackAmount !== Number(intent.chargedAmount)
    ) {
      await CheckoutIntent.updateOne(
        { _id: intent._id, status: "Processing" },
        { $set: { status: "Pending" }, $unset: { processingAt: 1 } },
      );
      throw new Error("Nominal callback tidak sesuai dengan checkout intent");
    }

    const member = await findMemberByUuid(intent.studentUuid);
    if (intent.savingsAmount > 0 && !member) {
      await CheckoutIntent.updateOne(
        { _id: intent._id, status: "Processing" },
        { $set: { status: "Pending" }, $unset: { processingAt: 1 } },
      );
      throw new Error(`Member not found for UUID: ${intent.studentUuid}`);
    }

    if (intent.savingsAmount > 0 && getEffectiveMembershipStatus(member) !== "active") {
      await CheckoutIntent.updateOne(
        { _id: intent._id, status: "Processing" },
        { $set: { status: "Pending" }, $unset: { processingAt: 1 } },
      );
      throw new Error(getMembershipStatusMessage(getEffectiveMembershipStatus(member)));
    }

    try {
      const [saving, donation] = await Promise.all([
        createSavingsFromIntent({ member, intent, channelId }),
        createDonationFromIntent({ member, intent, channelId }),
      ]);

      intent.status = "Paid";
      intent.processedAt = new Date();
      intent.processingAt = null;
      await intent.save();

      return {
        message: "Payment processed successfully",
        savingId: saving?._id || null,
        donationId: donation?._id || null,
      };
    } catch (error) {
      await CheckoutIntent.updateOne(
        { _id: intent._id, status: "Processing" },
        { $set: { status: "Pending" }, $unset: { processingAt: 1 } },
      ).catch(() => {});
      throw error;
    }
  }

  const { saving } = await createLegacySaving({ invoiceNumber, amount, channelId });
  return {
    message: "Payment processed successfully",
    savingId: saving?._id || null,
  };
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
