import { useEffect, useState } from "react";
import api from "../api/index.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { toast } from "react-toastify";

const FEATURE_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "simpanan", label: "Simpanan" },
  { key: "donasi", label: "Donasi" },
  { key: "manajemenPinjaman", label: "Manajemen Pinjaman" },
  { key: "danaDarurat", label: "Dana Darurat" },
  { key: "laporan", label: "Laporan" },
  { key: "invoice", label: "Invoice" },
  { key: "anggota", label: "Anggota (Master Data)" },
  { key: "produkSimpanan", label: "Produk Simpanan (Master Data)" },
  { key: "produkPinjaman", label: "Produk Pinjaman (Master Data)" },
  { key: "expenses", label: "Expenses" },
  { key: "akuntansi", label: "Akuntansi" },
  { key: "reports", label: "Reports" },
  { key: "pengaturan", label: "Pengaturan" },
];

const DEFAULT_CRUD = { view: false, create: false, edit: false, delete: false };

const emptyPermissions = () => {
  const perms = {};
  FEATURE_PERMISSIONS.forEach((f) => {
    perms[f.key] = { ...DEFAULT_CRUD };
  });
  return perms;
};

const Operators = () => {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    permissions: emptyPermissions(),
  });

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  const fetchOperators = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/operators");
      if (res.data.success) setOperators(res.data.data);
    } catch (err) {
      toast.error("Gagal mengambil data operator");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
  }, []);

  const openCreate = () => {
    setEditingOperator(null);
    setFormData({
      username: "",
      password: "",
      name: "",
      permissions: emptyPermissions(),
    });
    setShowModal(true);
  };

  const openEdit = (op) => {
    setEditingOperator(op);
    const perms = op.permissions || {};
    const filled = emptyPermissions();
    FEATURE_PERMISSIONS.forEach((f) => {
      if (perms[f.key]) {
        filled[f.key] = { ...DEFAULT_CRUD, ...perms[f.key] };
      }
    });
    setFormData({
      username: op.username,
      password: "",
      name: op.name,
      permissions: filled,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const togglePermission = (featureKey, action) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [featureKey]: {
          ...prev.permissions[featureKey],
          [action]: !prev.permissions[featureKey]?.[action],
        },
      },
    }));
  };

  const setAllPermissions = (value) => {
    const perms = {};
    FEATURE_PERMISSIONS.forEach((f) => {
      perms[f.key] = { view: value, create: value, edit: value, delete: value };
    });
    setFormData((prev) => ({ ...prev, permissions: perms }));
  };

  const validate = () => {
    if (!formData.username.trim()) {
      toast.error("Username wajib diisi");
      return false;
    }
    if (!editingOperator && !formData.password) {
      toast.error("Password wajib diisi");
      return false;
    }
    if (formData.password && formData.password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return false;
    }
    if (!formData.name.trim()) {
      toast.error("Nama wajib diisi");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      if (editingOperator) {
        const payload = {
          name: formData.name,
          username: formData.username,
          permissions: formData.permissions,
        };
        if (formData.password) payload.password = formData.password;

        const res = await api.put(`/api/admin/operators/${editingOperator._id}`, payload);
        if (res.data.success) {
          toast.success("Operator berhasil diupdate");
          setShowModal(false);
          fetchOperators();
        }
      } else {
        const res = await api.post("/api/admin/operators", {
          username: formData.username,
          password: formData.password,
          name: formData.name,
          permissions: formData.permissions,
        });
        if (res.data.success) {
          toast.success("Operator berhasil dibuat");
          setShowModal(false);
          fetchOperators();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Gagal menyimpan operator";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (op) => {
    setConfirmDialog({
      isOpen: true,
      title: "Hapus Operator",
      message: `Yakin ingin menghapus operator "${op.name}" (${op.username})?`,
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await api.delete(`/api/admin/operators/${op._id}`);
          if (res.data.success) {
            toast.success("Operator berhasil dihapus");
            fetchOperators();
          }
        } catch (err) {
          toast.error("Gagal menghapus operator");
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const toggleStatus = async (op) => {
    try {
      const res = await api.patch(`/api/admin/operators/${op._id}/toggle-status`);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchOperators();
      }
    } catch (err) {
      toast.error("Gagal mengubah status operator");
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operator</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola akun operator</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 rounded-lg hover:from-pink-600 hover:to-rose-600 transition-colors"
        >
          + Tambah Operator
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
        </div>
      ) : operators.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Belum ada operator. Klik "Tambah Operator" untuk membuat.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Akses Fitur</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {operators.map((op) => {
                const perms = op.permissions || {};
                const activeFeatures = FEATURE_PERMISSIONS.filter((f) => perms[f.key]?.view).length;

                return (
                  <tr key={op._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{op.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{op.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleStatus(op)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          op.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {op.isActive ? "Aktif" : "Nonaktif"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {activeFeatures} / {FEATURE_PERMISSIONS.length} fitur
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => openEdit(op)}
                        className="text-pink-600 hover:text-pink-800 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => confirmDelete(op)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingOperator ? "Edit Operator" : "Tambah Operator Baru"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Nama operator"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Username login"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingOperator && <span className="text-gray-400">(kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder={editingOperator ? "Biarkan kosong jika tidak diubah" : "Minimal 6 karakter"}
                />
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Izin Akses Fitur</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAllPermissions(true)}
                      className="text-xs px-3 py-1 bg-pink-100 text-pink-700 rounded hover:bg-pink-200"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllPermissions(false)}
                      className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      Hapus Semua
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                  {FEATURE_PERMISSIONS.map((feature) => {
                    const perm = formData.permissions[feature.key] || DEFAULT_CRUD;
                    return (
                      <div key={feature.key} className="p-3 flex items-center justify-between hover:bg-gray-50">
                        <span className="text-sm font-medium text-gray-700">{feature.label}</span>
                        <div className="flex gap-3">
                          {["view", "create", "edit", "delete"].map((action) => (
                            <label key={action} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={perm[action]}
                                onChange={() => togglePermission(feature.key, action)}
                                className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                              />
                              <span className="text-xs text-gray-500 capitalize">{action}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : editingOperator ? "Simpan Perubahan" : "Buat Operator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default Operators;
