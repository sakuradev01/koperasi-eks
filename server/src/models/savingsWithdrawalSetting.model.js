import mongoose from "mongoose";

const savingsWithdrawalSettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true, default: "student_savings_withdrawal" },
    studentRequestEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const SavingsWithdrawalSetting = mongoose.model(
  "SavingsWithdrawalSetting",
  savingsWithdrawalSettingSchema,
);

export { SavingsWithdrawalSetting };
