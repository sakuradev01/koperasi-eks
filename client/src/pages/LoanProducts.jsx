import { useEffect, useState } from "react";
import api from "../api/index.jsx";
import toast, { Toaster } from "react-hot-toast";

const LoanProducts = () => {
  const [loanProducts, setLoanProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    loanTerm: "",
    maxLoanAmount: "",
    downPayment: "",
    interestRate: "",
    description: "",
    type: "barang",
    isActive: true,
  });

  useEffect(() => {
    fetchLoanProducts();
  }, []);

  const fetchLoanProducts = async () => {
    try {
      const response = await api.get("/api/admin/loan-products");
      if (response.data.success) {
        setLoanProducts(response.data.data);
      }
    } catch (err) {
      setError("Gagal memuat data produk pinjaman");
      console.error("Loan Products fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const productData = {
        ...formData,
        loanTerm: Number(formData.loanTerm),
        maxLoanAmount: Number(formData.maxLoanAmount),
        downPayment: Number(formData.downPayment),
        interestRate: Number(formData.interestRate),
      };

      if (editingProduct) {
        const productId = editingProduct._id;
        if (productId) {
          const response = await api.put(
            `/api/admin/loan-products/${productId}`,
            productData
          );
          console.log("Update response:", response.data);
          if (response.data.success) {
            toast.success("Produk pinjaman berhasil diperbarui");
            fetchLoanProducts();
            setShowModal(false);
            setEditingProduct(null);
            setFormData({
              title: "",
              loanTerm: "",
              maxLoanAmount: "",
              downPayment: "",
              interestRate: "",
              description: "",
              isActive: true,
            });
          } else {
            toast.error(response.data.message || "Gagal memperbarui produk pinjaman");
            setError(response.data.message || "Gagal menyimpan data");
          }
        } else {
          toast.error("ID produk tidak valid");
          setError("ID produk tidak valid");
          return;
        }
      } else {
        const response = await api.post("/api/admin/loan-products", productData);
        console.log("Create response:", response.data);
        if (response.data.success) {
          toast.success("Produk pinjaman berhasil ditambahkan");
          fetchLoanProducts();
          setShowModal(false);
          setFormData({
            title: "",
            loanTerm: "",
            maxLoanAmount: "",
            downPayment: "",
            interestRate: "",
            description: "",
            isActive: true,
          });
        } else {
          toast.error(response.data.message || "Gagal menambahkan produk pinjaman");
          setError(response.data.message || "Gagal menyimpan data");
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Gagal menyimpan data";
      toast.error(errorMsg);
      setError(errorMsg);
      console.error("Submit error:", err);
    }
  };

  const handleEdit = (product) => {
    console.log("Edit product:", product);
    if (!product || !product._id) {
      setError("Data produk tidak valid");
      return;
    }
    setEditingProduct(product);
    setFormData({
      title: product.title || "",
      loanTerm: product.loanTerm || "",
      maxLoanAmount: product.maxLoanAmount || "",
      downPayment: product.downPayment || "",
      interestRate: product.interestRate || "",
      description: product.description || "",
      type: product.type || "barang",
      isActive: product.isActive !== undefined ? product.isActive : true,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    console.log("Delete product ID:", id);
    if (!id) {
      setError("ID produk tidak valid");
      return;
    }

    if (window.confirm("Apakah Anda yakin ingin menghapus produk ini?")) {
      try {
        const response = await api.delete(`/api/admin/loan-products/${id}`);
        console.log("Delete response:", response.data);
        if (response.data.success) {
          toast.success("Produk pinjaman berhasil dihapus");
          fetchLoanProducts();
        } else {
          toast.error(response.data.message || "Gagal menghapus produk");
          setError(response.data.message || "Gagal menghapus data");
        }
      } catch (err) {
        console.error("Delete error:", err);
        const errorMsg = err.response?.data?.message || "Gagal menghapus produk pinjaman";
        toast.error(errorMsg);
        setError(errorMsg);
      }
    }
  };

  const handleToggleStatus = async (id) => {
    console.log("Toggle status product ID:", id);
    if (!id) {
      setError("ID produk tidak valid");
      return;
    }

    try {
      const response = await api.put(`/api/admin/loan-products/${id}/toggle`);
      console.log("Toggle status response:", response.data);
      if (response.data.success) {
        const product = loanProducts.find(p => p._id === id);
        const newStatus = product?.isActive ? "dinonaktifkan" : "diaktifkan";
        toast.success(`Produk pinjaman berhasil ${newStatus}`);
        fetchLoanProducts();
      } else {
        toast.error(response.data.message || "Gagal mengubah status produk");
        setError(response.data.message || "Gagal mengubah status produk");
      }
    } catch (err) {
      console.error("Toggle status error:", err);
      const errorMsg = err.response?.data?.message || "Gagal mengubah status produk";
      toast.error(errorMsg);
      setError(errorMsg);
    }
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    setFormData({
      title: "",
      loanTerm: "",
      maxLoanAmount: "",
      downPayment: "",
      interestRate: "",
      description: "",
      type: "barang",
      isActive: true,
    });
    setShowModal(true);
  };

  const formatRupiah = (value) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <Toaster position="top-right" />
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          🌸 Manajemen Produk Pinjaman
        </h1>
        <button
          onClick={handleAddNew}
          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
        >
          ➕ Tambah Produk Pinjaman
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nama Pinjaman
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipe
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lama Angsuran (bulan)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plafon
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                DP
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bunga (%)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loanProducts.map((product) => (
              <tr key={product._id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {product._id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {product.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    product.type === 'dana_darurat' ? 'bg-red-100 text-red-800' :
                    product.type === 'multi_usaha' ? 'bg-blue-100 text-blue-800' :
                    product.type === 'umroh_haji' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {product.type ? product.type.replace(/_/g, ' ') : 'barang'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {product.loanTerm}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatRupiah(product.maxLoanAmount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatRupiah(product.downPayment)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {product.interestRate}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      product.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {product.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(product)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(product._id)}
                    className={`mr-3 ${
                      product.isActive
                        ? "text-yellow-600 hover:text-yellow-900"
                        : "text-green-600 hover:text-green-900"
                    }`}
                  >
                    {product.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button
                    onClick={() => handleDelete(product._id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {editingProduct
                  ? "Edit Produk Pinjaman"
                  : "Tambah Produk Pinjaman"}
              </h3>
              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Pinjaman *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lama Angsuran (bulan) *
                  </label>
                  <input
                    type="number"
                    value={formData.loanTerm}
                    onChange={(e) =>
                      setFormData({ ...formData, loanTerm: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Plafon (Rp) *
                  </label>
                  <input
                    type="number"
                    value={formData.maxLoanAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxLoanAmount: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    DP (Rp) *
                  </label>
                  <input
                    type="number"
                    value={formData.downPayment}
                    onChange={(e) =>
                      setFormData({ ...formData, downPayment: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bunga (%) *
                  </label>
                  <input
                    type="number"
                    value={formData.interestRate}
                    onChange={(e) =>
                      setFormData({ ...formData, interestRate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipe Pinjaman *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="barang">Barang</option>
                    <option value="dana_darurat">Dana Darurat</option>
                    <option value="multi_usaha">Multi Usaha</option>
                    <option value="umroh_haji">Umroh / Haji</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deskripsi
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {editingProduct ? "Update" : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanProducts;
