import mongoose from "mongoose";

const accountingTransactionSchema = new mongoose.Schema(
  {
    transactionDate: {
      type: Date,
      required: [true, "Tanggal transaksi wajib diisi"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoaAccount",
      required: [true, "Account ID wajib diisi"],
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
      default: null,
    },
    savingsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Savings",
      default: null,
    },
    transactionType: {
      type: String,
      enum: ["Deposit", "Withdrawal"],
      required: [true, "Tipe transaksi wajib diisi"],
    },
    amount: {
      type: Number,
      required: [true, "Jumlah wajib diisi"],
      min: [0, "Jumlah tidak boleh negatif"],
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
    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    invoicePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    invoiceProjectionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    invoiceProjectionIndex: {
      type: Number,
      default: null,
      min: 1,
    },
    invoiceProjectionDescription: {
      type: String,
      trim: true,
      default: "",
    },
    invoiceProjectionDueDate: {
      type: Date,
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    includeSalesTax: {
      type: Boolean,
      default: false,
    },
    salesTaxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesTax",
      default: null,
    },
    vendorId: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    receiptFile: {
      type: String,
      trim: true,
      default: null,
    },
    reviewed: {
      type: Boolean,
      default: false,
    },
    isSplit: {
      type: Boolean,
      default: false,
    },
    senderName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

accountingTransactionSchema.index({ accountId: 1, transactionDate: -1 });
accountingTransactionSchema.index({ transactionDate: -1 });
accountingTransactionSchema.index({ reviewed: 1 });
accountingTransactionSchema.index({ expenseId: 1 }, { sparse: true });
accountingTransactionSchema.index({ savingsId: 1 }, { sparse: true });
accountingTransactionSchema.index({ invoiceNumber: 1 }, { sparse: true });
accountingTransactionSchema.index({ invoiceProjectionId: 1 }, { sparse: true });

const AccountingTransaction = mongoose.model(
  "AccountingTransaction",
  accountingTransactionSchema
);

export { AccountingTransaction };
