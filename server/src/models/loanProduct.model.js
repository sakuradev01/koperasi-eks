import mongoose from "mongoose";

const loanProductSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Nama pinjaman wajib diisi"],
      trim: true,
      maxlength: [100, "Nama pinjaman maksimal 100 karakter"],
    },
    loanTerm: {
      type: Number,
      required: [true, "Lama angsuran wajib diisi"],
      min: [1, "Lama angsuran minimal 1 bulan"],
    },
    maxLoanAmount: {
      type: Number,
      required: [true, "Plafon pinjaman wajib diisi"],
      min: [0, "Plafon pinjaman tidak boleh negatif"],
    },
    downPayment: {
      type: Number,
      required: [true, "DP wajib diisi"],
      min: [0, "DP tidak boleh negatif"],
      validate: {
        validator: function (value) {
          return value <= this.maxLoanAmount;
        },
        message: "DP tidak boleh lebih besar dari plafon pinjaman",
      },
    },
    interestRate: {
      type: Number,
      required: [true, "Bunga wajib diisi"],
      min: [0, "Bunga tidak boleh negatif"],
      max: [100, "Bunga maksimal 100%"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Deskripsi maksimal 500 karakter"],
    },
    type: {
      type: String,
      enum: ['barang', 'dana_darurat', 'multi_usaha', 'umroh_haji'],
      default: 'barang',
      required: [true, "Tipe pinjaman wajib diisi"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index untuk query yang sering digunakan
loanProductSchema.index({ isActive: 1, createdAt: -1 });

const LoanProduct = mongoose.model("LoanProduct", loanProductSchema);

export { LoanProduct };
