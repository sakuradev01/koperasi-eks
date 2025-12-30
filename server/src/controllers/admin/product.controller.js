import { Product } from "../../models/product.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Get all products
const getAllProducts = asyncHandler(async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: products,
  });
});

// Get product by ID
const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  res.status(200).json({
    success: true,
    data: product,
  });
});

// Create new product
const createProduct = asyncHandler(async (req, res) => {
  const { title, depositAmount, returnProfit, termDuration, description } =
    req.body;

  // Validate required fields
  if (!title || title.trim() === '') {
    return res.status(400).json({
      success: false,
      message: "Nama produk wajib diisi",
    });
  }

  if (!depositAmount || depositAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Jumlah setoran harus lebih dari 0",
    });
  }

  // Check if product with same title already exists
  const existingProduct = await Product.findOne({ title });
  if (existingProduct) {
    return res.status(400).json({
      success: false,
      message: "Nama produk sudah digunakan",
    });
  }

  // Create product
  const product = new Product({
    title,
    depositAmount,
    returnProfit,
    termDuration,
    description,
  });

  await product.save();

  res.status(201).json({
    success: true,
    data: product,
    message: "Produk berhasil dibuat",
  });
});

// Update product
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, depositAmount, returnProfit, termDuration, description } =
    req.body;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  // Check if another product with same title exists
  if (title !== product.title) {
    const existingProduct = await Product.findOne({
      title,
      _id: { $ne: product._id },
    });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Nama produk sudah digunakan",
      });
    }
  }

  // Update product data
  product.title = title || product.title;
  product.depositAmount = depositAmount || product.depositAmount;
  product.returnProfit = returnProfit || product.returnProfit;
  product.termDuration = termDuration || product.termDuration;
  product.description = description || product.description;

  await product.save();

  res.status(200).json({
    success: true,
    data: product,
    message: "Produk berhasil diperbarui",
  });
});

// Delete product
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  await Product.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Produk berhasil dihapus",
  });
});

// Toggle product active status
const toggleProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Produk tidak ditemukan",
    });
  }

  product.isActive = !product.isActive;
  await product.save();

  res.status(200).json({
    success: true,
    data: product,
    message: `Produk berhasil di${
      product.isActive ? "aktifkan" : "nonaktifkan"
    }`,
  });
});

export {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
};
