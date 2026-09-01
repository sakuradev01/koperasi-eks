import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../api/index.jsx";

const Settings = () => {
  const { userData: user } = useSelector((state) => state.auth);
  const [confirmCode, setConfirmCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [operators, setOperators] = useState([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [updatingOperatorId, setUpdatingOperatorId] = useState(null);

  const isAdmin = user?.role === "admin";

  const fetchOperators = async () => {
    if (!isAdmin) return;

    try {
      setOperatorsLoading(true);
      const response = await api.get("/api/admin/operators");
      if (response.data.success) {
        setOperators(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (error) {
      alert(error.response?.data?.message || "Gagal memuat daftar operator");
    } finally {
      setOperatorsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
    // The admin identity is restored from persisted auth state after the
    // first render, so re-run when the role becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const updateSavingsCoaAccess = async (operator, enabled) => {
    setUpdatingOperatorId(operator._id);
    try {
      const response = await api.put(`/api/admin/operators/${operator._id}`, {
        permissions: {
          simpanan: {
            view: enabled,
            edit: enabled,
            create: false,
            delete: false,
            editCoaOnly: enabled,
          },
        },
      });

      if (response.data.success) {
        setOperators((current) =>
          current.map((item) =>
            item._id === operator._id
              ? { ...item, permissions: response.data.data.permissions }
              : item,
          ),
        );
        alert(
          enabled
            ? `Akses Simpanan (Edit COA saja) diberikan ke ${operator.name}`
            : `Akses Simpanan dicabut dari ${operator.name}`,
        );
      }
    } catch (error) {
      alert(error.response?.data?.message || "Gagal mengubah akses Simpanan");
    } finally {
      setUpdatingOperatorId(null);
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto mt-12 rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-semibold text-yellow-900">Akses Pengaturan terbatas</h1>
          <p className="mt-2 text-sm text-yellow-800">
            Halaman ini hanya dapat digunakan oleh admin.
          </p>
        </div>
      </div>
    );
  }

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

      {isAdmin && (
        <div className="bg-white border border-blue-200 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex flex-col gap-2 mb-4">
            <h2 className="text-xl font-bold text-blue-800">🔐 Akses Operator — Simpanan</h2>
            <p className="text-sm text-gray-600">
              Berikan akses khusus untuk membantu pembukuan data lama. Operator dengan akses ini
              hanya dapat membuka menu Simpanan dan mengedit <strong>Record Account</strong> serta
              <strong> Category</strong>. Tambah data, hapus, approve, dan reject tetap terkunci.
            </p>
          </div>

          {operatorsLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
            </div>
          ) : operators.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              Belum ada operator. Buat operator terlebih dahulu di menu Operator.
            </p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-blue-800 uppercase tracking-wider">
                      Operator
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-blue-800 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-blue-800 uppercase tracking-wider">
                      Akses Simpanan
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-800 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {operators.map((operator) => {
                    const enabled = operator.permissions?.simpanan?.editCoaOnly === true;
                    const updating = updatingOperatorId === operator._id;
                    return (
                      <tr key={operator._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {operator.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{operator.username}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              enabled
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {enabled ? "Edit COA saja" : "Tidak ada akses"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => updateSavingsCoaAccess(operator, !enabled)}
                            disabled={updating || !operator.isActive}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              enabled
                                ? "bg-gray-500 hover:bg-gray-600"
                                : "bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {updating ? "Menyimpan..." : enabled ? "Cabut Akses" : "Berikan Akses"}
                          </button>
                          {!operator.isActive && (
                            <p className="mt-1 text-xs text-red-500">Operator nonaktif</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
