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
    // Field baru untuk formulir pendaftaran koperasi
    email: {
      type: String,
      trim: true,
      default: "",
    },
    birthPlace: {
      type: String,
      trim: true,
      default: "",
    },
    birthDate: {
      type: Date,
      default: null,
    },
    nik: {
      type: String,
      trim: true,
      default: "",
    },
    bankName: {
      type: String,
      trim: true,
      default: "",
    },
    accountHolderName: {
      type: String,
      trim: true,
      default: "",
    },
    signatureImage: {
      type: String,
      default: "",
    },
    ktpImage: {
      type: String,
      default: "",
    },
    selfieImage: {
      type: String,
      default: "",
    },
    livenessLeftImage: {
      type: String,
      default: "",
    },
    livenessRightImage: {
      type: String,
      default: "",
    },
    faceMatchScore: {
      type: Number,
      default: null,
    },
    riplText: {
      type: String,
      default: "",
    },
    riplVersion: {
      type: String,
      trim: true,
      default: "",
    },
    riplAgreedAt: {
      type: Date,
      default: null,
    },
    // Status verifikasi
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    addressUpdateStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },
    addressUpdateRequestedAt: {
      type: Date,
      default: null,
    },
    addressUpdateVerifiedAt: {
      type: Date,
      default: null,
    },
    addressUpdateVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    addressUpdateRejectionReason: {
      type: String,
      default: null,
    },
    registrationSource: {
      type: String,
      enum: ["admin", "student_dashboard"],
      default: "admin",
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
    // Status lunas - uang sudah di-TF ke student
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

// Indexes untuk filter yang sering dipakai di getAllMembers
memberSchema.index({ isVerified: 1 });
memberSchema.index({ isCompleted: 1 });
memberSchema.index({ productId: 1 });
memberSchema.index({ createdAt: -1 });
// hasUpgraded & addressUpdateStatus already indexed above

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
