import mongoose from "mongoose";

const checkoutIntentSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number wajib diisi"],
      unique: true,
      trim: true,
    },
    studentUuid: {
      type: String,
      required: [true, "UUID student wajib diisi"],
      trim: true,
      index: true,
    },
    studentName: {
      type: String,
      trim: true,
      default: "",
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DonationCampaign",
      default: null,
    },
    installmentPeriod: {
      type: Number,
      default: null,
    },
    projectionAmount: {
      type: Number,
      default: 0,
      min: [0, "Target proyeksi tidak boleh negatif"],
    },
    alreadyPaidAmount: {
      type: Number,
      default: 0,
      min: [0, "Nominal terbayar sebelumnya tidak boleh negatif"],
    },
    savingsAmount: {
      type: Number,
      default: 0,
      min: [0, "Nominal tabungan tidak boleh negatif"],
    },
    donationAmount: {
      type: Number,
      default: 0,
      min: [0, "Nominal donasi tidak boleh negatif"],
    },
    chargedAmount: {
      type: Number,
      required: [true, "Total charge wajib diisi"],
      min: [1, "Total charge minimal 1"],
    },
    adminFee: {
      type: Number,
      default: 0,
      min: [0, "Biaya admin tidak boleh negatif"],
    },
    paymentContext: {
      type: String,
      enum: ["savings", "donation", "mixed"],
      default: "savings",
    },
    source: {
      type: String,
      enum: ["savings_payment", "donation_page"],
      default: "savings_payment",
    },
    paymentMethod: {
      type: String,
      enum: ["DOKU_CHECKOUT", "QRIS"],
      default: "DOKU_CHECKOUT",
    },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Paid", "Expired", "Failed"],
      default: "Pending",
      index: true,
    },
    processingAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

checkoutIntentSchema.index({ status: 1, createdAt: -1 });

export const CheckoutIntent = mongoose.model("CheckoutIntent", checkoutIntentSchema);
