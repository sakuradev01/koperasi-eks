import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/index.jsx";
import Pagination from "../components/Pagination.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { toast } from "react-toastify";

const normalizeDateInputValue = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";

  return parsedDate.toISOString().slice(0, 10);
};

const Members = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // 🔴 NEW: state untuk UUID student & dropdown
  const [availableUuids, setAvailableUuids] = useState([]);
  const [filteredUuids, setFilteredUuids] = useState([]);
  const [showUuidDropdown, setShowUuidDropdown] = useState(false);
  const [loadingUuids, setLoadingUuids] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, completed, not_completed
  const [filterVerification, setFilterVerification] = useState("all"); // all, verified, unverified, address-pending
  const [filterProduct, setFilterProduct] = useState(""); // product ID, empty = all
  const [exporting, setExporting] = useState(false);
  const [formData, setFormData] = useState({
    uuid: "",
    name: "",
    gender: "L",
    phone: "",
    city: "",
    completeAddress: "",
    accountNumber: "",
    bankName: "",
    accountHolderName: "",
    nik: "",
    birthPlace: "",
    birthDate: "",
    email: "",
    riplText: "",
    riplVersion: "",
    riplAgreedAt: "",
    signatureImage: "",
    ktpImage: "",
    selfieImage: "",
    livenessLeftImage: "",
    livenessRightImage: "",
    faceMatchScore: null,
    username: "",
    password: "",
    productId: "",
    savingsStartDate: "", // Tanggal mulai tabungan
  });
  useEffect(() => {
    // Read URL query param for filter
    const filterParam = searchParams.get("filter");
    if (filterParam === "unverified") {
      setFilterVerification("unverified");
    } else if (filterParam === "address-pending") {
      setFilterVerification("address-pending");
    }
    fetchMembers();
    fetchProducts();
    fetchAvailableUuids(); // 🔴 NEW: ambil daftar UUID dari API student
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get("/api/admin/products");
      if (response.data.success) {
        setProducts(response.data.data.filter(product => product.isActive));
      }
    } catch (err) {
      console.error("Products fetch error:", err);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await api.get("/api/admin/members");
      if (response.data.success) {
        setMembers(response.data.data);
      }
    } catch (err) {
      setError("Gagal memuat data anggota");
      console.error("Members fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔴 NEW: ambil semua UUID student
  const fetchAvailableUuids = async () => {
    setLoadingUuids(true);
    try {
      const response = await fetch("https://student.samit.co.id/api/students/uuids");
      const data = await response.json();
      if (data.success) {
        setAvailableUuids(data.data);
        setFilteredUuids(data.data);
      }
    } catch (error) {
      console.error("Error fetching UUIDs:", error);
    } finally {
      setLoadingUuids(false);
    }
  };

  // 🔴 NEW: ambil data student berdasarkan UUID & auto-fill form
  const fetchStudentInfo = async (uuid) => {
    try {
      const response = await fetch(`https://student.samit.co.id/api/students/info/${uuid}`);
      const data = await response.json();
      if (data.success) {
        const studentData = data.data;

        setFormData((prev) => ({
          ...prev,
          uuid: uuid,
          name: studentData.name || prev.name,
          phone: studentData.phone || "",
          city: prev.city || studentData.birth_place || "",
          gender: String(studentData.gender || prev.gender || "L").toUpperCase() === "L" ? "L" : "P",
          email: studentData.email || prev.email,
          birthPlace: studentData.birth_place || prev.birthPlace,
          birthDate: normalizeDateInputValue(studentData.birth_date),
          completeAddress: prev.completeAddress || "-", // default alamat
          username: generateUsername(studentData.name || prev.name || ""), // username dari nama
        }));
      }
    } catch (error) {
      console.error("Error fetching student info:", error);
    }
  };

  // 🔴 NEW: generate username dari nama
  const generateUsername = (name) => {
    return name
      .toLowerCase()
      .replace(/\s+/g, ".") // spasi -> titik
      .replace(/[^a-z0-9.]/g, ""); // buang karakter aneh
  };

  // 🔴 NEW: handle perubahan input UUID + filter dropdown
  const handleUuidChange = (value) => {
    setFormData((prev) => ({ ...prev, uuid: value }));

    const filtered = availableUuids.filter((uuid) =>
      uuid.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredUuids(filtered);
    setShowUuidDropdown(value.length > 0 && filtered.length > 0);
  };

  // 🔴 NEW: pilih UUID dari dropdown
  const handleUuidSelect = (selectedUuid) => {
    setShowUuidDropdown(false);
    fetchStudentInfo(selectedUuid);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      toast.error("⚠️ Nama anggota wajib diisi");
      return;
    }
    if (!formData.uuid.trim()) {
      toast.error("⚠️ UUID anggota wajib diisi");
      return;
    }
    
    try {
      if (editingMember) {
        const response = await api.put(
          `/api/admin/members/${editingMember.uuid}`,
          formData
        );
        if (response.data.success) {
          toast.success("✅ Data anggota berhasil diperbarui");
          fetchMembers();
          setShowModal(false);
          setEditingMember(null);
        }
      } else {
        // Ensure password is provided for new member
        const memberData = {
          ...formData,
          password: formData.password || "default123",
        };
        const response = await api.post("/api/admin/members", memberData);
        if (response.data.success) {
          toast.success("🎉 Anggota baru berhasil ditambahkan");
          fetchMembers();
          setShowModal(false);
          // 🔴 NEW: reset uuid juga
          setFormData({
            uuid: "",
            name: "",
            gender: "L",
            phone: "",
            city: "",
            completeAddress: "",
            accountNumber: "",
            bankName: "",
            accountHolderName: "",
            nik: "",
            birthPlace: "",
            birthDate: "",
            email: "",
            riplText: "",
            riplVersion: "",
            riplAgreedAt: "",
            signatureImage: "",
            ktpImage: "",
            selfieImage: "",
            livenessLeftImage: "",
            livenessRightImage: "",
            faceMatchScore: null,
            username: "",
            password: "",
            productId: "",
            savingsStartDate: "",
          });
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal menyimpan data");
      setError("Gagal menyimpan data");
      console.error("Submit error:", err);
    }
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setFormData({
      uuid: member.uuid,
      name: member.name,
      gender: member.gender,
      phone: member.phone || "",
      city: member.city || "",
      completeAddress: member.completeAddress || "",
      accountNumber: member.accountNumber || "",
      bankName: member.bankName || "",
      accountHolderName: member.accountHolderName || "",
      nik: member.nik || "",
      birthPlace: member.birthPlace || "",
      birthDate: normalizeDateInputValue(member.birthDate),
      email: member.email || "",
      riplText: member.riplText || "",
      riplVersion: member.riplVersion || "",
      riplAgreedAt: member.riplAgreedAt || "",
      signatureImage: member.signatureImage || "",
      ktpImage: member.ktpImage || "",
      selfieImage: member.selfieImage || "",
      livenessLeftImage: member.livenessLeftImage || "",
      livenessRightImage: member.livenessRightImage || "",
      faceMatchScore: member.faceMatchScore ?? null,
      username: member.user?.username || "",
      password: "",
      productId: member.productId || "",
      savingsStartDate: member.savingsStartDate ? member.savingsStartDate.split('T')[0] : "",
    });
    setShowModal(true);
  };

  const handleDelete = (uuid, memberName) => {
    setConfirmDialog({
      isOpen: true,
      title: "Hapus Anggota",
      message: `Apakah Anda yakin ingin menghapus anggota "${memberName}"? Data simpanan terkait juga akan terpengaruh.`,
      type: "danger",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const response = await api.delete(`/api/admin/members/${uuid}`);
          if (response.data.success) {
            toast.success("🗑️ Anggota berhasil dihapus");
            fetchMembers();
          }
        } catch (err) {
          toast.error("Gagal menghapus data");
          setError("Gagal menghapus data");
          console.error("Delete error:", err);
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleVerify = (uuid, memberName) => {
    setConfirmDialog({
      isOpen: true,
      title: "Verifikasi Anggota",
      message: `Apakah Anda yakin ingin memverifikasi anggota "${memberName}"? Setelah diverifikasi, anggota bisa mengakses fitur tabungan.`,
      type: "warning",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const response = await api.patch(`/api/admin/members/${uuid}/verify`);
          if (response.data.success) {
            toast.success("✅ Anggota berhasil diverifikasi");
            fetchMembers();
          }
        } catch (err) {
          toast.error(err.response?.data?.message || "Gagal memverifikasi anggota");
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleUnverify = (uuid, memberName) => {
    setConfirmDialog({
      isOpen: true,
      title: "Batalkan Verifikasi",
      message: `Apakah Anda yakin ingin membatalkan verifikasi anggota "${memberName}"?`,
      type: "danger",
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const response = await api.patch(`/api/admin/members/${uuid}/unverify`);
          if (response.data.success) {
            toast.success("Verifikasi anggota berhasil dibatalkan");
            fetchMembers();
          }
        } catch (err) {
          toast.error(err.response?.data?.message || "Gagal membatalkan verifikasi");
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };
  const handleAddNew = () => {
    setEditingMember(null);
    // 🔴 NEW: reset uuid juga
    setFormData({
      uuid: "",
      name: "",
      gender: "L",
      phone: "",
      city: "",
      completeAddress: "",
      accountNumber: "",
      bankName: "",
      accountHolderName: "",
      nik: "",
      birthPlace: "",
      birthDate: "",
      email: "",
      riplText: "",
      signatureImage: "",
      ktpImage: "",
      selfieImage: "",
      livenessLeftImage: "",
      livenessRightImage: "",
      faceMatchScore: null,
      username: "",
      password: "",
      productId: "",
      savingsStartDate: "",
    });
    setShowModal(true);
  };

  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus === "completed") params.set("isCompleted", "true");
      else if (filterStatus === "not_completed") params.set("isCompleted", "false");
      if (filterVerification === "verified") params.set("verified", "true");
      else if (filterVerification === "unverified") params.set("verified", "false");
      else if (filterVerification === "address-pending") params.set("addressUpdateStatus", "pending");
      if (filterProduct) params.set("productId", filterProduct);
      if (searchTerm) params.set("search", searchTerm);

      // axios blob request via same instance (auth handled by interceptor)
      const res = await api.get(`/api/admin/members/export?${params.toString()}`, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/vnd.ms-excel" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `anggota_export_${dateStr}.xls`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("📥 Export berhasil");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Gagal export anggota");
    } finally {
      setExporting(false);
    }
  };

  const openAttachmentPreview = (item) => {
    if (!item?.value) return;
    setAttachmentPreview(item);
  };

  const closeAttachmentPreview = () => {
    setAttachmentPreview(null);
  };
  // Search and filter logic with useMemo for performance
  const filteredMembers = useMemo(() => {
    let result = members;
    
    // Filter by status
    if (filterStatus === "completed") {
      result = result.filter(member => member.isCompleted === true);
    } else if (filterStatus === "not_completed") {
      result = result.filter(member => !member.isCompleted);
    }

    // Filter by verification status
    if (filterVerification === "verified") {
      result = result.filter(member => member.isVerified === true);
    } else if (filterVerification === "unverified") {
      result = result.filter(member => !member.isVerified);
    } else if (filterVerification === "address-pending") {
      result = result.filter(member => member.addressUpdateStatus === "pending");
    }

    // Filter by product
    if (filterProduct) {
      result = result.filter(member => {
        const productId = member.product?._id || member.productId || "";
        return String(productId) === String(filterProduct);
      });
    }
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(member => {
        const nameMatch = member.name.toLowerCase().includes(searchLower);
        const uuidMatch = member.uuid.toLowerCase().includes(searchLower);
        return nameMatch || uuidMatch;
      });
    }
    
    return result;
  }, [members, searchTerm, filterStatus, filterVerification, filterProduct]);

  // Pagination logic with useMemo for performance
  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentMembers = filteredMembers.slice(startIndex, endIndex);
    
    return { totalPages, currentMembers };
  }, [filteredMembers, currentPage, itemsPerPage]);

  const { totalPages, currentMembers } = paginationData;

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle search
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  // 🔴 NEW: tutup dropdown UUID kalau klik di luar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".uuid-dropdown-container")) {
        setShowUuidDropdown(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4"> 
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-32 sm:w-32 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-4 text-sm sm:text-base text-gray-600">🌸 Memuat data anggota...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="text-red-600 text-4xl sm:text-6xl mb-4">⚠️</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-sm sm:text-base text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const attachmentItems = [
    { key: "ktp", label: "Foto KTP", hint: "Dokumen identitas utama", value: formData.ktpImage, fit: "cover" },
    { key: "selfie", label: "Selfie Dengan KTP", hint: "Foto wajah sambil memegang KTP", value: formData.selfieImage, fit: "cover" },
    { key: "livenessLeft", label: "Verifikasi Wajah Kiri", hint: "Frame saat student menoleh ke kiri", value: formData.livenessLeftImage, fit: "cover" },
    { key: "livenessRight", label: "Verifikasi Wajah Kanan", hint: "Frame saat student menoleh ke kanan", value: formData.livenessRightImage, fit: "cover" },
    { key: "signature", label: "Tanda Tangan Digital", hint: "Tanda tangan yang dipakai saat submit", value: formData.signatureImage, fit: "contain" },
  ];
  const availableAttachmentsCount = attachmentItems.filter((item) => Boolean(item.value)).length;
  const faceMatchAvailable = formData.faceMatchScore !== null && formData.faceMatchScore !== "";

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl sm:3xl font-bold text-gray-900">
          🌸 Manajemen Anggota
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="bg-white border border-pink-200 text-pink-600 px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-pink-50 transition-all duration-200 font-medium text-sm sm:text-base shadow-sm disabled:opacity-60"
          >
            {exporting ? "⏳ Export..." : "📊 Export Excel"}
          </button>
          <button
            onClick={handleAddNew}
            className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
          >
            ➕ Tambah Anggota
          </button>
        </div>
      </div>

      {/* Search & Filter Section */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-pink-100">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Cari berdasarkan nama atau UUID..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {/* Filter Status Lunas */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-sm"
            >
              <option value="all">📋 Semua</option>
              <option value="completed">✅ Lunas</option>
              <option value="not_completed">⏳ Belum Lunas</option>
            </select>
          </div>

          {/* Filter Verifikasi */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Verifikasi:</label>
            <select
              value={filterVerification}
              onChange={(e) => {
                setFilterVerification(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-sm"
            >
              <option value="all">📋 Semua</option>
              <option value="verified">✅ Terverifikasi</option>
              <option value="unverified">🕐 Belum Verifikasi</option>
              <option value="address-pending">📍 Alamat Pending</option>
            </select>
          </div>

          {/* Filter Produk */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Produk:</label>
            <select
              value={filterProduct}
              onChange={(e) => {
                setFilterProduct(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-sm"
            >
              <option value="">📋 Semua</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  🌸 {product.title}
                </option>
              ))}
            </select>
          </div>
          
          {/* Search Results Info */}
          <div className="text-sm text-gray-600">
            {searchTerm || filterStatus !== "all" || filterVerification !== "all" || filterProduct ? (
              <span className="flex items-center flex-wrap gap-1">
                <span className="font-medium text-pink-600">{filteredMembers.length}</span>
                <span>dari {members.length} anggota</span>
                {searchTerm && (
                  <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded-full text-xs">
                    "{searchTerm}"
                  </span>
                )}
                {filterStatus !== "all" && (
                  <span className={`px-2 py-1 rounded-full text-xs ${filterStatus === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                    {filterStatus === "completed" ? "✅ Lunas" : "⏳ Belum Lunas"}
                  </span>
                )}
                {filterVerification !== "all" && (
                  <span className={`px-2 py-1 rounded-full text-xs ${filterVerification === "verified" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
                    {filterVerification === "verified"
                      ? "✅ Terverifikasi"
                      : filterVerification === "address-pending"
                        ? "📍 Alamat Pending"
                        : "🕐 Belum Verifikasi"}
                  </span>
                )}
                {filterProduct ? (
                  <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    🌸 {products.find(p => String(p._id) === String(filterProduct))?.title || filterProduct}
                  </span>
                ) : null}
              </span>
            ) : (
              <span>Total: <span className="font-medium">{members.length}</span> anggota</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-pink-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
            <tr>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                UUID
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Nama
              </th>
              <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Username
              </th>
              <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Gender
              </th>
              <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Phone
              </th>
              <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                City
              </th>
              <th className="hidden xl:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                No Rekening
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Produk
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Total
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Verifikasi
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentMembers.length === 0 ? (
              <tr>
                <td colSpan="12" className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="text-6xl mb-4">🔍</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {searchTerm ? 'Tidak ada hasil ditemukan' : 'Belum ada data anggota'}
                    </h3>
                    <p className="text-gray-500 mb-4">
                      {searchTerm 
                        ? `Tidak ada anggota yang cocok dengan pencarian "${searchTerm}"`
                        : 'Mulai dengan menambahkan anggota baru'
                      }
                    </p>
                    {searchTerm && (
                      <button
                        onClick={clearSearch}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Hapus Filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              currentMembers.map((member) => (
              <tr key={member._id} className="hover:bg-pink-50 transition-colors">
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 font-mono">
                  {member.uuid}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900">
                  <button
                    onClick={() => navigate(`/master/anggota/${member.uuid}`)}
                    className="text-pink-600 hover:text-pink-800 hover:underline font-semibold transition-colors cursor-pointer"
                    title={`Lihat detail ${member.name}`}
                  >
                    {member.name}
                  </button>
                </td>
                <td className="hidden sm:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                  {member.user.username}
                </td>
                <td className="hidden md:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded-full text-xs ${member.gender === 'L' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>
                    {member.gender === 'L' ? '👨 L' : '👩 P'}
                  </span>
                </td>
                <td className="hidden lg:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                  {member.phone || "-"}
                </td>
                <td className="hidden lg:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                  {member.city || "-"}
                </td>
                <td className="hidden xl:table-cell px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 font-mono">
                  {member.accountNumber || "-"}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                  {member.product ? (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                      🌸 {member.product.title}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 font-semibold">
                  <span className={`${member.totalSavings > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {member.totalSavings ? `Rp ${member.totalSavings.toLocaleString('id-ID')}` : "Rp 0"}
                  </span>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                  {member.isCompleted ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                      ✅ Lunas
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                      ⏳ Belum
                    </span>
                  )}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                  <div className="flex flex-col items-start gap-1">
                    {member.isVerified ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                        ✅ Terverifikasi
                      </span>
                    ) : (
                      <button
                        onClick={() => handleVerify(member.uuid, member.name)}
                        className="px-3 py-1 bg-blue-500 text-white rounded-full text-xs font-semibold hover:bg-blue-600 transition-colors"
                      >
                        Verifikasi
                      </button>
                    )}
                    {member.registrationSource === "student_dashboard" && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px]">
                        via Student
                      </span>
                    )}
                    {member.addressUpdateStatus === "pending" && (
                      <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-[10px]">
                        📍 Alamat pending
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                  <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                    <button
                      onClick={() => handleEdit(member)}
                      className="text-pink-600 hover:text-pink-900 transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(member.uuid, member.name)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))
            )}
          </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          totalItems={filteredMembers.length}
        />
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative mx-auto my-6 w-[min(96vw,72rem)] rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="max-h-[calc(100vh-3rem)] overflow-y-auto px-5 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {editingMember ? "Edit Anggota" : "Tambah Anggota"}
              </h3>
              <form onSubmit={handleSubmit}>
                {!editingMember && (
                  // 🔴 NEW: input UUID + dropdown dari API student
                  <div className="mb-4 relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      🔍 UUID Student (Pilih dari database)
                    </label>
                    <div className="relative uuid-dropdown-container">
                      <input
                        type="text"
                        value={formData.uuid}
                        onChange={(e) => handleUuidChange(e.target.value)}
                        onFocus={() =>
                          setShowUuidDropdown(filteredUuids.length > 0)
                        }
                        placeholder="Ketik untuk mencari UUID... (contoh: JPTG0001)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500 pr-10"
                      />
                      {loadingUuids && (
                        <div className="absolute right-3 top-2">
                          <div className="animate-spin h-4 w-4 border-2 border-pink-500 border-t-transparent rounded-full"></div>
                        </div>
                      )}

                      {showUuidDropdown && filteredUuids.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredUuids.slice(0, 20).map((uuid) => (
                            <div
                              key={uuid}
                              onClick={() => handleUuidSelect(uuid)}
                              className="px-3 py-2 hover:bg-pink-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0"
                            >
                              <span className="font-mono text-pink-600">
                                {uuid}
                              </span>
                            </div>
                          ))}
                          {filteredUuids.length > 20 && (
                            <div className="px-3 py-2 text-sm text-gray-500 bg-gray-50">
                              ... dan {filteredUuids.length - 20} UUID lainnya
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <small className="text-gray-500 mt-1 block">
                      💡 Pilih UUID, data akan otomatis terisi.
                    </small>
                  </div>
                )}

                {editingMember && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      UUID
                    </label>
                    <input
                      type="text"
                      value={formData.uuid}
                      onChange={(e) =>
                        setFormData({ ...formData, uuid: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                {editingMember && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password (kosongkan jika tidak ingin mengubah)
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) =>
                      setFormData({ ...formData, gender: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Produk Simpanan (Opsional)
                  </label>
                  <select
                    value={formData.productId}
                    onChange={(e) =>
                      setFormData({ ...formData, productId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Produk Simpanan</option>
                    {products.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.title} - Min. Rp{" "}
                        {product.depositAmount.toLocaleString("id-ID")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alamat Lengkap
                  </label>
                  <textarea
                    value={formData.completeAddress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        completeAddress: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tempat Lahir</label>
                    <input
                      type="text"
                      value={formData.birthPlace}
                      onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NIK (No. KTP)
                  </label>
                  <input
                    type="text"
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    maxLength={16}
                    placeholder="16 digit NIK"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">🏦 Data Rekening Bank</p>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Bank</label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="Contoh: BCA, BNI, Mandiri"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">No Rekening</label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="Contoh: 1234567890"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Atas Nama</label>
                    <input
                      type="text"
                      value={formData.accountHolderName}
                      onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                      placeholder="Nama pemilik rekening"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    📋 Teks RIPL (Snapshot saat daftar)
                  </label>
                  <textarea
                    value={formData.riplText}
                    onChange={(e) => setFormData({ ...formData, riplText: e.target.value })}
                    placeholder="Teks Ringkasan Informasi Produk dan Layanan yang berlaku saat pendaftaran..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                    rows={4}
                  />
                  <small className="text-gray-500 mt-1 block">
                    💡 Otomatis terisi dari teks RIPL saat student mendaftar via dashboard.
                  </small>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Versi RIPL</label>
                    <input
                      type="text"
                      value={formData.riplVersion}
                      onChange={(e) => setFormData({ ...formData, riplVersion: e.target.value })}
                      placeholder="Contoh: tabungan-2026-05-12"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Waktu Setuju RIPL</label>
                    <input
                      type="datetime-local"
                      value={formData.riplAgreedAt ? String(formData.riplAgreedAt).slice(0, 16) : ""}
                      onChange={(e) => setFormData({ ...formData, riplAgreedAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mb-4 border-t border-gray-200 pt-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Lampiran Registrasi
                        </p>
                        <h4 className="mt-2 text-sm font-semibold text-slate-800">
                          Dokumen verifikasi dari student dashboard
                        </h4>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          KTP, selfie, liveness kiri/kanan, dan tanda tangan digital ditampilkan terpisah agar admin mudah cek satu per satu.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 xl:min-w-[270px]">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[11px] font-medium text-slate-500">Lampiran siap</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {availableAttachmentsCount}/{attachmentItems.length}
                          </p>
                        </div>
                        <div className={`rounded-2xl border px-3 py-2 ${
                          faceMatchAvailable
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white"
                        }`}>
                          <p className="text-[11px] font-medium text-slate-500">Face Match</p>
                          <p className={`mt-1 text-sm font-semibold ${
                            faceMatchAvailable ? "text-emerald-700" : "text-slate-700"
                          }`}>
                            {faceMatchAvailable ? `${formData.faceMatchScore}%` : "Belum ada"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {attachmentItems.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="mb-3 border-b border-slate-100 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-5 text-slate-800">{item.label}</p>
                              <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.hint}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              item.value ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}>
                            {item.value ? "Tersimpan" : "Kosong"}
                            </span>
                          </div>
                        </div>
                        {item.value ? (
                          <button
                            type="button"
                            onClick={() => openAttachmentPreview(item)}
                            className="group block w-full text-left"
                          >
                            <img
                              src={item.value}
                              alt={item.label}
                              className={`h-44 w-full rounded-xl border border-slate-200 bg-slate-50 transition-transform duration-300 group-hover:scale-[1.01] ${
                                item.fit === "contain" ? "object-contain p-3" : "object-cover"
                              }`}
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
                            <span className="text-xs font-semibold text-slate-500">Belum ada file</span>
                            <span className="mt-1 text-[11px] leading-5 text-slate-400">
                              Attachment ini belum tersimpan pada data anggota.
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    📆 Tanggal Mulai Tabungan (Opsional)
                  </label>
                  <input
                    type="date"
                    value={formData.savingsStartDate}
                    onChange={(e) =>
                      setFormData({ ...formData, savingsStartDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <small className="text-gray-500 mt-1 block">
                    💡 Kosongkan untuk default bulan saat ini. Isi jika student sudah bayar dari bulan sebelumnya.
                  </small>
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
                    {editingMember ? "Update" : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {attachmentPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Preview Lampiran
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">{attachmentPreview.label}</h4>
                <p className="mt-1 text-sm text-slate-500">{attachmentPreview.hint}</p>
              </div>
              <button
                type="button"
                onClick={closeAttachmentPreview}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-slate-100 p-4">
              <div className="flex min-h-[55vh] items-center justify-center rounded-2xl border border-slate-200 bg-white p-4">
                <img
                  src={attachmentPreview.value}
                  alt={attachmentPreview.label}
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              </div>
            </div>
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

export default Members;
