import mongoose from "mongoose";

const loanSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      unique: true,
      trim: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: [true, "ID anggota wajib diisi"],
    },
    loanProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanProduct",
      // required removed — Dana Darurat loans don't use a LoanProduct
    },
    loanAmount: {
      type: Number,
      required: [true, "Jumlah pinjaman wajib diisi"],
      min: [0, "Jumlah pinjaman tidak boleh negatif"],
    },
    downPayment: {
      type: Number,
      required: [true, "Uang muka wajib diisi"],
      min: [0, "Uang muka tidak boleh negatif"],
    },
    tenor: {
      type: Number,
      required: [true, "Tenor wajib diisi"],
      min: [1, "Tenor minimal 1 bulan"],
    },
    monthlyInstallment: {
      type: Number,
      required: [true, "Cicilan bulanan wajib diisi"],
      min: [0, "Cicilan bulanan tidak boleh negatif"],
    },
    interestRate: {
      type: Number,
      required: [true, "Bunga wajib diisi"],
      min: [0, "Bunga tidak boleh negatif"],
      max: [100, "Bunga maksimal 100%"],
    },
    totalPayment: {
      type: Number,
      required: [true, "Total pembayaran wajib diisi"],
      min: [0, "Total pembayaran tidak boleh negatif"],
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Active", "Completed", "Rejected", "Overdue"],
      default: "Pending",
    },
    applicationDate: {
      type: Date,
      required: [true, "Tanggal pengajuan wajib diisi"],
      default: Date.now,
    },
    approvalDate: {
      type: Date,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Deskripsi maksimal 500 karakter"],
    },
    emergencyContacts: [{
      fullName: { type: String, default: "" },
      phone: { type: String, default: "" },
      addressJapan: { type: String, default: "" },
      relationship: { type: String, default: "" }
    }],
    faceScanUrl: { type: String, default: "" },
    ktpUrl: { type: String, default: "" },
    rejectionReason: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    paidPeriods: {
      type: Number,
      default: 0,
    },
    totalPeriods: {
      type: Number,
      required: [true, "Total periode wajib diisi"],
    },
    lastPaymentDate: {
      type: Date,
    },
    nextDueDate: {
      type: Date,
    },
    outstandingAmount: {
      type: Number,
      default: 0,
    },
    documents: [{
      type: {
        type: String,
        enum: ['kontrak_kerja', 'visa', 'zairyuu_card', 'slip_gaji', 'mutasi_rekening', 'signature', 'face_scan', 'ktp'],
      },
      fileName: { type: String },
      originalName: { type: String },
      uploadDate: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual untuk mengakses data anggota
loanSchema.virtual("member", {
  ref: "Member",
  localField: "memberId",
  foreignField: "_id",
  justOne: true,
});

// Virtual untuk mengakses data produk pinjaman
loanSchema.virtual("loanProduct", {
  ref: "LoanProduct",
  localField: "loanProductId",
  foreignField: "_id",
  justOne: true,
});

// Index untuk query yang sering digunakan
loanSchema.index({ memberId: 1, status: 1 });
loanSchema.index({ status: 1, nextDueDate: 1 });
loanSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook untuk generate UUID
loanSchema.pre("save", async function (next) {
  // Generate UUID jika baru dan belum ada
  if (this.isNew && !this.uuid) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    this.uuid = `LOAN_${timestamp}_${random}`.toUpperCase();
  }

  // Calculate total periods if not set
  if (this.isNew && !this.totalPeriods) {
    this.totalPeriods = this.tenor;
  }

  // Calculate outstanding amount if new
  if (this.isNew) {
    this.outstandingAmount = this.totalPayment;
  }

  // Set end date based on start date and tenor
  if (this.startDate && this.tenor && !this.endDate) {
    const endDate = new Date(this.startDate);
    endDate.setMonth(endDate.getMonth() + this.tenor);
    this.endDate = endDate;
  }

  // Set next due date if approved
  if (this.status === "Approved" && !this.nextDueDate && this.startDate) {
    const nextDue = new Date(this.startDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    this.nextDueDate = nextDue;
  }

  next();
});

// Method to check if loan is overdue
loanSchema.methods.isOverdue = function () {
  if (this.status !== "Active") return false;
  if (!this.nextDueDate) return false;
  return new Date() > new Date(this.nextDueDate);
};

// Method to update payment progress
loanSchema.methods.updatePaymentProgress = async function (paidAmount) {
  this.outstandingAmount = Math.max(0, this.outstandingAmount - paidAmount);
  this.paidPeriods += 1;
  this.lastPaymentDate = new Date();

  // Update next due date
  if (this.paidPeriods < this.totalPeriods) {
    const nextDue = new Date(this.nextDueDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    this.nextDueDate = nextDue;
  } else {
    // Loan completed
    this.status = "Completed";
    this.nextDueDate = null;
  }

  // Check if overdue
  if (this.isOverdue()) {
    this.status = "Overdue";
  }

  return this.save();
};

const Loan = mongoose.model("Loan", loanSchema);

export { Loan };
