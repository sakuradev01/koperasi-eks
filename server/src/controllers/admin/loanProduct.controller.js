import { LoanProduct } from "../../models/loanProduct.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get all loan products
const getAllLoanProducts = asyncHandler(async (req, res) => {
  const loanProducts = await LoanProduct.find().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: loanProducts,
  });
});

// Get loan product by ID
const getLoanProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const loanProduct = await LoanProduct.findById(id);

  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  res.status(200).json({
    success: true,
    data: loanProduct,
  });
});

// Create new loan product
const createLoanProduct = asyncHandler(async (req, res) => {
  const {
    title,
    loanTerm,
    maxLoanAmount,
    downPayment,
    interestRate,
    description,
    type,
  } = req.body;

  // Check if loan product with same title already exists
  const existingLoanProduct = await LoanProduct.findOne({ title });
  if (existingLoanProduct) {
    return res.status(400).json({
      success: false,
      message: "Nama pinjaman sudah digunakan",
    });
  }

  // Create loan product
  const loanProduct = new LoanProduct({
    title,
    loanTerm,
    maxLoanAmount,
    downPayment,
    interestRate,
    description,
    type: type || 'barang',
  });

  await loanProduct.save();

  res.status(201).json({
    success: true,
    data: loanProduct,
    message: "Produk pinjaman berhasil dibuat",
  });
});

// Update loan product
const updateLoanProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    loanTerm,
    maxLoanAmount,
    downPayment,
    interestRate,
    description,
  } = req.body;

  const loanProduct = await LoanProduct.findById(id);

  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  // Check if another loan product with same title exists
  if (title !== loanProduct.title) {
    const existingLoanProduct = await LoanProduct.findOne({
      title,
      _id: { $ne: loanProduct._id },
    });
    if (existingLoanProduct) {
      return res.status(400).json({
        success: false,
        message: "Nama pinjaman sudah digunakan",
      });
    }
  }

  // Update loan product data
  loanProduct.title = title || loanProduct.title;
  loanProduct.loanTerm = loanTerm || loanProduct.loanTerm;
  loanProduct.maxLoanAmount = maxLoanAmount || loanProduct.maxLoanAmount;
  loanProduct.downPayment = downPayment || loanProduct.downPayment;
  loanProduct.interestRate = interestRate || loanProduct.interestRate;
  loanProduct.description = description || loanProduct.description;
  if (type && ['barang','dana_darurat','multi_usaha','umroh_haji'].includes(type)) {
    loanProduct.type = type;
  }

  await loanProduct.save();

  res.status(200).json({
    success: true,
    data: loanProduct,
    message: "Produk pinjaman berhasil diperbarui",
  });
});

// Delete loan product
const deleteLoanProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const loanProduct = await LoanProduct.findById(id);

  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  await LoanProduct.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Produk pinjaman berhasil dihapus",
  });
});

// Toggle loan product active status
const toggleLoanProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const loanProduct = await LoanProduct.findById(id);

  if (!loanProduct) {
    return res.status(404).json({
      success: false,
      message: "Produk pinjaman tidak ditemukan",
    });
  }

  loanProduct.isActive = !loanProduct.isActive;
  await loanProduct.save();

  res.status(200).json({
    success: true,
    data: loanProduct,
    message: `Produk pinjaman berhasil di${
      loanProduct.isActive ? "aktifkan" : "nonaktifkan"
    }`,
  });
});

export {
  getAllLoanProducts,
  getLoanProductById,
  createLoanProduct,
  updateLoanProduct,
  deleteLoanProduct,
  toggleLoanProductStatus,
};
