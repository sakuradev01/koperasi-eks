import { Savings } from "../../../models/savings.model.js";
import { Member } from "../../../models/member.model.js";
import { Product } from "../../../models/product.model.js";
import { Donation } from "../../../models/donation.model.js";
import { DonationCampaign } from "../../../models/donationCampaign.model.js";
import { buildStudentDonationCode } from "../../../utils/donation.js";
import {
  getEffectiveMembershipStatus,
  getMembershipStatusMessage,
} from "../../../utils/membershipStatus.js";

const formatRupiah = (amount) => Number(amount || 0).toLocaleString("id-ID");

async function findMemberByUuid(memberUuid) {
  if (!memberUuid) return null;

  let member = await Member.findOne({ uuid: memberUuid });
  if (member) return member;

  const prefix = new RegExp("^" + memberUuid);
  member = await Member.findOne({ uuid: prefix });
  if (member) return member;

  const alternateUuid = memberUuid + "-1234";
  member = await Member.findOne({ uuid: alternateUuid });
  if (member) return member;

  const prefixWithSuffix = new RegExp("^" + memberUuid + ".*(-1234)?$");
  return Member.findOne({ uuid: prefixWithSuffix });
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

async function createSavingsFromIntent({ member, intent, channelId }) {
  if (!intent || !member || !intent.savingsAmount) {
    return null;
  }

  const existingSaving = await Savings.findOne({
    memberId: member._id,
    invoiceNumber: intent.invoiceNumber,
  });
  if (existingSaving) return existingSaving;

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
  const paymentType = paymentAmount < projectionAmount ? "Partial" : "Full";
  const status =
    projectionAmount > 0 && finalPaidAmount >= projectionAmount ? "Approved" : "Partial";
  const donationSuffix = donationAmount > 0
    ? " + Donasi Rp " + formatRupiah(donationAmount)
    : "";
  const description = "Pembayaran Simpanan Periode - " + installmentPeriod
    + (partialSequence > 1 ? " (#" + partialSequence + ")" : "")
    + donationSuffix;

  const saving = new Savings({
    memberId: member._id,
    productId: product._id,
    type: "Setoran",
    amount: paymentAmount,
    installmentPeriod,
    savingsDate: new Date(),
    paymentDate: new Date(),
    status,
    paymentType,
    partialSequence,
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS")
      ? "QRIS"
      : "DOKU_CHECKOUT",
    description,
    notes: "Auto-approved via DOKU webhook"
      + (channelId ? " - Channel: " + channelId : "")
      + " - Invoice: " + intent.invoiceNumber,
    approvedBy: null,
    approvedAt: new Date(),
    invoiceNumber: intent.invoiceNumber,
  });

  await saving.save();
  return saving;
}

async function createDonationFromIntent({ member, intent, channelId }) {
  if (!intent || !intent.donationAmount) {
    return null;
  }

  const existingDonation = await Donation.findOne({
    invoiceNumber: intent.invoiceNumber,
  });
  if (existingDonation) return existingDonation;

  const campaign = intent.campaignId
    ? await DonationCampaign.findById(intent.campaignId)
    : await DonationCampaign.findOne({ isActive: true }).sort({ collectUntil: -1 });

  const studentUuid = String(intent.studentUuid || member?.uuid || "").trim();
  const studentName = String(
    intent.studentName || member?.name || studentUuid || "Student",
  ).trim();

  const donation = new Donation({
    studentUuid,
    studentName,
    studentCode: buildStudentDonationCode(studentUuid),
    memberId: member?._id || null,
    campaignId: campaign?._id || null,
    campaignTitle: campaign?.title || "",
    beneficiaryName: campaign?.beneficiaryName || "",
    amount: Number(intent.donationAmount),
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS")
      ? "QRIS"
      : "DOKU_CHECKOUT",
    source: intent.source === "savings_payment" ? "savings_payment" : "donation_page",
    status: "Approved",
    description: intent.source === "savings_payment"
      ? "Donasi ikut pembayaran tabungan - Invoice: " + intent.invoiceNumber
      : "Donasi via QRIS - Invoice: " + intent.invoiceNumber,
    notes: "Auto-approved via DOKU webhook"
      + (channelId ? " - Channel: " + channelId : ""),
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
    throw new Error("Member not found for UUID: " + memberUuid);
  }

  const existingSaving = await Savings.findOne({ memberId: member._id, invoiceNumber });
  if (existingSaving) return { saving: existingSaving, member };

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
  const paymentType = parsedAmount < product.depositAmount ? "Partial" : "Full";
  const status = paymentType === "Partial" ? "Partial" : "Approved";
  const description = "Pembayaran Simpanan Periode - " + installmentPeriod
    + (partialSequence > 1 ? " (#" + partialSequence + ")" : "");

  const saving = await Savings.create({
    memberId: member._id,
    productId: product._id,
    type: "Setoran",
    amount: parsedAmount,
    installmentPeriod,
    savingsDate: new Date(),
    paymentDate: new Date(),
    status,
    paymentType,
    partialSequence,
    paymentMethod: channelId && String(channelId).toUpperCase().includes("QRIS")
      ? "QRIS"
      : "DOKU_CHECKOUT",
    description,
    notes: "Auto-approved via DOKU webhook"
      + (channelId ? " - Channel: " + channelId : "")
      + " - Invoice: " + invoiceNumber,
    approvedBy: null,
    approvedAt: new Date(),
    invoiceNumber,
  });

  return { saving, member };
}

export function createMongooseDokuPaymentGateway() {
  return {
    memberRepository: {
      findByUuid: findMemberByUuid,
    },
    paymentCreator: {
      createSavingsFromIntent,
      createDonationFromIntent,
      createLegacySaving,
    },
  };
}
