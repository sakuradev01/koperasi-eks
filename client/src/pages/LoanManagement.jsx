import { useState, useEffect } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const LoanManagement = () => {
  const [loans, setLoans] = useState([]);
  const [filteredLoans, setFilteredLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [approveLoanData, setApproveLoanData] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editData, setEditData] = useState({
    monthlyInstallment: 0,
    tenor: 0,
    interestRate: 0,
    description: ""
  });
  
  // Create loan data
  const [members, setMembers] = useState([]);
  const [loanProducts, setLoanProducts] = useState([]);
  const [createData, setCreateData] = useState({
    memberId: "",
    loanProductId: "",
    downPayment: 0,
    description: ""
  });
  const [calculationResult, setCalculationResult] = useState(null);

  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    active: 0,
    completed: 0,
    rejected: 0,
    overdue: 0,
    total: 0
  });

  useEffect(() => {
    fetchLoans();
    fetchMembers();
    fetchLoanProducts();
  }, []);

  useEffect(() => {
    filterLoans();
    calculateStats();
  }, [loans, statusFilter, searchTerm]);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/admin/loans?page=1&limit=1000`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        const loanData = response.data.data.loans || [];
        setLoans(loanData);
      }
    } catch (error) {
      console.error("Error fetching loans:", error);
      toast.error("Gagal memuat data pinjaman");
    } finally {
      setLoading(false);
    }
  };

  const filterLoans = () => {
    let filtered = [...loans];

    // Filter by status
    if (statusFilter !== "All") {
      filtered = filtered.filter(loan => loan.status === statusFilter);
    }

    // Filter by search term (member name or UUID)
    if (searchTerm) {
      filtered = filtered.filter(loan => {
        const memberName = loan.memberId?.name?.toLowerCase() || "";
        const memberUuid = loan.memberId?.uuid?.toLowerCase() || "";
        const loanUuid = loan.uuid?.toLowerCase() || "";
        const productName = loan.loanProductId?.title?.toLowerCase() || "";
        const search = searchTerm.toLowerCase();
        
        return memberName.includes(search) || 
               memberUuid.includes(search) || 
               loanUuid.includes(search) ||
               productName.includes(search);
      });
    }

    setFilteredLoans(filtered);
  };

  const calculateStats = () => {
    const newStats = {
      pending: loans.filter(l => l.status === "Pending").length,
      active: loans.filter(l => l.status === "Active").length,
      completed: loans.filter(l => l.status === "Completed").length,
      rejected: loans.filter(l => l.status === "Rejected").length,
      overdue: loans.filter(l => l.status === "Overdue").length,
      total: loans.length
    };
    setStats(newStats);
  };

  const fetchMembers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/admin/members`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setMembers(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
      toast.error("Gagal memuat data anggota");
    }
  };

  const fetchLoanProducts = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/admin/loan-products`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setLoanProducts(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching loan products:", error);
      toast.error("Gagal memuat data produk pinjaman");
    }
  };

  const handleApprove = async () => {
    if (!approveLoanData) return;
    
    try {
      const token = localStorage.getItem("token");
      const loanId = approveLoanData._id;
      const response = await axios.post(
        `${API_URL}/api/admin/loans/${loanId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        toast.success("Pinjaman berhasil disetujui");
        setShowApproveModal(false);
        setApproveLoanData(null);
        fetchLoans();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Gagal menyetujui pinjaman");
    }
  };

  const openApproveModal = async (loan) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/api/admin/loans/${loan._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data?.data?.loan || res.data?.data || loan;
      setApproveLoanData(data);
      setShowApproveModal(true);
    } catch {
      setApproveLoanData(loan);
      setShowApproveModal(true);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Alasan penolakan harus diisi");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_URL}/api/admin/loans/${selectedLoan._id}/reject`,
        { rejectionReason: rejectReason },
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (response.data.success) {
        toast.success("Pinjaman berhasil ditolak");
        setShowRejectModal(false);
        setRejectReason("");
        setSelectedLoan(null);
        fetchLoans();
      }
    } catch (error) {
      console.error("Error rejecting loan:", error);
      toast.error(error.response?.data?.message || "Gagal menolak pinjaman");
    }
  };

  const handleDelete = async (loanId) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus pinjaman ini? Tindakan ini tidak dapat dibatalkan!")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(
        `${API_URL}/api/admin/loans/${loanId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        toast.success("Pinjaman berhasil dihapus");
        fetchLoans();
      }
    } catch (error) {
      console.error("Error deleting loan:", error);
      toast.error(error.response?.data?.message || "Gagal menghapus pinjaman");
    }
  };

  const handleEdit = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.put(
        `${API_URL}/api/admin/loans/${selectedLoan._id}`,
        editData,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (response.data.success) {
        toast.success("Pinjaman berhasil diperbarui");
        setShowEditModal(false);
        setSelectedLoan(null);
        fetchLoans();
      }
    } catch (error) {
      console.error("Error updating loan:", error);
      toast.error(error.response?.data?.message || "Gagal memperbarui pinjaman");
    }
  };

  const openEditModal = (loan) => {
    setSelectedLoan(loan);
    setEditData({
      monthlyInstallment: loan.monthlyInstallment,
      tenor: loan.tenor,
      interestRate: loan.interestRate,
      description: loan.description
    });
    setShowEditModal(true);
  };

  const handleCalculateLoan = async () => {
    if (!createData.loanProductId) {
      toast.error("Pilih produk pinjaman terlebih dahulu");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_URL}/api/admin/loans/calculate`,
        {
          loanProductId: createData.loanProductId,
          downPayment: createData.downPayment || 0
        },
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (response.data.success) {
        setCalculationResult(response.data.data);
      }
    } catch (error) {
      console.error("Error calculating loan:", error);
      toast.error(error.response?.data?.message || "Gagal menghitung pinjaman");
    }
  };

  const handleCreateLoan = async () => {
    // Validasi field wajib dengan pesan spesifik
    if (!createData.memberId) {
      toast.error("Anggota harus dipilih");
      return;
    }
    
    if (!createData.loanProductId) {
      toast.error("Produk pinjaman harus dipilih");
      return;
    }
    
    // Validasi down payment jika produk memiliki minimum DP
    const selectedProduct = loanProducts.find(p => p._id === createData.loanProductId);
    if (selectedProduct && createData.downPayment < selectedProduct.downPayment) {
      toast.error(`Uang muka minimal ${formatCurrency(selectedProduct.downPayment)}`);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_URL}/api/admin/loans/apply`,
        createData,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (response.data.success) {
        toast.success("Pengajuan pinjaman berhasil dibuat");
        setShowCreateModal(false);
        setCreateData({
          memberId: "",
          loanProductId: "",
          downPayment: 0,
          description: ""
        });
        setCalculationResult(null);
        fetchLoans();
      }
    } catch (error) {
      console.error("Error creating loan:", error);
      toast.error(error.response?.data?.message || "Gagal membuat pengajuan pinjaman");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const getStatusColor = (status) => {
    const colors = {
      Pending: "bg-yellow-100 text-yellow-800",
      Active: "bg-green-100 text-green-800",
      Completed: "bg-blue-100 text-blue-800",
      Rejected: "bg-red-100 text-red-800",
      Overdue: "bg-orange-100 text-orange-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">🏦 Manajemen Pinjaman</h1>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600">Total</p>
            <p className="text-xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-yellow-50 p-3 rounded-lg">
            <p className="text-xs text-yellow-600">Pending</p>
            <p className="text-xl font-bold text-yellow-800">{stats.pending}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-green-600">Active</p>
            <p className="text-xl font-bold text-green-800">{stats.active}</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-blue-600">Completed</p>
            <p className="text-xl font-bold text-blue-800">{stats.completed}</p>
          </div>
          <div className="bg-red-50 p-3 rounded-lg">
            <p className="text-xs text-red-600">Rejected</p>
            <p className="text-xl font-bold text-red-800">{stats.rejected}</p>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg">
            <p className="text-xs text-orange-600">Overdue</p>
            <p className="text-xl font-bold text-orange-800">{stats.overdue}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">Semua Status</option>
            <option value="Pending">Pending</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="Rejected">Rejected</option>
            <option value="Overdue">Overdue</option>
          </select>

          <input
            type="text"
            placeholder="Cari nama member, UUID, atau produk..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={fetchLoans}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            🔄 Refresh
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            ➕ Buat Pinjaman
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  No
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Member
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Produk
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Pinjaman
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cicilan/Bulan
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tenor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Dokumen
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tanggal Pengajuan
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    Tidak ada data pinjaman
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan, index) => (
                  <tr key={loan._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link 
                        to={`/master/anggota/${loan.memberId?.uuid}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {loan.memberId?.name || "Unknown"}
                      </Link>
                      <p className="text-xs text-gray-500">{loan.memberId?.uuid}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {loan.loanProductId?.title || "Unknown Product"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatCurrency(loan.totalPayment)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatCurrency(loan.monthlyInstallment)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {loan.tenor} bulan
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(loan.status)}`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {loan.documents && loan.documents.length > 0 ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700 cursor-help"
                              title={loan.documents.map(d => `${d.type}: ${d.fileName}`).join('\n')}>
                          📄 {loan.documents.length}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(loan.applicationDate), "dd MMM yyyy", { locale: id })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        {loan.status === "Pending" && (
                          <>
                            <button
                              onClick={() => openApproveModal(loan)}
                              className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                              title="Approve"
                            >
                              ✅ Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLoan(loan);
                                setShowRejectModal(true);
                              }}
                              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                              title="Reject"
                            >
                              ❌ Reject
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={() => openEditModal(loan)}
                          className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          title="Edit"
                        >
                          ✏️ Edit
                        </button>
                        
                        <button
                          onClick={() => handleDelete(loan._id)}
                          className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                          title="Delete"
                        >
                          🗑️ Delete
                        </button>
                        
                        <Link
                          to={`/master/anggota/${loan.memberId?.uuid}`}
                          className="px-3 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600"
                          title="View Detail"
                        >
                          👁️ Detail
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Tolak Pinjaman</h2>
            <p className="text-sm text-gray-600 mb-4">
              Pinjaman: {selectedLoan?.loanProductId?.title} - {selectedLoan?.memberId?.name}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Masukkan alasan penolakan..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              rows="4"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                  setSelectedLoan(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Tolak Pinjaman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Verification Modal */}
      {showApproveModal && approveLoanData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">🔍 Verifikasi Pinjaman</h2>
            
            {/* Loan Info */}
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500">Anggota</p>
                  <p className="font-semibold">{approveLoanData.memberId?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Produk</p>
                  <p className="font-semibold">{approveLoanData.loanProductId?.title || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Pinjaman</p>
                  <p className="font-semibold">{formatCurrency(approveLoanData.totalPayment)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Cicilan/Bulan</p>
                  <p className="font-semibold">{formatCurrency(approveLoanData.monthlyInstallment)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Tenor</p>
                  <p className="font-semibold">{approveLoanData.tenor} bulan</p>
                </div>
                <div>
                  <p className="text-gray-500">Bunga</p>
                  <p className="font-semibold">{approveLoanData.interestRate}%</p>
                </div>
              </div>
              {approveLoanData.description && (
                <div className="text-sm">
                  <p className="text-gray-500">Keterangan</p>
                  <p className="text-gray-700">{approveLoanData.description}</p>
                </div>
              )}
            </div>

            {/* Documents */}
            {approveLoanData.documents && approveLoanData.documents.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  📄 Dokumen Terlampir ({approveLoanData.documents.length})
                </p>
                <div className="space-y-2">
                  {approveLoanData.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                        {doc.type?.replace(/_/g, ' ')}
                      </span>
                      <a
                        href={`https://api.samitcoop.com/uploads/pinjaman/${doc.fileName}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate flex-1"
                      >
                        {doc.originalName || doc.fileName}
                      </a>
                      <a
                        href={`https://api.samitcoop.com/uploads/pinjaman/${doc.fileName}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200"
                      >
                        Lihat
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!approveLoanData.documents || approveLoanData.documents.length === 0) && (
              <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
                ⚠️ Tidak ada dokumen terlampir untuk pinjaman ini.
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => { setShowApproveModal(false); setApproveLoanData(null); }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Batal
              </button>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
              >
                ✅ Setujui Pinjaman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Edit Pinjaman</h2>
            <p className="text-sm text-gray-600 mb-4">
              {selectedLoan?.loanProductId?.title} - {selectedLoan?.memberId?.name}
            </p>
            
            {/* Documents section */}
            {selectedLoan?.documents && selectedLoan.documents.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  📄 Dokumen Terlampir ({selectedLoan.documents.length})
                </p>
                <div className="space-y-1">
                  {selectedLoan.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                        {doc.type?.replace(/_/g, ' ')}
                      </span>
                      <a
                        href={`https://api.samitcoop.com/uploads/pinjaman/${doc.fileName}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline truncate"
                      >
                        {doc.originalName || doc.fileName}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cicilan per Bulan
                </label>
                <input
                  type="number"
                  value={editData.monthlyInstallment}
                  onChange={(e) => setEditData({...editData, monthlyInstallment: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenor (bulan)
                </label>
                <input
                  type="number"
                  value={editData.tenor}
                  onChange={(e) => setEditData({...editData, tenor: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bunga (%)
                </label>
                <input
                  type="number"
                  value={editData.interestRate}
                  onChange={(e) => setEditData({...editData, interestRate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi
                </label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({...editData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedLoan(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Batal
              </button>
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Loan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-2">➕ Buat Pengajuan Pinjaman</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="text-red-500">*</span> Field wajib diisi
            </p>
            
            <div className="space-y-4">
              {/* Member Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pilih Anggota <span className="text-red-500">*</span>
                </label>
                <select
                  value={createData.memberId}
                  onChange={(e) => setCreateData({...createData, memberId: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !createData.memberId ? "border-red-300" : "border-gray-300"
                  }`}
                  required
                >
                  <option value="">-- Pilih Anggota --</option>
                  {members.map(member => (
                    <option key={member._id} value={member._id}>
                      {member.name} - {member.uuid}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Loan Product Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pilih Produk Pinjaman <span className="text-red-500">*</span>
                </label>
                <select
                  value={createData.loanProductId}
                  onChange={(e) => {
                    setCreateData({...createData, loanProductId: e.target.value});
                    setCalculationResult(null);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !createData.loanProductId ? "border-red-300" : "border-gray-300"
                  }`}
                  required
                >
                  <option value="">-- Pilih Produk --</option>
                  {loanProducts.filter(p => p.isActive).map(product => (
                    <option key={product._id} value={product._id}>
                      {product.title} - {formatCurrency(product.maxLoanAmount)} ({product.loanTerm} bulan)
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Down Payment */}
              {createData.loanProductId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Uang Muka
                  </label>
                  <input
                    type="number"
                    value={createData.downPayment}
                    onChange={(e) => {
                      setCreateData({...createData, downPayment: parseInt(e.target.value) || 0});
                      setCalculationResult(null);
                    }}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {loanProducts.find(p => p._id === createData.loanProductId) && (
                    <p className="text-xs text-gray-500 mt-1">
                      Min. DP: {formatCurrency(loanProducts.find(p => p._id === createData.loanProductId).downPayment)}
                    </p>
                  )}
                </div>
              )}
              
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deskripsi
                </label>
                <textarea
                  value={createData.description}
                  onChange={(e) => setCreateData({...createData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Keterangan pengajuan pinjaman..."
                />
              </div>
              
              {/* Calculate Button */}
              {createData.loanProductId && (
                <div className="flex justify-center">
                  <button
                    onClick={handleCalculateLoan}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                  >
                    🧮 Hitung Cicilan
                  </button>
                </div>
              )}
              
              {/* Calculation Result */}
              {calculationResult && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Hasil Perhitungan:</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Harga Produk:</span>
                      <span className="ml-2 font-medium">{formatCurrency(calculationResult.productPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Uang Muka:</span>
                      <span className="ml-2 font-medium">{formatCurrency(calculationResult.downPayment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Pokok Pinjaman:</span>
                      <span className="ml-2 font-medium">{formatCurrency(calculationResult.loanAmount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Bunga ({calculationResult.interestRate}%):</span>
                      <span className="ml-2 font-medium">{formatCurrency(calculationResult.interestAmount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Pembayaran:</span>
                      <span className="ml-2 font-medium text-blue-600">{formatCurrency(calculationResult.totalPayment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Tenor:</span>
                      <span className="ml-2 font-medium">{calculationResult.tenor} bulan</span>
                    </div>
                    <div className="col-span-2 border-t pt-2 mt-2">
                      <span className="text-gray-600 font-semibold">Cicilan per Bulan:</span>
                      <span className="ml-2 font-bold text-green-600 text-lg">
                        {formatCurrency(calculationResult.monthlyInstallment)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateData({
                    memberId: "",
                    loanProductId: "",
                    downPayment: 0,
                    description: ""
                  });
                  setCalculationResult(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Batal
              </button>
              <button
                onClick={handleCreateLoan}
                disabled={!createData.memberId || !createData.loanProductId}
                className={`px-4 py-2 text-white rounded-lg ${
                  createData.memberId && createData.loanProductId
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                Buat Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanManagement;
