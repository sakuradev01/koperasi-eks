import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import PropTypes from "prop-types";
import api from "../../api/index.jsx";

const SavingsModal = ({ isOpen, onClose, onSuccess, savingsData }) => {
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastPeriod, setLastPeriod] = useState(0);
  const [upgradeInfo, setUpgradeInfo] = useState(null);
  const [expectedAmount, setExpectedAmount] = useState(0);
  const originalSelectionRef = useRef({ memberId: "", productId: "" });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      type: "Setoran",
      status: "Pending",
    },
  });

  const type = watch("type");
  const memberId = watch("memberId");
  const productId = watch("productId");

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchProducts();
      if (savingsData) {
        reset({
          ...savingsData,
          memberId: savingsData.memberId?._id || savingsData.memberId,
          productId: savingsData.productId?._id || savingsData.productId,
          savingsDate: savingsData.savingsDate
            ? new Date(savingsData.savingsDate).toISOString().split("T")[0]
            : "",
        });
        originalSelectionRef.current = {
          memberId: savingsData.memberId?._id || savingsData.memberId,
          productId: savingsData.productId?._id || savingsData.productId,
        };
      } else {
        reset({
          type: "Setoran",
          status: "Pending",
          savingsDate: new Date().toISOString().split("T")[0],
        });
        originalSelectionRef.current = { memberId: "", productId: "" };
      }
    }
  }, [isOpen, savingsData, reset]);

  // Auto-fill product when member is selected
  useEffect(() => {
    console.log("🔍 Auto-fill effect triggered");
    console.log("🔍 memberId:", memberId);
    console.log("🔍 savingsData:", savingsData);
    console.log("🔍 members length:", members.length);
    
    if (memberId && !savingsData) {
      // Only auto-fill when creating new savings (not editing)
      const selectedMember = members.find(member => member._id === memberId);
      console.log("🔍 Found selected member:", selectedMember);
      console.log("🔍 Member productId:", selectedMember?.productId);
      
      if (selectedMember && selectedMember.productId) {
        console.log("✅ Auto-filling productId:", selectedMember.productId);
        setValue("productId", selectedMember.productId);
      } else {
        console.log("❌ No auto-fill: member not found or no productId");
      }
    }
  }, [memberId, members, savingsData, setValue]);

  useEffect(() => {
    if (memberId && productId) {
      checkLastInstallmentPeriod();
    } else {
      // Reset when either field is empty
      setLastPeriod(0);
      setValue("installmentPeriod", 1);
    }
  }, [memberId, productId]);

  const fetchMembers = async () => {
    try {
      const response = await api.get("/api/members");
      const membersData = response.data.data || response.data.members || [];
      console.log("🔍 All members data:", membersData);
      // Check specifically for Puspita
      const puspita = membersData.find(m => m.uuid === "JPSB37142");
      console.log("🔍 Puspita data:", puspita);
      setMembers(membersData);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get("/api/products");
      setProducts(response.data.data || response.data.products || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const checkLastInstallmentPeriod = async () => {
    try {
      const response = await api.get(`/api/admin/savings/check-period/${memberId}/${productId}`);
      const data = response.data.data;
      const last = data.lastPeriod || 0;
      setLastPeriod(last);

      // Handle upgrade info
      if (data.hasUpgrade && data.upgradeInfo) {
        setUpgradeInfo(data.upgradeInfo);
        setExpectedAmount(data.expectedAmount);
        
        // Auto-fill amount and description for upgraded members
        if (!savingsData) {
          setValue("amount", data.expectedAmount);
          const nextPeriod = data.nextPeriod || (last + 1);
          setValue("description", `Setoran periode ${nextPeriod} (Upgrade: ${data.upgradeInfo.newMonthlyDeposit} + Kompensasi: ${data.upgradeInfo.compensationPerMonth})`);
        }
      } else {
        setUpgradeInfo(null);
        setExpectedAmount(data.depositAmount || 0);
      }

      // Auto-set next period, but don't override when editing with same original selection
      const nextPeriod = data.nextPeriod || (last + 1);
      const isOriginal =
        originalSelectionRef.current.memberId === memberId &&
        originalSelectionRef.current.productId === productId;

      if (!savingsData || !isOriginal) {
        setValue("installmentPeriod", nextPeriod);
      }
    } catch (error) {
      console.error("Error checking last period:", error);
      setLastPeriod(0);
      setUpgradeInfo(null);
      setExpectedAmount(0);
      const isOriginal =
        originalSelectionRef.current.memberId === memberId &&
        originalSelectionRef.current.productId === productId;

      if (!savingsData || !isOriginal) {
        setValue("installmentPeriod", 1);
      }
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const formData = new FormData();

      // Append all form data
      Object.keys(data).forEach((key) => {
        if (key === "proofFile" && data[key] && data[key][0]) {
          formData.append(key, data[key][0]);
        } else if (data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key]);
        }
      });

      if (savingsData) {
        await api.put(`/api/savings/${savingsData._id}`, formData);
      } else {
        await api.post("/api/savings", formData);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving savings:", error);
      alert(error.response?.data?.message || "Gagal menyimpan data");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {savingsData ? "Edit Data Simpanan" : "Tambah Data Simpanan"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipe Transaksi
              </label>
              <select
                {...register("type", {
                  required: "Tipe transaksi wajib dipilih",
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Setoran">Setoran</option>
                <option value="Penarikan">Penarikan</option>
              </select>
              {errors.type && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.type.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                {...register("status", { required: "Status wajib dipilih" })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
              {errors.status && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.status.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anggota
            </label>
            <select
              {...register("memberId", { required: "Anggota wajib dipilih" })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Anggota</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.uuid} - {member.name} {member.product ? `(${member.product.title})` : '(Belum pilih produk)'}
                </option>
              ))}
            </select>
            {errors.memberId && (
              <p className="text-red-500 text-sm mt-1">
                {errors.memberId.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Produk Simpanan
            </label>
            <select
              {...register("productId", { required: "Produk wajib dipilih" })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Pilih Produk</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.title} - Min: Rp {product.depositAmount.toLocaleString('id-ID')}
                </option>
              ))}
            </select>
            {memberId && !savingsData && (
              <p className="text-sm text-blue-600 mt-1">
                💡 Produk otomatis dipilih berdasarkan anggota yang dipilih
              </p>
            )}
            {errors.productId && (
              <p className="text-red-500 text-sm mt-1">
                {errors.productId.message}
              </p>
            )}
          </div>

          {/* Upgrade Info Alert */}
          {upgradeInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">✨</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800">Anggota Sudah Upgrade Produk</p>
                  <div className="mt-2 text-xs text-blue-700 space-y-1">
                    <p>Produk Lama: Rp {upgradeInfo.oldMonthlyDeposit?.toLocaleString('id-ID')}/bulan</p>
                    <p>Produk Baru: Rp {upgradeInfo.newMonthlyDeposit?.toLocaleString('id-ID')}/bulan</p>
                    <p>Kompensasi: Rp {upgradeInfo.compensationPerMonth?.toLocaleString('id-ID')}/bulan</p>
                    <p className="font-semibold text-blue-900">
                      Total Setoran: Rp {upgradeInfo.newPaymentWithCompensation?.toLocaleString('id-ID')}/bulan
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Jumlah {type === "Setoran" ? "Setoran" : "Penarikan"}
              </label>
              <input
                type="number"
                {...register("amount", {
                  required: "Jumlah wajib diisi",
                  min: { value: 1, message: "Jumlah minimal 1" },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Masukkan jumlah"
              />
              {expectedAmount > 0 && !savingsData && (
                <p className="text-sm text-blue-600 mt-1">
                  💡 Jumlah yang diharapkan: Rp {expectedAmount.toLocaleString('id-ID')}
                </p>
              )}
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.amount.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tanggal Transaksi
              </label>
              <input
                type="date"
                {...register("savingsDate", {
                  required: "Tanggal wajib diisi",
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.savingsDate && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.savingsDate.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Periode Cicilan (bulan)
            </label>
            <input
              type="number"
              {...register("installmentPeriod", {
                required: "Periode cicilan wajib diisi",
                min: { value: 1, message: "Minimal 1 bulan" },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan periode cicilan"
            />
            {lastPeriod > 0 && (
              <p className="text-sm text-blue-600 mt-1">
                💡 Periode terakhir: {lastPeriod}, otomatis diisi periode berikutnya ({lastPeriod + 1})
              </p>
            )}
            {lastPeriod === 0 && memberId && productId && (
              <p className="text-sm text-green-600 mt-1">
                ✨ Ini adalah periode pertama untuk anggota dan produk ini
              </p>
            )}
            {errors.installmentPeriod && (
              <p className="text-red-500 text-sm mt-1">
                {errors.installmentPeriod.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deskripsi
            </label>
            <textarea
              {...register("description")}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan deskripsi (opsional)"
            />
            {errors.description && (
              <p className="text-red-500 text-sm mt-1">
                {errors.description.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bukti Transaksi
            </label>
            <input
              type="file"
              {...register("proofFile")}
              accept="image/*,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {savingsData?.proofFile && (
              <p className="text-sm text-gray-500 mt-1">
                File saat ini: {savingsData.proofFile}
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

SavingsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
  savingsData: PropTypes.shape({
    _id: PropTypes.string,
    memberId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        _id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string,
      }),
    ]),
    productId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        _id: PropTypes.string,
        title: PropTypes.string,
        depositAmount: PropTypes.number,
      }),
    ]),
    savingsDate: PropTypes.string,
    proofFile: PropTypes.string,
  }),
};

export default SavingsModal;
