import mongoose from "mongoose";

const danaDaruratSchema = new mongoose.Schema({
  // ==================== FORM A - Data Pribadi ====================
  personal: {
    fullName: { type: String, required: true },                   // Nama Lengkap
    phoneIndonesia: { type: String, required: true },              // No Telepon Indonesia
    phoneJapan: { type: String, default: "" },                     // No Telepon Jepang
    email: { type: String, required: true },                       // Alamat Email
    lineContact: { type: String, default: "" },                    // Kontak Line
    maritalStatus: {                                                // Status Pernikahan
      type: String,
      enum: ['belum_menikah', 'sudah_menikah', 'janda_duda'],
      required: true,
    },
    dependents: { type: Number, default: 0 },                      // Jumlah Tanggungan
    sinceJapan: { type: Date },                                     // Sejak kapan di Jepang
    stayDuration: { type: String, default: "" },                   // Berapa lama ingin tinggal
  },

  // ==================== FORM B - Data Pekerjaan ====================
  employment: {
    program: {                                                      // Program (SSW/Magang/Gijinkoku)
      type: String,
      enum: ['ssw', 'magang', 'gijinkoku'],
      required: true,
    },
    field: { type: String, default: "" },                          // Bidang Kerja saat ini
    contractStart: { type: Date },                                  // Masa berlaku kontrak dari
    contractEnd: { type: Date },                                    // Masa berlaku kontrak sampai
    planToMove: { type: String, default: "Tidak ada" },            // Rencana pindah kerja?
    movePlanDate: { type: String, default: "" },                   // Kapan rencana pindah
  },

  // ==================== FORM C - Data TSK & Perusahaan ====================
  company: {
    tskName: { type: String, default: "" },                        // Nama TSK
    tskContact: { type: String, default: "" },                     // Kontak TSK
    companyName: { type: String, default: "" },                    // Nama Perusahaan
    companyAddress: { type: String, default: "" },                 // Alamat Perusahaan
    companyContact: { type: String, default: "" },                 // Kontak Perusahaan
  },

  // ==================== FORM D - Kontak Darurat I ====================
  emergencyContact1: {
    fullName: { type: String, default: "" },                       // Nama Lengkap
    phone: { type: String, default: "" },                          // No Telepon
    addressJapan: { type: String, default: "" },                   // Alamat Jepang
  },

  // ==================== FORM E - Kontak Darurat II ====================
  emergencyContact2: {
    fullName: { type: String, default: "" },                       // Nama Lengkap
    phone: { type: String, default: "" },                          // No Telepon
    address: { type: String, default: "" },                        // Alamat Lengkap
    relationship: { type: String, default: "" },                   // Hubungan
  },

  // ==================== FORM F - Pinjaman ====================
  loanDetails: {
    type: {                                                         // Jenis pinjaman
      type: String,
      enum: ['modal_usaha', 'dana_darurat'],
      required: true,
    },
    reason: { type: String, default: "" },                         // Alasan Mengajukan
    amount: { type: Number, required: true },                      // Nominal Pengajuan (Rp)
    tenor: { type: Number, default: 12 },                          // Loan term in months
    interestRate: { type: Number, default: 10 },                   // Interest rate percentage
    monthlyInstallment: { type: Number, default: 0 },              // Auto-calculated on approval
    loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', default: null }, // Link to created Loan
  },

  // ==================== FORM G - Data Penghasilan ====================
  income: {
    myNumber: { type: String, default: "" },                       // Informasi My Number
    baseSalary: { type: Number, default: 0 },                      // Gaji Pokok
    allowances: { type: Number, default: 0 },                      // Tunjangan
    bonus: { type: Number, default: 0 },                           // Bonus/Komisi rata-rata
    otherAllowances: { type: Number, default: 0 },                 // Tunjangan Lainnya
    otherIncome: { type: Number, default: 0 },                     // Pendapatan Lainnya
  },

  // ==================== FORM H - Data Pengeluaran ====================
  expenses: {
    apartmentRent: { type: Number, default: 0 },                   // Sewa Apato
    utilities: { type: Number, default: 0 },                       // Gas, Listrik, Wifi
    pensionWelfare: { type: Number, default: 0 },                  // 厚生年金
    healthInsurance: { type: Number, default: 0 },                 // 健康保険
    employmentInsurance: { type: Number, default: 0 },             // 雇用保険
    accidentInsurance: { type: Number, default: 0 },              // 労災保険
    nationalPension: { type: Number, default: 0 },                // 国民年金
    nationalHealthInsurance: { type: Number, default: 0 },        // 国民健康保険
    livingCosts: { type: Number, default: 0 },                    // Biaya hidup (Makan)
    otherExpenses: { type: Number, default: 0 },                  // Pengeluaran Lainnya
    hasOtherDebt: { type: String, enum: ['ya', 'tidak'], default: 'tidak' },
  },

  // ==================== FORM I - Data Hutang ====================
  debt: {
    who: { type: String, default: "" },                            // Siapa yang punya hutang
    toWhom: { type: String, default: "" },                         // Kepada siapa
    remainingAmount: { type: Number, default: 0 },                // Sisa hutang
  },

  // ==================== FORM J - Dokumen ====================
  documents: [{
    type: { type: String },                                        // Document type identifier
    files: [{                                                      // Multiple files per type
      fileName: { type: String },
      originalName: { type: String },
      filePath: { type: String },
      size: { type: Number },
    }],
  }],

  // ==================== Status & Metadata ====================
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'reviewing', 'approved', 'rejected', 'cancelled'],
    default: 'draft',
  },
  submissionDate: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewNotes: { type: String, default: "" },
  applicationNumber: { type: String, unique: true },

}, { timestamps: true });

danaDaruratSchema.index({ memberId: 1, status: 1 });
danaDaruratSchema.index({ status: 1, createdAt: -1 });

danaDaruratSchema.pre("save", async function (next) {
  if (this.isNew && !this.applicationNumber) {
    const ts = Date.now().toString();
    const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
    this.applicationNumber = `DD-${ts}-${rand}`;
  }
  next();
});

const DanaDarurat = mongoose.model("DanaDarurat", danaDaruratSchema);
export { DanaDarurat };
