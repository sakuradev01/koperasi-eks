import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoiceProduct",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true },
);

const invoiceDiscountSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true },
);

const invoiceProjectionSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    estimateDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true },
);

const invoicePaymentSchema = new mongoose.Schema(
  {
    paymentDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      default: "Bank",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
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
    projectionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectionIndex: {
      type: Number,
      default: null,
      min: 1,
    },
    projectionDescription: {
      type: String,
      default: "",
      trim: true,
    },
    projectionDueDate: {
      type: Date,
      default: null,
    },
    isSplit: {
      type: Boolean,
      default: false,
    },
    senderName: {
      type: String,
      default: "",
      trim: true,
    },
    attachment: {
      type: String,
      default: "",
      trim: true,
    },
    attachmentOriginalName: {
      type: String,
      default: "",
      trim: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountingTransaction",
      default: null,
    },
  },
  { _id: true },
);

const customerSnapshotSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    completeAddress: {
      type: String,
      default: "",
      trim: true,
    },
    productTitle: {
      type: String,
      default: "",
      trim: true,
    },
    referralCode: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    customerSnapshot: {
      type: customerSnapshotSchema,
      default: () => ({}),
    },
    salesCode: {
      type: String,
      default: "",
      trim: true,
    },
    issuedDate: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    currency: {
      type: String,
      enum: ["IDR", "JPY", "USD", "AUD", "EUR", "GBP"],
      default: "IDR",
    },
    exchangeRate: {
      type: Number,
      default: 1,
      min: 0,
    },
    status: {
      type: String,
      enum: ["draft", "sent", "partial", "paid", "overdue"],
      default: "draft",
      index: true,
    },
    items: {
      type: [invoiceItemSchema],
      default: [],
    },
    discounts: {
      type: [invoiceDiscountSchema],
      default: [],
    },
    projections: {
      type: [invoiceProjectionSchema],
      default: [],
    },
    payments: {
      type: [invoicePaymentSchema],
      default: [],
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    terms: {
      type: String,
      default: "",
      trim: true,
    },
    tosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tos",
      default: null,
    },
    termsTitle: {
      type: String,
      default: "",
      trim: true,
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    amountDue: {
      type: Number,
      default: 0,
    },
    lastPaymentDate: {
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

invoiceSchema.index({ memberId: 1, issuedDate: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

export const Invoice = mongoose.model("Invoice", invoiceSchema);
