import Joi from "joi";

// Create loan application validation
export const createLoanApplicationValidation = {
  body: Joi.object({
    memberId: Joi.string()
      .required()
      .messages({
        "any.required": "ID anggota wajib diisi",
        "string.empty": "ID anggota tidak boleh kosong",
      }),
    loanProductId: Joi.string()
      .required()
      .messages({
        "any.required": "ID produk pinjaman wajib diisi",
        "string.empty": "ID produk pinjaman tidak boleh kosong",
      }),
    downPayment: Joi.number()
      .min(0)
      .required()
      .messages({
        "any.required": "Uang muka wajib diisi",
        "number.min": "Uang muka tidak boleh negatif",
      }),
    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        "string.max": "Deskripsi maksimal 500 karakter",
      }),
    documents: Joi.array()
      .items(Joi.object({
        type: Joi.string().valid('kontrak_kerja','visa','zairyuu_card','slip_gaji','mutasi_rekening','signature').required(),
        fileName: Joi.string().required(),
        originalName: Joi.string().optional().allow(''),
      }))
      .optional(),
    emergencyContacts: Joi.array()
      .items(Joi.object({
        fullName: Joi.string().allow(''),
        phone: Joi.string().allow(''),
        addressJapan: Joi.string().allow(''),
        relationship: Joi.string().allow(''),
      }))
      .optional(),
    faceScanUrl: Joi.string().allow('').optional(),
    ktpUrl: Joi.string().allow('').optional(),
  }),
};

// Calculate installment validation
export const calculateInstallmentValidation = {
  body: Joi.object({
    loanProductId: Joi.string()
      .required()
      .messages({
        "any.required": "ID produk pinjaman wajib diisi",
        "string.empty": "ID produk pinjaman tidak boleh kosong",
      }),
    downPayment: Joi.number()
      .min(0)
      .required()
      .messages({
        "any.required": "Uang muka wajib diisi",
        "number.min": "Uang muka tidak boleh negatif",
      }),
  }),
};

// Approve/Reject loan validation
export const processLoanValidation = {
  params: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        "any.required": "ID pinjaman wajib diisi",
      }),
  }),
  body: Joi.object({
    rejectionReason: Joi.string()
      .when("$method", {
        is: "reject",
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .messages({
        "any.required": "Alasan penolakan wajib diisi",
      }),
  }),
};

// Create loan payment validation
export const createPaymentValidation = {
  body: Joi.object({
    loanId: Joi.string()
      .required()
      .messages({
        "any.required": "ID pinjaman wajib diisi",
        "string.empty": "ID pinjaman tidak boleh kosong",
      }),
    memberId: Joi.string()
      .required()
      .messages({
        "any.required": "ID anggota wajib diisi",
        "string.empty": "ID anggota tidak boleh kosong",
      }),
    amount: Joi.number()
      .min(0)
      .required()
      .messages({
        "any.required": "Jumlah pembayaran wajib diisi",
        "number.min": "Jumlah pembayaran tidak boleh negatif",
      }),
    paymentDate: Joi.date()
      .required()
      .messages({
        "any.required": "Tanggal pembayaran wajib diisi",
        "date.base": "Format tanggal tidak valid",
      }),
    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        "string.max": "Deskripsi maksimal 500 karakter",
      }),
    notes: Joi.string()
      .max(500)
      .optional()
      .messages({
        "string.max": "Catatan maksimal 500 karakter",
      }),
  }),
};

// Approve/Reject payment validation
export const processPaymentValidation = {
  params: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        "any.required": "ID pembayaran wajib diisi",
      }),
  }),
  body: Joi.object({
    rejectionReason: Joi.string()
      .when("$method", {
        is: "reject",
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .messages({
        "any.required": "Alasan penolakan wajib diisi",
      }),
  }),
};

// Bulk approve validation
export const bulkApproveValidation = {
  body: Joi.object({
    paymentIds: Joi.array()
      .items(Joi.string())
      .min(1)
      .required()
      .messages({
        "any.required": "ID pembayaran wajib diisi",
        "array.min": "Minimal pilih satu pembayaran",
      }),
  }),
};

// Get loans query validation
export const getLoansQueryValidation = {
  query: Joi.object({
    status: Joi.string()
      .valid("Pending", "Approved", "Active", "Completed", "Rejected", "Overdue")
      .optional(),
    memberId: Joi.string().optional(),
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).max(1000).optional(),
    search: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
  }),
};

// Get payments query validation
export const getPaymentsQueryValidation = {
  query: Joi.object({
    status: Joi.string()
      .valid("Pending", "Approved", "Rejected", "Partial")
      .optional(),
    loanId: Joi.string().optional(),
    memberId: Joi.string().optional(),
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).max(1000).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
  }),
};

// Update loan status validation
export const updateLoanStatusValidation = {
  params: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        "any.required": "ID pinjaman wajib diisi",
      }),
  }),
  body: Joi.object({
    status: Joi.string()
      .valid("Active", "Completed", "Overdue")
      .required()
      .messages({
        "any.required": "Status wajib diisi",
        "any.only": "Status tidak valid",
      }),
  }),
};
