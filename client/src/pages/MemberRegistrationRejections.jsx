import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/index.jsx";
import Pagination from "../components/Pagination.jsx";

const PAGE_SIZE = 20;

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
};

const summaryLabels = {
  ktp: "KTP",
  selfie: "Selfie + KTP",
  livenessLeft: "Liveness kiri",
  livenessRight: "Liveness kanan",
  signature: "Tanda tangan",
  bank: "Bank",
  accountNumber: "No. rekening",
  product: "Produk",
  ripl: "RIPL",
};

const MemberRegistrationRejections = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = async (page = 1, term = appliedSearch) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/admin/member-registration-rejections", {
        params: { page, limit: PAGE_SIZE, search: term || undefined },
      });
      if (!response.data?.success) throw new Error("Riwayat penolakan tidak tersedia");
      setRows(response.data.data || []);
      setPagination(response.data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Gagal memuat riwayat penolakan");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(pagination.page, appliedSearch);
    // Fetch only when the committed search or page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, appliedSearch]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setAppliedSearch(search.trim());
  };

  const handlePageChange = (page) => {
    setPagination((current) => ({ ...current, page }));
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <button
            type="button"
            onClick={() => navigate("/master/anggota")}
            className="text-sm text-pink-600 hover:text-pink-800 mb-2"
          >
            ← Kembali ke Anggota
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Riwayat Penolakan Pendaftaran</h1>
          <p className="text-sm text-gray-500 mt-1">Audit pengajuan student yang pernah ditolak. Riwayat tidak dapat diedit atau dihapus.</p>
        </div>
      </div>

      <form onSubmit={submitSearch} className="bg-white rounded-lg shadow-sm border border-pink-100 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari UUID atau nama siswa..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
        <button type="submit" className="px-5 py-2 rounded-lg bg-pink-600 text-white font-semibold hover:bg-pink-700">
          Cari
        </button>
      </form>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-pink-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Daftar Pengajuan Ditolak</h2>
          <span className="text-sm text-gray-500">Total: {pagination.total || 0}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Siswa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Alasan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Oleh</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Attempt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Kelengkapan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-sm text-gray-500">Memuat riwayat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-sm text-gray-500">Belum ada riwayat penolakan.</td></tr>
              ) : rows.map((row) => (
                <tr key={String(row._id)} className="hover:bg-pink-50/50 align-top">
                  <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(row.rejectedAt)}</td>
                  <td className="px-4 py-4 text-sm">
                    <button type="button" onClick={() => navigate(`/master/anggota/${row.memberUuid}`)} className="text-left text-pink-600 hover:text-pink-800 hover:underline">
                      <span className="block font-semibold">{row.memberName || "-"}</span>
                      <span className="block text-xs font-mono text-gray-500 mt-1">{row.memberUuid}</span>
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 max-w-xs whitespace-pre-wrap break-words">{row.reason}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">{row.rejectedByName || "-"}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">#{row.attempt || 1}</td>
                  <td className="px-4 py-4 min-w-[230px]">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(summaryLabels).map(([key, label]) => (
                        <span key={key} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${row.documentSummary?.[key] ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {row.documentSummary?.[key] ? "✓" : "✕"} {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm whitespace-nowrap">
                    <button type="button" onClick={() => navigate(`/master/anggota/${row.memberUuid}`)} className="text-blue-600 hover:text-blue-800 font-semibold">
                      Lihat detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={pagination.page || 1}
          totalPages={pagination.totalPages || 0}
          onPageChange={handlePageChange}
          itemsPerPage={PAGE_SIZE}
          totalItems={pagination.total || 0}
        />
      </div>
    </div>
  );
};

export default MemberRegistrationRejections;
