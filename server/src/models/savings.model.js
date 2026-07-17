import mongoose from "mongoose";

const savingsSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      unique: true,
      trim: true,
    },
    installmentPeriod: {
      type: Number,
      required: [true, "Periode cicilan wajib diisi"],
      min: [1, "Periode minimal 1 bulan"],
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: [true, "ID anggota wajib diisi"],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "ID produk wajib diisi"],
    },
    amount: {
      type: Number,
      required: [true, "Jumlah simpanan wajib diisi"],
      min: [0, "Jumlah simpanan tidak boleh negatif"],
    },
    savingsDate: {
      type: Date,
      required: [true, "Tanggal simpanan wajib diisi"],
    },
    paymentDate: {
      type: Date,
    },
    proofFile: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Setoran", "Penarikan"],
      default: "Setoran",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Deskripsi maksimal 500 karakter"],
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Partial"],
      default: "Pending",
    },
    paymentType: {
      type: String,
      enum: ["Full", "Partial"],
      default: "Full",
    },
    notes: {
      type: String,
      default: "",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    partialSequence: {
      type: Number,
      default: 1,
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: "",
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: "",
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoaAccount",
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    categoryType: {
      type: String,
      enum: ["master", "submenu", "account", null],
      default: null,
    },
    isSplit: {
      type: Boolean,
      default: false,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingTransaction",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual untuk mengakses data anggota
savingsSchema.virtual("member", {
  ref: "Member",
  localField: "memberId",
  foreignField: "_id",
  justOne: true,
});

// Virtual untuk mengakses data produk
savingsSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

// Index untuk query yang sering digunakan
savingsSchema.index({ memberId: 1, createdAt: -1 });
savingsSchema.index({ productId: 1, createdAt: -1 });
savingsSchema.index({ status: 1, createdAt: -1 });
savingsSchema.index({ transactionId: 1 }, { sparse: true });
savingsSchema.index({ accountId: 1 });

// Pre-save hook untuk generate UUID
savingsSchema.pre("save", async function (next) {
  // Generate UUID jika baru dan belum ada
  if (this.isNew && !this.uuid) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    this.uuid = `SAVINGS_${timestamp}_${random}`.toUpperCase();
  }
  next();
});

const Savings = mongoose.model("Savings", savingsSchema);

export { Savings };
