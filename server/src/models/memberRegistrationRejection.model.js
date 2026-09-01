import mongoose from "mongoose";

const documentSummarySchema = new mongoose.Schema(
  {
    ktp: { type: Boolean, default: false },
    selfie: { type: Boolean, default: false },
    livenessLeft: { type: Boolean, default: false },
    livenessRight: { type: Boolean, default: false },
    signature: { type: Boolean, default: false },
    bank: { type: Boolean, default: false },
    accountNumber: { type: Boolean, default: false },
    product: { type: Boolean, default: false },
    ripl: { type: Boolean, default: false },
  },
  { _id: false },
);

const memberRegistrationRejectionSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    memberUuid: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    memberName: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rejectedByName: {
      type: String,
      required: true,
      trim: true,
    },
    rejectedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    attempt: {
      type: Number,
      required: true,
      min: 1,
    },
    documentSummary: {
      type: documentSummarySchema,
      required: true,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

memberRegistrationRejectionSchema.index({ memberUuid: 1, rejectedAt: -1 });
memberRegistrationRejectionSchema.index({ rejectedAt: -1 });

export const MemberRegistrationRejection = mongoose.model(
  "MemberRegistrationRejection",
  memberRegistrationRejectionSchema,
);
