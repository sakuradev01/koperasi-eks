import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    applicantType: {
      type: String,
      enum: ["member", "staff"],
      default: "staff",
    },
    applicantMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    applicantName: {
      type: String,
      required: [true, "Applicant wajib diisi"],
      trim: true,
    },
    applicantUuidSnapshot: {
      type: String,
      trim: true,
      default: "",
    },
    savingsWithdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SavingsWithdrawal",
      default: undefined,
    },
    expenseSource: {
      type: String,
      enum: ["manual", "savings_withdrawal"],
      default: "manual",
      index: true,
    },
    title: {
      type: String,
      required: [true, "Judul expense wajib diisi"],
      trim: true,
    },
    dateStart: {
      type: Date,
      required: [true, "Tanggal mulai wajib diisi"],
    },
    dateEnd: {
      type: Date,
      required: [true, "Tanggal akhir wajib diisi"],
    },
    seller: {
      type: String,
      trim: true,
      default: "",
    },
    amount: {
      type: Number,
      required: [true, "Total expense wajib diisi"],
      min: [0, "Total expense tidak boleh negatif"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoaAccount",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "uncategorized",
        "pending",
        "waiting_approval",
        "approved",
        "waiting_payment",
        "paid",
        "rejected",
      ],
      default: "uncategorized",
    },
    rejectReason: {
      type: String,
      trim: true,
      default: "",
    },
    rejectedBy: {
      type: String,
      trim: true,
      default: "",
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    paymentProof: {
      type: String,
      trim: true,
      default: null,
    },
    transferDate: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: String,
      trim: true,
      default: "",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

expenseSchema.index({ status: 1, createdAt: -1 });
expenseSchema.index({ applicantMemberId: 1, createdAt: -1 });
expenseSchema.index({ applicantName: 1 });
expenseSchema.index(
  { savingsWithdrawalId: 1 },
  { unique: true, partialFilterExpression: { savingsWithdrawalId: { $type: "objectId" } } },
);

const Expense = mongoose.model("Expense", expenseSchema);

export { Expense };
