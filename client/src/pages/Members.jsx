import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/index.jsx";
import Pagination from "../components/Pagination.jsx";

const Members = () => {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

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
  const [formData, setFormData] = useState({
    uuid: "",
    name: "",
    gender: "L",
    phone: "",
    city: "",
    completeAddress: "",
    accountNumber: "",
    username: "",
    password: "",
    productId: "",
    savingsStartDate: "", // Tanggal mulai tabungan
  });

  useEffect(() => {
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
          name: studentData.name,
          phone: studentData.phone,
          city: studentData.birth_place, // birth_place -> city
          gender: studentData.gender === "l" ? "L" : "P", // convert format
          completeAddress: prev.completeAddress || "-", // default alamat
          username: generateUsername(studentData.name), // username dari nama
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
    try {
      if (editingMember) {
        const response = await api.put(
          `/api/admin/members/${editingMember.uuid}`,
          formData
        );
        if (response.data.success) {
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
            username: "",
            password: "",
            productId: "",
            savingsStartDate: "",
          });
        }
      }
    } catch (err) {
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
      username: member.user.username,
      password: "",
      productId: member.productId || "",
      savingsStartDate: member.savingsStartDate ? member.savingsStartDate.split('T')[0] : "",
    });
    setShowModal(true);
  };

  const handleDelete = async (uuid) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus anggota ini?")) {
      try {
        const response = await api.delete(`/api/admin/members/${uuid}`);
        if (response.data.success) {
          fetchMembers();
        }
      } catch (err) {
        setError("Gagal menghapus data");
        console.error("Delete error:", err);
      }
    }
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
      username: "",
      password: "",
      productId: "",
      savingsStartDate: "",
    });
    setShowModal(true);
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
  }, [members, searchTerm, filterStatus]);

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

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl sm:3xl font-bold text-gray-900">
          🌸 Manajemen Anggota
        </h1>
        <button
          onClick={handleAddNew}
          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
        >
          ➕ Tambah Anggota
        </button>
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
          
          {/* Search Results Info */}
          <div className="text-sm text-gray-600">
            {searchTerm || filterStatus !== "all" ? (
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
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentMembers.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-6 py-12 text-center">
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
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                  <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                    <button
                      onClick={() => handleEdit(member)}
                      className="text-pink-600 hover:text-pink-900 transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(member.uuid)}
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
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
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
                    No Rekening
                  </label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        accountNumber: e.target.value,
                      })
                    }
                    placeholder="Contoh: 1234567890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    📅 Tanggal Mulai Tabungan (Opsional)
                  </label>
                  <input
                    type="date"
                    value={formData.savingsStartDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        savingsStartDate: e.target.value,
                      })
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
    </div>
  );
};

export default Members;