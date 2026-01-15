import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "react-toastify";
import { API_URL } from "../api/config";
import Pagination from "../components/Pagination.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const Savings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [savings, setSavings] = useState([]);
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    installmentPeriod: 1,
    memberId: "",
    productId: "",
    amount: "",
    savingsDate: format(new Date(), "yyyy-MM-dd"),
    paymentDate: "",
    type: "Setoran",
    description: "",
    status: "Pending",
    paymentType: "Full",
    notes: "",
    proofFile: null,
  });

  const [lastPeriod, setLastPeriod] = useState(0);
  const [periodInfo, setPeriodInfo] = useState({
    incompletePeriods: [],
    rejectedPeriods: [],
    pendingTransactions: [],
    transactionsByPeriod: {},
    nextPeriod: 1,
    suggestedAmount: 0,
    isPartialPayment: false,
    remainingAmount: 0,
    hasUpgrade: false,
    upgradeInfo: null
  });
  const [originalSelection, setOriginalSelection] = useState({
    memberId: "",
    productId: "",
  });

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectSavingsId, setRejectSavingsId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  // Proof modal state (view proof before action)
  const [showProofModal, setShowProofModal] = useState(false);
  const [selectedSaving, setSelectedSaving] = useState(null);

  // Existing proof file state (for edit mode)
  const [existingProofFile, setExistingProofFile] = useState(null);

  // Searchable member dropdown state
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const memberDropdownRef = useRef(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Filter & Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, Pending, Approved, Rejected
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterMember, setFilterMember] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest"); // newest, oldest

  // Handle URL params from notification
  useEffect(() => {
    const memberParam = searchParams.get("member");
    const statusParam = searchParams.get("status");
    
    if (memberParam) {
      setFilterMember(memberParam);
    }
    if (statusParam) {
      setFilterStatus(statusParam);
    }
    
    // Clear URL params after applying
    if (memberParam || statusParam) {
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  
  // Summary state for totals
  const [summary, setSummary] = useState({
    totalSetoran: 0,
    totalPenarikan: 0,
    saldo: 0
  });

  // Fetch data
  const fetchSavings = async () => {
    try {
      const token = localStorage.getItem("token");
      // Fetch with higher limit to get all records
      const response = await axios.get(`${API_URL}/api/admin/savings?limit=100&page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      let allSavings = [];
      const firstPageData = response.data?.data?.savings || response.data?.savings || response.data?.data || response.data || [];
      allSavings = Array.isArray(firstPageData) ? [...firstPageData] : [];
      
      // Check if there are more pages
      const totalItems = response.data?.data?.pagination?.totalItems;
      const totalPages = response.data?.data?.pagination?.totalPages;
      
      if (totalPages && totalPages > 1) {
        // Fetch remaining pages
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
          pagePromises.push(
            axios.get(`${API_URL}/api/admin/savings?limit=100&page=${page}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          );
        }
        
        const additionalResponses = await Promise.all(pagePromises);
        additionalResponses.forEach(resp => {
          const pageData = resp.data?.data?.savings || resp.data?.savings || resp.data?.data || resp.data || [];
          if (Array.isArray(pageData)) {
            allSavings.push(...pageData);
          }
        });
      }
      
      setSavings(allSavings);
      
      // Set summary from backend response
      if (response.data?.data?.summary) {
        setSummary(response.data.data.summary);
      }
    } catch (error) {
      console.error("Error fetching savings:", error);
      toast.error("Gagal memuat data simpanan");
      setSavings([]);
    }
  };

  const fetchMembers = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/api/admin/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data?.data || response.data || [];
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Gagal memuat data anggota");
      setMembers([]);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/api/admin/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data?.data || response.data || [];
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Gagal memuat data produk");
      setProducts([]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSavings(), fetchMembers(), fetchProducts()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // Auto-fill product when member is selected
  useEffect(() => {
    if (formData.memberId && !editingId) {
      // Only auto-fill when creating new savings (not editing)
      const selectedMember = members.find(member => member._id === formData.memberId);
      if (selectedMember && selectedMember.productId) {
        setFormData(prev => ({ ...prev, productId: selectedMember.productId }));
      } else if (selectedMember && !selectedMember.productId) {
        setFormData(prev => ({ ...prev, productId: "" }));
      }
    }
  }, [formData.memberId, members, editingId]);

  // Auto-update installmentPeriod when member/product change
  useEffect(() => {
    if (formData.memberId && formData.productId && products.length > 0) {
      checkLastInstallmentPeriod(formData.memberId, formData.productId);
    } else {
      // Reset when either field empty
      setLastPeriod(0);
      if (!editingId) {
        setFormData((prev) => ({ ...prev, installmentPeriod: 1, description: "Pembayaran Simpanan Periode - 1" }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.memberId, formData.productId, products.length, editingId]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Auto-calc next installment period based on last saved period
  const checkLastInstallmentPeriod = async (memberId, productId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/admin/savings/check-period/${memberId}/${productId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = response.data?.data || response.data || {};
      
      console.log("=== Check Period Response ===", data);
      console.log("Next Period:", data.nextPeriod);
      console.log("Expected Amount:", data.expectedAmount);
      console.log("Has Upgrade:", data.hasUpgrade);
      console.log("Upgrade Info:", data.upgradeInfo);
      
      // Update period info state
      setPeriodInfo({
        incompletePeriods: data.incompletePeriods || [],
        pendingTransactions: data.pendingTransactions || [],
        transactionsByPeriod: data.transactionsByPeriod || {},
        nextPeriod: data.nextPeriod || 1,
        suggestedAmount: data.expectedAmount || data.remainingAmount || data.depositAmount || 0,
        isPartialPayment: data.isPartialPayment || false,
        remainingAmount: data.remainingAmount || 0,
        depositAmount: data.depositAmount || 0,
        hasUpgrade: data.hasUpgrade || false,
        upgradeInfo: data.upgradeInfo || null
      });

      const last = data.lastPeriod ?? 0;
      const next = data.nextPeriod || 1;
      setLastPeriod(last);
      
      // Get rejected periods for this member/product
      await fetchRejectedPeriods(memberId, productId);
      
      // Auto-fill based on intelligent detection
      const selectedProduct = products.find(p => p._id === productId);
      
      // Use setTimeout to ensure state updates properly
      setTimeout(() => {
        if (!editingId) {
          let suggestedAmount = data.expectedAmount || selectedProduct?.depositAmount || 0;
          let description = `Pembayaran Simpanan Periode - ${next}`;
          
          // Check if member has upgraded
          if (data.hasUpgrade && data.upgradeInfo) {
            // IMPORTANT: Use expectedAmount from API which already includes compensation
            suggestedAmount = data.expectedAmount || data.upgradeInfo.newPaymentWithCompensation;
            description = `Pembayaran Simpanan Periode - ${next} (Upgrade: Rp ${data.upgradeInfo.newMonthlyDeposit?.toLocaleString()} + Kompensasi: Rp ${data.upgradeInfo.compensationPerMonth?.toLocaleString()})`;
            
            console.log("Setting amount for upgraded member:", suggestedAmount);
          }
          // Check if this is partial payment continuation
          else if (data.isPartialPayment && data.remainingAmount > 0) {
            suggestedAmount = data.remainingAmount;
            description = `Pembayaran Sisa Periode - ${next} (Rp ${data.remainingAmount.toLocaleString()})`;
          }
          
          setFormData((prev) => ({ 
            ...prev, 
            amount: suggestedAmount,
            installmentPeriod: next,
            description: description
          }));
        }
      }, 100);
    } catch (error) {
      console.error("Error checking last period:", error);
      setLastPeriod(0);
      setPeriodInfo({
        incompletePeriods: [],
        rejectedPeriods: [],
        pendingTransactions: [],
        transactionsByPeriod: {},
        nextPeriod: 1,
        suggestedAmount: 0,
        isPartialPayment: false,
        remainingAmount: 0
      });
      if (!editingId) {
        setFormData((prev) => ({ 
          ...prev, 
          installmentPeriod: 1,
          description: "Pembayaran Simpanan Periode - 1"
        }));
      }
    }
  };

  const fetchRejectedPeriods = async (memberId, productId) => {
    try {
      if (!memberId || !productId) {
        return; // Skip if params are missing
      }
      
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_URL}/api/admin/savings`,
        { 
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data) {
        const savingsData = response.data.data?.savings || response.data.data || response.data.savings || [];
        const rejectedPeriods = [...new Set(savingsData
          .filter(s => 
            s.status === 'Rejected' && 
            (s.memberId?._id === memberId || s.memberId === memberId) &&
            (s.productId?._id === productId || s.productId === productId)
          )
          .map(s => s.installmentPeriod)
        )];
        setPeriodInfo(prev => ({
          ...prev,
          rejectedPeriods: rejectedPeriods
        }));
      }
    } catch (error) {
      console.error("Error fetching rejected periods:", error);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent double submit
    if (submitLoading) return;
    setSubmitLoading(true);

    // Debug: log form data before sending
    console.log("Form data being submitted:", formData);

    // Get token first
    const token = localStorage.getItem("token");
    
    // Check if we have a file to upload
    const hasFile = formData.proofFile && formData.proofFile instanceof File;
    
    let formDataToSend;
    let headers = {
      Authorization: `Bearer ${token}`,
    };

    if (hasFile) {
      // Use FormData for file upload
      formDataToSend = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key] !== null && formData[key] !== undefined && formData[key] !== "") {
          formDataToSend.append(key, formData[key]);
        }
      });
      headers["Content-Type"] = "multipart/form-data";
    } else {
      // Use JSON for non-file submissions
      const dataToSend = { ...formData };
      delete dataToSend.proofFile; // Remove file field if null/undefined
      
      // Ensure numeric fields are numbers
      dataToSend.amount = Number(dataToSend.amount);
      dataToSend.installmentPeriod = Number(dataToSend.installmentPeriod);

      if (!dataToSend.paymentDate) delete dataToSend.paymentDate;
      
      formDataToSend = dataToSend;
      headers["Content-Type"] = "application/json";
    }

    console.log("Data being sent:", formDataToSend);
    console.log("Headers:", headers);

    try {
      if (editingId) {
        // Update existing savings
        await axios.put(`${API_URL}/api/admin/savings/${editingId}`, formDataToSend, {
          headers: headers,
        });
        toast.success("✅ Data simpanan berhasil diperbarui");
      } else {
        // Create new savings
        await axios.post(`${API_URL}/api/admin/savings`, formDataToSend, {
          headers: headers,
        });
        toast.success("✅ Data simpanan berhasil ditambahkan");
      }

      setShowModal(false);
      setEditingId(null);
      resetForm();
      fetchSavings();
    } catch (error) {
      console.error("Submit error:", error);
      console.error("Error response:", error.response?.data);
      
      // Build detailed error message
      let errorMessage = "Gagal menyimpan data";
      const errorData = error.response?.data;
      
      if (errorData) {
        // Check for specific error messages from backend
        if (errorData.message) {
          errorMessage = errorData.message;
        }
        
        // Check for validation errors
        if (errorData.errors && Array.isArray(errorData.errors)) {
          const validationErrors = errorData.errors.map(e => e.message || e).join(", ");
          errorMessage = `Validasi gagal: ${validationErrors}`;
        }
        
        // Check for specific field errors
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Show detailed toast with icon
      toast.error(
        <div>
          <strong>❌ {editingId ? 'Gagal Update' : 'Gagal Simpan'}</strong>
          <p className="text-sm mt-1">{errorMessage}</p>
          {error.response?.status && (
            <p className="text-xs text-gray-400 mt-1">Status: {error.response.status}</p>
          )}
        </div>,
        { autoClose: 5000 }
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      installmentPeriod: 1,
      memberId: "",
      productId: "",
      amount: "",
      savingsDate: format(new Date(), "yyyy-MM-dd"),
      paymentDate: "",
      type: "Setoran",
      description: "",
      status: "Pending",
      paymentType: "Full",
      notes: "",
      proofFile: null,
    });
    setLastPeriod(0);
    setOriginalSelection({ memberId: "", productId: "" });
    setExistingProofFile(null);
    setEditingId(null);
    // Reset member search
    setMemberSearchTerm("");
    setShowMemberDropdown(false);
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
      toast.error("File tidak boleh lebih dari 5MB");
      return;
    }
    setFormData({ ...formData, proofFile: file });
  };

  // Handle delete
  const handleDelete = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: "Hapus Simpanan",
      message: "Apakah Anda yakin ingin menghapus simpanan ini? File bukti juga akan dihapus.",
      type: "danger",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const token = localStorage.getItem("token");
          await axios.delete(`${API_URL}/api/admin/savings/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          toast.success("🗑️ Simpanan dan bukti berhasil dihapus");
          fetchSavings();
        } catch {
          toast.error("Gagal menghapus simpanan");
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleApprove = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: "Setujui Simpanan",
      message: "Apakah Anda yakin ingin menyetujui simpanan ini?",
      type: "success",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const token = localStorage.getItem("token");
          await axios.patch(`${API_URL}/api/admin/savings/${id}/approve`, 
            { notes: "" }, 
            { headers: { Authorization: `Bearer ${token}` } }
          );
          toast.success("✅ Simpanan berhasil disetujui");
          fetchSavings();
        } catch {
          toast.error("Gagal menyetujui simpanan");
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Open proof modal (view proof before action)
  const openProofModal = (saving) => {
    setSelectedSaving(saving);
    setShowProofModal(true);
  };

  // Close proof modal
  const closeProofModal = () => {
    setSelectedSaving(null);
    setShowProofModal(false);
  };

  const handleReject = (id) => {
    setRejectSavingsId(id);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast.error("⚠️ Alasan penolakan wajib diisi");
      return;
    }

    setRejectLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_URL}/api/admin/savings/${rejectSavingsId}/reject`,
        { rejectionReason: rejectionReason.trim(), notes: "" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("❌ Simpanan berhasil ditolak");
      setShowRejectModal(false);
      setRejectSavingsId(null);
      setRejectionReason("");
      fetchSavings();
    } catch {
      toast.error("Gagal menolak simpanan");
    } finally {
      setRejectLoading(false);
    }
  };


  // Handle edit
  const handleEdit = (saving) => {
    setEditingId(saving._id);
    setFormData({
      installmentPeriod: saving.installmentPeriod || 1,
      memberId: saving.memberId?._id || saving.memberId || "",
      productId: saving.productId?._id || saving.productId || "",
      amount: saving.amount || 0,
      savingsDate: format(new Date(saving.savingsDate), "yyyy-MM-dd"),
      paymentDate: saving.paymentDate ? format(new Date(saving.paymentDate), "yyyy-MM-dd") : "",
      type: saving.type || "Setoran",
      description: saving.description || "",
      status: saving.status || "Pending",
      proofFile: null,
    });
    // Store existing proof file for preview
    setExistingProofFile(saving.proofFile || null);
    setOriginalSelection({
      memberId: saving.memberId?._id || saving.memberId || "",
      productId: saving.productId?._id || saving.productId || "",
    });
    setLastPeriod(0);
    setShowModal(true);
  };

  // Get member name
  const getMemberName = (memberId) => {
    if (!memberId) return "Unknown";
    const member = members.find(
      (m) => m._id === memberId || m._id === memberId._id
    );
    if (member) return member.name;

    // Handle populated member object
    if (typeof memberId === "object" && memberId.name) {
      return memberId.name;
    }
    return "Unknown";
  };

  // Get product name
  const getProductName = (productId) => {
    if (!productId) return "Unknown";
    const product = products.find(
      (p) => p._id === productId || p._id === productId._id
    );
    if (product) return product.title;

    // Handle populated product object
    if (typeof productId === "object" && productId.title) {
      return productId.title;
    }
    return "Unknown";
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const badges = {
      Pending: "bg-yellow-100 text-yellow-800",
      Approved: "bg-green-100 text-green-800",
      Rejected: "bg-red-100 text-red-800",
    };
    return badges[status] || "bg-gray-100 text-gray-800";
  };

  // Filter and sort logic
  const filteredSavings = savings.filter(saving => {
    // Search filter
    const memberName = saving.memberId?.name || "";
    const memberUuid = saving.memberId?.uuid || "";
    const description = saving.description || "";
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      memberName.toLowerCase().includes(searchLower) ||
      memberUuid.toLowerCase().includes(searchLower) ||
      description.toLowerCase().includes(searchLower);
    
    // Status filter
    const matchesStatus = filterStatus === "all" || saving.status === filterStatus;
    
    // Product filter
    const productId = saving.productId?._id || saving.productId;
    const matchesProduct = filterProduct === "all" || productId === filterProduct;
    
    // Member filter
    const memberId = saving.memberId?._id || saving.memberId;
    const matchesMember = filterMember === "all" || memberId === filterMember;
    
    return matchesSearch && matchesStatus && matchesProduct && matchesMember;
  });

  // Sort logic
  const sortedSavings = [...filteredSavings].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.savingsDate);
    const dateB = new Date(b.createdAt || b.savingsDate);
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  // Pagination logic
  const totalPages = Math.ceil(sortedSavings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSavings = sortedSavings.slice(startIndex, endIndex);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterProduct, filterMember, sortOrder]);

  // Close member dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) {
        setShowMemberDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter members based on search term
  const filteredMembers = members.filter((member) => {
    if (!memberSearchTerm) return true;
    const searchLower = memberSearchTerm.toLowerCase();
    return (
      member.name?.toLowerCase().includes(searchLower) ||
      member.uuid?.toLowerCase().includes(searchLower) ||
      member.product?.title?.toLowerCase().includes(searchLower)
    );
  });

  // Get selected member display text
  const getSelectedMemberText = () => {
    if (!formData.memberId) return "";
    const member = members.find(m => m._id === formData.memberId);
    if (!member) return "";
    return `${member.uuid} - ${member.name} ${member.product ? `(${member.product.title})` : '(Belum pilih produk)'}`;
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterStatus("all");
    setFilterProduct("all");
    setFilterMember("all");
    setSortOrder("newest");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          🌸 Data Simpanan
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
        >
          ➕ Tambah Simpanan
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Setoran</h3>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(summary.totalSetoran)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Penarikan</h3>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(summary.totalPenarikan)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Saldo</h3>
          <p className="text-2xl font-bold text-blue-600">
            {formatCurrency(summary.saldo)}
          </p>
        </div>
      </div>

      {/* Filter & Search Section */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 border border-pink-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">🔍 Cari</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nama, UUID, atau keterangan..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">📊 Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">Semua Status</option>
              <option value="Pending">⏳ Pending</option>
              <option value="Approved">✅ Approved</option>
              <option value="Partial">🔶 Partial</option>
              <option value="Rejected">❌ Rejected</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">📦 Produk</label>
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">Semua Produk</option>
              {products.map(product => (
                <option key={product._id} value={product._id}>
                  {product.title}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">📅 Urutan</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        {/* Filter Summary */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">
            Menampilkan <strong>{sortedSavings.length}</strong> dari <strong>{savings.length}</strong> data
          </span>
          {(searchTerm || filterStatus !== "all" || filterProduct !== "all") && (
            <span className="text-pink-600">• Filter aktif</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-pink-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Tanggal Upload
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Tanggal Pembayaran
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Anggota
                </th>
                <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Produk
                </th>
                <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Periode
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Jumlah
                </th>
                <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Tipe
                </th>
                <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Keterangan
                </th>
                <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Bukti
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentSavings.map((saving) => (
                <tr key={saving._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(saving.savingsDate), "dd MMM yyyy", {
                      locale: id,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {saving.paymentDate
                      ? format(new Date(saving.paymentDate), "dd MMM yyyy", { locale: id })
                      : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getMemberName(saving.memberId)}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getProductName(saving.productId)}
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {saving.installmentPeriod || 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(saving.amount)}
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        saving.type === "Setoran"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {saving.type}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={saving.description}>
                    {saving.description || "-"}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {saving.proofFile ? (
                      <button
                        onClick={() => openProofModal(saving)}
                        className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                      >
                        <span>👁️</span> Lihat Bukti
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col space-y-1">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(
                          saving.status
                        )}`}
                        title={saving.status === 'Rejected' && saving.rejectionReason ? `Alasan: ${saving.rejectionReason}` : ''}
                      >
                        {saving.status}
                        {saving.status === 'Rejected' && (
                          <span className="ml-1">💬</span>
                        )}
                      </span>
                      {saving.paymentType === "Partial" && (
                        <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">
                          Partial #{saving.partialSequence}
                        </span>
                      )}
                      {saving.status === 'Rejected' && saving.rejectionReason && (
                        <div className="text-red-600 text-xs italic max-w-xs truncate" title={saving.rejectionReason}>
                          💬 {saving.rejectionReason}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-1">
                      {saving.status === "Pending" && (
                        saving.proofFile ? (
                          <button
                            onClick={() => openProofModal(saving)}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
                            title="Lihat bukti & Aksi"
                          >
                            👁️ Review
                          </button>
                        ) : (
                          <span className="text-xs text-yellow-600" title="Bukti belum diupload">
                            ⚠️ No Proof
                          </span>
                        )
                      )}
                      <button
                        onClick={() => handleEdit(saving)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(saving._id)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
                        title="Hapus"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Custom Pagination */}
        {savings.length > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4">
            <div className="flex-1 flex justify-between sm:hidden">
              {/* Mobile Pagination */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || totalPages <= 1}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  currentPage === 1 || totalPages <= 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>
              <div className="flex items-center">
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {Math.max(totalPages, 1)}
                </span>
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages <= 1}
                className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  currentPage === totalPages || totalPages <= 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
            
            {/* Desktop Pagination */}
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {Math.min((currentPage - 1) * itemsPerPage + 1, savings.length)}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * itemsPerPage, savings.length)}
                  </span>{' '}
                  of <span className="font-medium">{savings.length}</span> results
                </p>
              </div>
              
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  {/* Previous Button */}
                  <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                        currentPage === 1
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {/* Page Numbers */}
                    {(() => {
                      const pages = [];
                      
                      // If there's only 1 page or no pages, show just page 1
                      if (totalPages <= 1) {
                        pages.push(
                          <button
                            key={1}
                            onClick={() => handlePageChange(1)}
                            className="z-10 bg-pink-50 border-pink-500 text-pink-600 relative inline-flex items-center px-4 py-2 border text-sm font-medium cursor-default"
                          >
                            1
                          </button>
                        );
                        return pages;
                      }
                      
                      const maxPagesToShow = 7;
                      let startPage = Math.max(1, currentPage - 3);
                      let endPage = Math.min(totalPages, currentPage + 3);
                      
                      // Adjust if we're near the beginning or end
                      if (currentPage <= 4) {
                        endPage = Math.min(totalPages, maxPagesToShow);
                      }
                      if (currentPage >= totalPages - 3) {
                        startPage = Math.max(1, totalPages - maxPagesToShow + 1);
                      }
                      
                      // First page
                      if (startPage > 1) {
                        pages.push(
                          <button
                            key={1}
                            onClick={() => handlePageChange(1)}
                            className="bg-white border-gray-300 text-gray-500 hover:bg-gray-50 relative inline-flex items-center px-4 py-2 border text-sm font-medium"
                          >
                            1
                          </button>
                        );
                        if (startPage > 2) {
                          pages.push(
                            <span key="dots1" className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                              ...
                            </span>
                          );
                        }
                      }
                      
                      // Middle pages
                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => handlePageChange(i)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              i === currentPage
                                ? 'z-10 bg-pink-50 border-pink-500 text-pink-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {i}
                          </button>
                        );
                      }
                      
                      // Last page
                      if (endPage < totalPages) {
                        if (endPage < totalPages - 1) {
                          pages.push(
                            <span key="dots2" className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                              ...
                            </span>
                          );
                        }
                        pages.push(
                          <button
                            key={totalPages}
                            onClick={() => handlePageChange(totalPages)}
                            className="bg-white border-gray-300 text-gray-500 hover:bg-gray-50 relative inline-flex items-center px-4 py-2 border text-sm font-medium"
                          >
                            {totalPages}
                          </button>
                        );
                      }
                      
                      return pages;
                    })()}
                    
                    {/* Next Button */}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                        currentPage === totalPages
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
                {editingId ? "Edit Data Simpanan" : "Tambah Data Simpanan"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Anggota
                  </label>
                  {/* Searchable Member Dropdown */}
                  <div className="relative mt-1" ref={memberDropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={showMemberDropdown ? memberSearchTerm : getSelectedMemberText()}
                        onChange={(e) => {
                          setMemberSearchTerm(e.target.value);
                          if (!showMemberDropdown) setShowMemberDropdown(true);
                        }}
                        onFocus={() => {
                          setShowMemberDropdown(true);
                          setMemberSearchTerm("");
                        }}
                        placeholder="🔍 Ketik nama atau UUID anggota..."
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-10"
                        autoComplete="off"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        {formData.memberId && !showMemberDropdown ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ ...formData, memberId: "" });
                              setMemberSearchTerm("");
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        ) : (
                          <span className="text-gray-400 pointer-events-none">▼</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Dropdown List */}
                    {showMemberDropdown && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredMembers.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">
                            {memberSearchTerm ? `Tidak ada anggota "${memberSearchTerm}"` : "Tidak ada anggota"}
                          </div>
                        ) : (
                          filteredMembers.map((member) => (
                            <div
                              key={member._id}
                              onClick={() => {
                                setFormData({ ...formData, memberId: member._id });
                                setShowMemberDropdown(false);
                                setMemberSearchTerm("");
                              }}
                              className={`px-4 py-2 cursor-pointer hover:bg-pink-50 transition-colors ${
                                formData.memberId === member._id ? 'bg-pink-100 text-pink-800' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-900">{member.name}</span>
                                  <span className="ml-2 text-xs text-gray-500">{member.uuid}</span>
                                </div>
                                {member.product && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                    {member.product.title}
                                  </span>
                                )}
                              </div>
                              {!member.product && (
                                <span className="text-xs text-orange-500">Belum pilih produk</span>
                              )}
                            </div>
                          ))
                        )}
                        {filteredMembers.length > 0 && (
                          <div className="px-4 py-2 text-xs text-gray-400 border-t bg-gray-50">
                            {filteredMembers.length} anggota ditemukan
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Hidden input for form validation */}
                  <input
                    type="hidden"
                    value={formData.memberId}
                    required
                  />
                  {!formData.memberId && (
                    <p className="mt-1 text-xs text-gray-500">
                      💡 Ketik untuk mencari anggota berdasarkan nama atau UUID
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Produk Simpanan
                  </label>
                  <select
                    value={formData.productId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        productId: e.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  >
                    <option value="">Pilih Produk</option>
                    {products.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.title} - Min: {formatCurrency(product.depositAmount)}
                      </option>
                    ))}
                  </select>
                  {formData.memberId && !editingId && (
                    <p className="mt-1 text-sm text-blue-600">
                      💡 Produk otomatis dipilih berdasarkan anggota yang dipilih
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Periode Angsuran
                    </label>
                    <select
                      value={formData.installmentPeriod}
                      onChange={(e) => {
                        const selectedPeriod = parseInt(e.target.value);
                        const product = products.find(p => p._id === formData.productId);
                        
                        // Calculate amount for selected period
                        let suggestedAmount = product?.depositAmount || 0;
                        let description = `Pembayaran Simpanan Periode - ${selectedPeriod}`;
                        
                        // Check if period has existing transactions
                        const periodTransactions = periodInfo.transactionsByPeriod?.[selectedPeriod] || [];
                        const totalPaid = periodTransactions
                          .filter(t => t.status === 'Approved')
                          .reduce((sum, t) => sum + (t.amount || 0), 0);
                        
                        // Adjust for upgrade if applicable
                        if (periodInfo.hasUpgrade && periodInfo.upgradeInfo) {
                          const completedAtUpgrade = periodInfo.upgradeInfo.completedPeriodsAtUpgrade || 0;
                          if (selectedPeriod <= completedAtUpgrade) {
                            suggestedAmount = periodInfo.upgradeInfo.oldMonthlyDeposit || product?.depositAmount || 0;
                          } else {
                            suggestedAmount = periodInfo.upgradeInfo.newPaymentWithCompensation || product?.depositAmount || 0;
                          }
                        }
                        
                        // Calculate remaining if partial payment
                        const remainingAmount = Math.max(0, suggestedAmount - totalPaid);
                        if (totalPaid > 0 && remainingAmount > 0) {
                          suggestedAmount = remainingAmount;
                          description = `Pembayaran Sisa Periode - ${selectedPeriod} (Rp ${remainingAmount.toLocaleString()})`;
                        } else if (totalPaid > 0 && remainingAmount === 0) {
                          // Period already complete, but user can still add more
                          description = `Pembayaran Tambahan Periode - ${selectedPeriod}`;
                        }
                        
                        setFormData({
                          ...formData,
                          installmentPeriod: selectedPeriod,
                          amount: suggestedAmount,
                          description: description
                        });
                      }}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      required
                    >
                      {formData.memberId && formData.productId ? (
                        // Generate options based on product termDuration
                        (() => {
                          const product = products.find(p => p._id === formData.productId);
                          const maxPeriod = product?.termDuration || 60;
                          const options = [];
                          
                          // Add all periods, marking complete/incomplete/pending
                          for (let i = 1; i <= maxPeriod; i++) {
                            const periodTransactions = periodInfo.transactionsByPeriod?.[i] || [];
                            const hasApproved = periodTransactions.some(t => t.status === 'Approved');
                            const hasPending = periodTransactions.some(t => t.status === 'Pending');
                            const hasRejected = periodTransactions.some(t => t.status === 'Rejected');
                            const totalPaid = periodTransactions
                              .filter(t => t.status === 'Approved')
                              .reduce((sum, t) => sum + (t.amount || 0), 0);
                            
                            // Calculate required amount for this period
                            let requiredAmount = product?.depositAmount || 0;
                            if (periodInfo.hasUpgrade && periodInfo.upgradeInfo) {
                              const completedAtUpgrade = periodInfo.upgradeInfo.completedPeriodsAtUpgrade || 0;
                              if (i <= completedAtUpgrade) {
                                requiredAmount = periodInfo.upgradeInfo.oldMonthlyDeposit || product?.depositAmount || 0;
                              } else {
                                requiredAmount = periodInfo.upgradeInfo.newPaymentWithCompensation || product?.depositAmount || 0;
                              }
                            }
                            
                            const remainingAmount = Math.max(0, requiredAmount - totalPaid);
                            
                            let label = `Periode ${i}`;
                            if (hasApproved && remainingAmount === 0) {
                              label += ' ✓ Lunas';
                            } else if (hasApproved && remainingAmount > 0) {
                              label += ` (Sisa: Rp ${remainingAmount.toLocaleString()})`;
                            } else if (hasPending) {
                              label += ' ⏳ Pending';
                            } else if (hasRejected) {
                              label += ' ❌ Ditolak';
                            } else if (i === periodInfo.nextPeriod) {
                              label += ' 📍 Disarankan';
                            }
                            
                            options.push(
                              <option key={i} value={i}>
                                {label}
                              </option>
                            );
                          }
                          return options;
                        })()
                      ) : (
                        <option value="1">Pilih Anggota & Produk terlebih dahulu</option>
                      )}
                    </select>
                    {formData.memberId && formData.productId && (
                      <p className="mt-1 text-xs text-gray-600">
                        Periode otomatis terdeteksi, tapi Anda bisa memilih periode lain yang tersedia
                      </p>
                    )}
                    
                    {/* Enhanced Period Information Panel */}
                    {formData.memberId && formData.productId && (
                      <div className="mt-3 space-y-3">
                        {/* Main Status Row - Horizontal Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {/* Left: Status Overview */}
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">
                              📊 Status Periode
                            </h4>
                            
                            {lastPeriod > 0 && (
                              <p className="text-xs text-gray-600 mb-1">
                                Terakhir approved: <span className="font-semibold">Periode {lastPeriod}</span>
                              </p>
                            )}
                            
                            <p className="text-sm text-green-700 font-medium mb-1">
                              📍 Disarankan: <span className="font-semibold">Periode {periodInfo.nextPeriod}</span>
                              {periodInfo.isPartialPayment && (
                                <span className="ml-1 text-orange-600 text-xs">(Lanjutan)</span>
                              )}
                            </p>
                            
                            <p className="text-sm text-blue-700">
                              💰 <span className="font-semibold">
                                Rp {periodInfo.suggestedAmount?.toLocaleString() || '0'}
                              </span>
                              {periodInfo.isPartialPayment && (
                                <span className="text-orange-600 text-xs"> (Sisa)</span>
                              )}
                            </p>

                            {/* Upgrade Info */}
                            {periodInfo.hasUpgrade && periodInfo.upgradeInfo && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-xs text-purple-800 font-semibold">
                                  ✨ Member Sudah Upgrade
                                </p>
                                <div className="text-xs text-gray-600 mt-1 space-y-1">
                                  <p>Produk Lama: Rp {periodInfo.upgradeInfo.oldMonthlyDeposit?.toLocaleString()}/bulan</p>
                                  <p>Produk Baru: Rp {periodInfo.upgradeInfo.newMonthlyDeposit?.toLocaleString()}/bulan</p>
                                  <p>Kompensasi: Rp {periodInfo.upgradeInfo.compensationPerMonth?.toLocaleString()}/bulan</p>
                                  <p className="font-semibold text-purple-700">
                                    Total: Rp {periodInfo.upgradeInfo.newPaymentWithCompensation?.toLocaleString()}/bulan
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right: Transaction History + Alerts + Actions */}
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            {/* Header with Tooltip */}
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-semibold text-gray-800">
                                📋 Riwayat & Status
                              </h4>
                              <div className="group relative">
                                <button className="text-blue-600 hover:text-blue-800 text-xs underline">
                                  Detail →
                                </button>
                                <div className="absolute right-0 top-6 w-80 bg-white border border-gray-300 rounded-lg shadow-lg p-3 hidden group-hover:block z-50">
                                  <h5 className="font-semibold text-sm mb-2 text-gray-800">Riwayat Per Periode:</h5>
                                  <div className="max-h-60 overflow-y-auto">
                                    {Object.keys(periodInfo.transactionsByPeriod).length > 0 ? (
                                      Object.entries(periodInfo.transactionsByPeriod)
                                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                        .map(([period, transactions]) => (
                                          <div key={period} className="mb-3 pb-2 border-b border-gray-200 last:border-b-0">
                                            <div className="font-semibold text-xs text-gray-700 mb-1">
                                              Periode {period}:
                                            </div>
                                            {transactions.map((tx, idx) => (
                                              <div key={idx} className="text-xs text-gray-600 ml-2 mb-1">
                                                <span className={`inline-block px-2 py-0.5 rounded text-white text-xs mr-2 ${
                                                  tx.status === 'Approved' ? 'bg-green-500' :
                                                  tx.status === 'Pending' ? 'bg-yellow-500' :
                                                  tx.status === 'Rejected' ? 'bg-red-500' : 'bg-gray-500'
                                                }`}>
                                                  {tx.status}
                                                </span>
                                                Rp {tx.amount?.toLocaleString()} 
                                                <span className="text-gray-400 ml-1">
                                                  ({new Date(tx.date).toLocaleDateString('id-ID')})
                                                </span>
                                                {tx.status === 'Rejected' && tx.rejectionReason && (
                                                  <div className="text-red-600 text-xs italic ml-4 mt-1">
                                                    💬 "{tx.rejectionReason}"
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ))
                                    ) : (
                                      <div className="text-xs text-gray-500">Belum ada transaksi</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Summary Info */}
                            <div className="text-xs text-gray-600 mb-3">
                              Total Periode: <span className="font-semibold">
                                {Object.keys(periodInfo.transactionsByPeriod).length || 0}
                              </span>
                            </div>

                            {/* Inline Alert Badges */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {/* Incomplete */}
                              {periodInfo.incompletePeriods && periodInfo.incompletePeriods.length > 0 && (
                                <div className="px-2 py-1 bg-orange-100 border border-orange-300 rounded text-xs">
                                  <span className="font-semibold text-orange-800">⚠️</span>
                                  <span className="text-orange-700 ml-1">
                                    P{periodInfo.incompletePeriods[0].period}
                                    {periodInfo.incompletePeriods.length > 1 && ` +${periodInfo.incompletePeriods.length - 1}`}
                                  </span>
                                </div>
                              )}

                              {/* Pending */}
                              {periodInfo.pendingTransactions && periodInfo.pendingTransactions.length > 0 && (
                                <div className="px-2 py-1 bg-yellow-100 border border-yellow-300 rounded text-xs">
                                  <span className="font-semibold text-yellow-800">⏳</span>
                                  <span className="text-yellow-700 ml-1">
                                    P{periodInfo.pendingTransactions[0].installmentPeriod}
                                    {periodInfo.pendingTransactions.length > 1 && ` +${periodInfo.pendingTransactions.length - 1}`}
                                  </span>
                                </div>
                              )}

                              {/* Rejected */}
                              {periodInfo.rejectedPeriods && periodInfo.rejectedPeriods.length > 0 && (
                                <div className="px-2 py-1 bg-red-100 border border-red-300 rounded text-xs">
                                  <span className="font-semibold text-red-800">❌</span>
                                  <span className="text-red-700 ml-1">
                                    P{periodInfo.rejectedPeriods.slice(0, 2).join(', P')}
                                    {periodInfo.rejectedPeriods.length > 2 && ` +${periodInfo.rejectedPeriods.length - 2}`}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Quick Action Buttons */}
                            <div className="border-t border-gray-300 pt-2">
                              <div className="flex flex-wrap gap-1">
                                <span className="text-xs text-gray-600 self-center mr-1">🚀</span>
                                
                                {/* Suggested Period */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    let description = '';
                                    if (periodInfo.isPartialPayment) {
                                      description = `Pembayaran Sisa Periode - ${periodInfo.nextPeriod} (Rp ${periodInfo.remainingAmount?.toLocaleString() || '0'})`;
                                    } else if (periodInfo.hasUpgrade && periodInfo.upgradeInfo) {
                                      description = `Pembayaran Simpanan Periode - ${periodInfo.nextPeriod} (Upgrade: Rp ${periodInfo.upgradeInfo.newMonthlyDeposit?.toLocaleString()} + Kompensasi: Rp ${periodInfo.upgradeInfo.compensationPerMonth?.toLocaleString()})`;
                                    } else {
                                      description = `Pembayaran Simpanan Periode - ${periodInfo.nextPeriod}`;
                                    }
                                    
                                    setFormData(prev => ({
                                      ...prev,
                                      installmentPeriod: periodInfo.nextPeriod,
                                      amount: periodInfo.suggestedAmount || 0,
                                      description
                                    }));
                                  }}
                                  className="px-2 py-1 text-xs bg-green-100 text-green-800 border border-green-300 rounded hover:bg-green-200 transition-colors"
                                >
                                  📍 P{periodInfo.nextPeriod}
                                  {periodInfo.isPartialPayment ? ' (Sisa)' : periodInfo.hasUpgrade ? ' (Upgrade)' : ''}
                                </button>
                                
                                {/* Rejected Period Buttons */}
                                {periodInfo.rejectedPeriods && periodInfo.rejectedPeriods.slice(0, 2).map(period => (
                                  <button
                                    key={period}
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        installmentPeriod: period,
                                        amount: periodInfo.depositAmount || 0,
                                        description: `Submit Ulang Periode - ${period}`
                                      }));
                                    }}
                                    className="px-2 py-1 text-xs bg-red-100 text-red-800 border border-red-300 rounded hover:bg-red-200 transition-colors"
                                  >
                                    🔄 P{period}
                                  </button>
                                ))}
                                
                                {periodInfo.rejectedPeriods && periodInfo.rejectedPeriods.length > 2 && (
                                  <span className="text-xs text-gray-500 self-center">
                                    +{periodInfo.rejectedPeriods.length - 2}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Jumlah
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amount: parseInt(e.target.value),
                        })
                      }
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      required
                    />
                    {periodInfo.suggestedAmount > 0 && !editingId && (
                      <p className="mt-1 text-sm text-blue-600">
                        💡 Jumlah yang diharapkan: Rp {periodInfo.suggestedAmount.toLocaleString()}
                        {periodInfo.hasUpgrade && ' (termasuk kompensasi)'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tanggal Upload
                    </label>
                    <input
                      type="date"
                      value={formData.savingsDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          savingsDate: e.target.value,
                        })
                      }
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tanggal Pembayaran
                    </label>
                    <input
                      type="date"
                      value={formData.paymentDate || ""}
                      onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">Opsional (kalau ada bukti tanggal transfer)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tipe
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="Setoran">Setoran</option>
                      <option value="Penarikan">Penarikan</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Keterangan
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows="3"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={formData.status || "Pending"}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Bukti Pembayaran
                  </label>
                  
                  {/* Show existing proof file preview when editing */}
                  {editingId && existingProofFile && !formData.proofFile && (
                    <div className="mt-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-blue-600 text-lg">📎</span>
                          <div>
                            <p className="text-sm font-medium text-blue-800">Bukti yang sudah ada:</p>
                            <p className="text-xs text-blue-600 truncate max-w-xs">{existingProofFile}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`${API_URL}/uploads/simpanan/${existingProofFile}?t=${Date.now()}`, '_blank')}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          👁️ Lihat
                        </button>
                      </div>
                      {/* Image preview with cache-busting */}
                      <div className="mt-2">
                        <img 
                          src={`${API_URL}/uploads/simpanan/${existingProofFile}?t=${Date.now()}`}
                          alt="Bukti pembayaran"
                          className="max-h-32 rounded border border-blue-300 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => window.open(`${API_URL}/uploads/simpanan/${existingProofFile}?t=${Date.now()}`, '_blank')}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                      <p className="text-xs text-blue-600 mt-2 italic">
                        💡 Upload file baru di bawah untuk mengganti bukti ini
                      </p>
                    </div>
                  )}
                  
                  {/* Show new file preview if selected */}
                  {formData.proofFile && (
                    <div className="mt-2 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-green-600 text-lg">✅</span>
                        <div>
                          <p className="text-sm font-medium text-green-800">File baru dipilih:</p>
                          <p className="text-xs text-green-600 truncate max-w-xs">{formData.proofFile.name}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*"
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Maksimal 5MB, format gambar
                  </p>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    disabled={submitLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {editingId ? 'Menyimpan...' : 'Menambahkan...'}
                      </>
                    ) : (
                      editingId ? '💾 Update' : '➕ Simpan'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={() => !rejectLoading && setShowRejectModal(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-md">
              <div className="p-6">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <span className="text-3xl">❌</span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
                  Tolak Simpanan
                </h3>

                {/* Message */}
                <p className="text-center text-gray-600 mb-4">
                  Masukkan alasan penolakan simpanan ini
                </p>

                {/* Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alasan Penolakan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Contoh: Bukti pembayaran tidak jelas, nominal tidak sesuai, dll..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    disabled={rejectLoading}
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectSavingsId(null);
                      setRejectionReason("");
                    }}
                    disabled={rejectLoading}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleRejectSubmit}
                    disabled={rejectLoading || !rejectionReason.trim()}
                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {rejectLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading...
                      </span>
                    ) : (
                      "Ya, Tolak Simpanan"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal - View proof before action */}
      {showProofModal && selectedSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">📋 Review Pembayaran</h3>
                <p className="text-pink-100 text-sm">
                  {selectedSaving.memberId?.name || 'Unknown'} - Periode {selectedSaving.installmentPeriod}
                </p>
              </div>
              <button
                onClick={closeProofModal}
                className="text-white hover:text-pink-200 text-2xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Transaction Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Anggota</p>
                  <p className="font-semibold text-gray-800">{selectedSaving.memberId?.name || '-'}</p>
                  <p className="text-xs text-gray-400">{selectedSaving.memberId?.uuid || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Produk</p>
                  <p className="font-semibold text-gray-800">{selectedSaving.productId?.title || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Jumlah</p>
                  <p className="font-semibold text-green-600">{formatCurrency(selectedSaving.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tanggal Bayar</p>
                  <p className="font-semibold text-gray-800">
                    {selectedSaving.paymentDate 
                      ? format(new Date(selectedSaving.paymentDate), "dd MMM yyyy", { locale: id })
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Proof Image */}
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">📷 Bukti Pembayaran:</p>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 bg-gray-50">
                  {selectedSaving.proofFile ? (
                    <img
                      src={`${API_URL}/uploads/simpanan/${selectedSaving.proofFile}`}
                      alt="Bukti Pembayaran"
                      className="max-w-full h-auto max-h-96 mx-auto rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(`${API_URL}/uploads/simpanan/${selectedSaving.proofFile}`, '_blank')}
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-4xl">📭</span>
                      <p className="mt-2">Tidak ada bukti pembayaran</p>
                    </div>
                  )}
                </div>
                {selectedSaving.proofFile && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Klik gambar untuk membuka di tab baru
                  </p>
                )}
              </div>

              {/* Description */}
              {selectedSaving.description && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-1">📝 Keterangan:</p>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedSaving.description}</p>
                </div>
              )}
            </div>

            {/* Modal Footer - Action Buttons */}
            {selectedSaving.status === 'Pending' && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
                <p className="text-sm text-gray-600 mb-3 text-center">
                  ⚠️ Pastikan bukti pembayaran sudah benar sebelum mengambil aksi
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button
                    onClick={() => {
                      closeProofModal();
                      handleApprove(selectedSaving._id);
                    }}
                    className="px-6 py-2.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2 shadow-md"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => {
                      closeProofModal();
                      handleReject(selectedSaving._id);
                    }}
                    className="px-6 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2 shadow-md"
                  >
                    ✕ Reject
                  </button>
                  <button
                    onClick={() => {
                      closeProofModal();
                      handleEdit(selectedSaving);
                    }}
                    className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-md"
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={() => {
                      closeProofModal();
                      handleDelete(selectedSaving._id);
                    }}
                    className="px-6 py-2.5 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors flex items-center gap-2 shadow-md"
                  >
                    🗑 Hapus
                  </button>
                </div>
              </div>
            )}

            {/* Close button for non-pending status */}
            {selectedSaving.status !== 'Pending' && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-center">
                <button
                  onClick={closeProofModal}
                  className="px-8 py-2.5 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        loading={confirmLoading}
      />
    </div>
  );
};

export default Savings;
