import { useState } from "react";
import api from "../api/index.jsx";

const Settings = () => {
  const [confirmCode, setConfirmCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleClearAll = async () => {
    if (confirmCode !== "HAPUS-SEMUA-DATA") {
      alert("Ketik 'HAPUS-SEMUA-DATA' untuk konfirmasi");
      return;
    }

    if (!window.confirm("PERINGATAN: Semua data member, tabungan, pinjaman, dan file akan DIHAPUS PERMANEN. Lanjutkan?")) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/api/admin/system/clear-all", { confirmCode });
      if (response.data.success) {
        setResult(response.data.data);
        setConfirmCode("");
        alert("Semua data berhasil dihapus!");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Gagal menghapus data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">⚙️ Pengaturan Sistem</h1>

      {/* Danger Zone */}
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
        <h2 className="text-xl font-bold text-red-700 mb-4">⚠️ Danger Zone</h2>
        
        <div className="bg-white rounded-lg p-4 border border-red-200">
          <h3 className="font-semibold text-red-800 mb-2">Hapus Semua Data</h3>
          <p className="text-sm text-gray-600 mb-4">
            Menghapus SEMUA data: member, tabungan, pinjaman, dan file yang diupload.
            <br />
            <strong className="text-red-600">Aksi ini tidak dapat dibatalkan!</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Ketik: HAPUS-SEMUA-DATA"
              className="flex-1 px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={handleClearAll}
              disabled={loading || confirmCode !== "HAPUS-SEMUA-DATA"}
              className={`px-6 py-2 rounded-lg font-semibold text-white transition-all ${
                confirmCode === "HAPUS-SEMUA-DATA"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {loading ? "Menghapus..." : "🗑️ Hapus Semua"}
            </button>
          </div>

          {result && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="font-semibold text-green-800 mb-2">✅ Data berhasil dihapus:</p>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Member: {result.deletedMembers}</li>
                <li>• User: {result.deletedUsers}</li>
                <li>• Tabungan: {result.deletedSavings}</li>
                <li>• Pinjaman: {result.deletedLoans}</li>
                <li>• Pembayaran Pinjaman: {result.deletedLoanPayments}</li>
                <li>• File: {result.deletedFiles}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
