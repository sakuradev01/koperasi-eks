import mongoose, { Schema } from "mongoose";

const memberSchema = new Schema(
  {
    uuid: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["L", "P"],
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    completeAddress: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
    },
    hasUpgraded: {
      type: Boolean,
      default: false,
      index: true,
    },
    currentUpgradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductUpgrade",
      default: null,
    },
    upgradeHistory: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductUpgrade",
    }],
    // Tanggal mulai tabungan - admin bisa set kapan periode 1 dimulai
    savingsStartDate: {
      type: Date,
      default: null, // null = pakai bulan saat member dibuat
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual untuk mengakses data produk
memberSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

// Virtual untuk mengakses data upgrade saat ini
memberSchema.virtual("currentUpgrade", {
  ref: "ProductUpgrade",
  localField: "currentUpgradeId",
  foreignField: "_id",
  justOne: true,
});

// Generate UUID sebelum disimpan
memberSchema.pre("save", async function (next) {
  if (this.isNew && !this.uuid) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    this.uuid = `MEMBER_${timestamp}_${random}`.toUpperCase();
  }
  next();
});

export const Member = mongoose.model("Member", memberSchema);
