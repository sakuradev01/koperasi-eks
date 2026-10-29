import mongoose from "mongoose";

const transitionSchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, required: true },
    actorType: { type: String, enum: ["member", "admin", "finance", "system"], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorName: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const savingsWithdrawalSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, unique: true, required: true, trim: true },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    memberUuidSnapshot: { type: String, required: true, trim: true },
    memberNameSnapshot: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    productNameSnapshot: { type: String, trim: true, default: "" },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
      default: undefined,
    },
    openMemberId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    paidMemberId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    source: { type: String, enum: ["student", "admin_legacy"], required: true },
    status: {
      type: String,
      enum: ["submitted", "reviewing", "approved", "waiting_payment", "rejected", "paid", "cancelled"],
      required: true,
      default: "submitted",
      index: true,
    },
    grossAmount: { type: Number, required: true, min: 0 },
    paidPeriodCount: { type: Number, required: true, min: 0 },
    contractPeriodCount: { type: Number, default: 0, min: 0 },
    withdrawalType: { type: String, enum: ["early", "completed", "admin_legacy"], required: true },
    penaltyRate: { type: Number, default: 0, min: 0, max: 1 },
    penaltyAmount: { type: Number, default: 0, min: 0 },
    bankFeeAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    bankFeeConfirmedAt: { type: Date, default: null },
    bankNameSnapshot: { type: String, required: true, trim: true },
    accountNumberSnapshot: { type: String, required: true, trim: true },
    accountHolderSnapshot: { type: String, required: true, trim: true },
    withdrawalMonth: { type: Number, required: true, min: 1, max: 12 },
    withdrawalYear: { type: Number, required: true, min: 2000, max: 2200 },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    policyVersion: { type: String, default: "2026-10-v1", trim: true },
    policyAcceptedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transferDate: { type: Date, default: null },
    paymentProofFiles: { type: [String], default: [] },
    membershipStatusBeforeClosure: { type: String, enum: ["draft", "active", "inactive", null], default: null },
    membershipStatusWasSet: { type: Boolean, default: true },
    wasCompletedBeforeClosure: { type: Boolean, default: false },
    completedAtBeforeClosure: { type: Date, default: null },
    completedByBeforeClosure: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transitions: { type: [transitionSchema], default: [] },
  },
  { timestamps: true },
);

savingsWithdrawalSchema.index({ memberId: 1, createdAt: -1 });
savingsWithdrawalSchema.index({ status: 1, createdAt: -1 });
savingsWithdrawalSchema.index(
  { expenseId: 1 },
  { unique: true, partialFilterExpression: { expenseId: { $type: "objectId" } } },
);
savingsWithdrawalSchema.index(
  { openMemberId: 1 },
  { unique: true, partialFilterExpression: { openMemberId: { $type: "objectId" } } },
);
savingsWithdrawalSchema.index(
  { paidMemberId: 1 },
  { unique: true, partialFilterExpression: { paidMemberId: { $type: "objectId" } } },
);

const SavingsWithdrawal = mongoose.model("SavingsWithdrawal", savingsWithdrawalSchema);

export { SavingsWithdrawal };
