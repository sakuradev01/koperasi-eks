import { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "react-toastify";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TYPE_LABELS = {
  dana_darurat: { label: "Dana Darurat", color: "bg-red-100 text-red-800" },
  modal_usaha: { label: "Modal Usaha", color: "bg-blue-100 text-blue-800" },
};

const STATUS_META = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-800" },
  submitted: { label: "Diajukan", color: "bg-yellow-100 text-yellow-800" },
  reviewing: { label: "Direview", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Disetujui", color: "bg-green-100 text-green-800" },
  rejected: { label: "Ditolak", color: "bg-red-100 text-red-800" },
};

const DOCUMENT_TYPES = [
  "zairyu_card", "passport", "employment_contract", "salary_slip",
  "bank_book_jp", "bank_statement_jp", "bank_statement_id", "jp_certificate",
];

const DOCUMENT_LABELS = {
  zairyu_card: "Zairyu Ka-do",
  passport: "Paspor",
  employment_contract: "Kontrak Kerja",
  salary_slip: "Slip Gaji",
  bank_book_jp: "Buku Tabungan (JP)",
  bank_statement_jp: "Mutasi Rekening (JP)",
  bank_statement_id: "Mutasi Rekening (ID)",
  jp_certificate: "Sertifikat Bahasa Jepang",
};

const DanaDarurat = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchApplications(); }, [statusFilter]);

  const fetchApplications = async () => {
    try {
      const token = localStorage.getItem("token");
      const url = `${API_URL}/api/admin/dana-darurat${statusFilter ? `?status=${statusFilter}` : ""}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) setApplications(res.data.data.applications || []);
    } catch (err) { toast.error("Gagal memuat data"); }
    finally { setLoading(false); }
  };

  const openDetail = async (id) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/api/admin/dana-darurat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) { setSelected(res.data.data); setShowDetail(true); }
    } catch { toast.error("Gagal memuat detail"); }
  };

  const updateStatus = async (id, status) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.patch(`${API_URL}/api/admin/dana-darurat/${id}/status`,
        { status }, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (res.data.success) { toast.success(res.data.message); setShowDetail(false); fetchApplications(); }
    } catch { toast.error("Gagal update status"); }
  };

  const handleUpload = async () => {
    if (!uploadType) { toast.error("Pilih tipe dokumen"); return; }
    if (!uploadFile) { toast.error("Pilih file"); return; }
    if (!selected?._id) return;

    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("applicationId", selected._id);
      fd.append("documentType", uploadType);
      fd.append("file", uploadFile);

      await axios.post(`${API_URL}/api/admin/dana-darurat/upload`, fd, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
      });
      toast.success("Dokumen berhasil diupload");
      setUploadFile(null);
      setUploadType("");
      // Reset file input
      const fileInput = document.getElementById("ddUploadFile");
      if (fileInput) fileInput.value = "";
      // Refresh detail
      const res = await axios.get(`${API_URL}/api/admin/dana-darurat/${selected._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) setSelected(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Gagal upload dokumen");
    } finally { setUploading(false); }
  };

  const formatCurrency = (v) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v || 0);
  const formatDate = (v) => v ? format(new Date(v), "dd MMM yyyy", { locale: id }) : "-";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">💸 Pengajuan Dana Darurat</h1>

      <div className="mb-4 flex gap-2">
        {["", "submitted", "reviewing", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm ${statusFilter === s ? "bg-slate-900 text-white" : "bg-gray-100"}`}>
            {s ? (STATUS_META[s]?.label || s) : "Semua"}
          </button>
        ))}
      </div>

      {loading ? <p>Loading...</p> : applications.length === 0 ? <p className="text-gray-500">Belum ada pengajuan</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Anggota</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tipe</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Nominal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {applications.map((app, i) => (
                <tr key={app._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{app.memberId?.name || "-"}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${TYPE_LABELS[app.loanDetails?.type]?.color || "bg-gray-100"}`}>
                      {TYPE_LABELS[app.loanDetails?.type]?.label || app.loanDetails?.type || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(app.loanDetails?.amount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_META[app.status]?.color || "bg-gray-100"}`}>
                      {STATUS_META[app.status]?.label || app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{formatDate(app.submissionDate)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openDetail(app._id)} className="text-blue-600 hover:underline text-sm">Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDetail && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">Detail Pengajuan #{selected.applicationNumber}</h2>
              <button onClick={() => setShowDetail(false)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>

            <div className="space-y-4 text-sm">
              <Section title="📋 Data Pribadi">
                <Row label="Nama" value={selected.personal?.fullName} />
                <Row label="Telepon (ID)" value={selected.personal?.phoneIndonesia} />
                <Row label="Telepon (JP)" value={selected.personal?.phoneJapan} />
                <Row label="Email" value={selected.personal?.email} />
                <Row label="Status" value={selected.personal?.maritalStatus?.replace(/_/g, " ")} />
                <Row label="Tanggungan" value={selected.personal?.dependents} />
                <Row label="Di Jepang sejak" value={formatDate(selected.personal?.sinceJapan)} />
              </Section>

              <Section title="💼 Data Pekerjaan">
                <Row label="Program" value={selected.employment?.program} />
                <Row label="Bidang" value={selected.employment?.field} />
                <Row label="Kontrak" value={`${formatDate(selected.employment?.contractStart)} - ${formatDate(selected.employment?.contractEnd)}`} />
                <Row label="Rencana pindah" value={selected.employment?.planToMove} />
              </Section>

              <Section title="💰 Data Pinjaman">
                <Row label="Tipe" value={TYPE_LABELS[selected.loanDetails?.type]?.label} />
                <Row label="Alasan" value={selected.loanDetails?.reason} />
                <Row label="Nominal" value={formatCurrency(selected.loanDetails?.amount)} />
              </Section>

              <Section title="🏢 Data TSK & Perusahaan">
                <Row label="Nama TSK" value={selected.company?.tskName} />
                <Row label="Kontak TSK" value={selected.company?.tskContact} />
                <Row label="Perusahaan" value={selected.company?.companyName} />
                <Row label="Alamat" value={selected.company?.companyAddress} />
                <Row label="Kontak" value={selected.company?.companyContact} />
              </Section>

              <Section title="📞 Kontak Darurat I (Teman)">
                <Row label="Nama" value={selected.emergencyContact1?.fullName} />
                <Row label="Telepon" value={selected.emergencyContact1?.phone} />
                <Row label="Alamat Jepang" value={selected.emergencyContact1?.addressJapan} />
              </Section>

              <Section title="👨‍👩‍👧 Kontak Darurat II (Keluarga)">
                <Row label="Nama" value={selected.emergencyContact2?.fullName} />
                <Row label="Telepon" value={selected.emergencyContact2?.phone} />
                <Row label="Hubungan" value={selected.emergencyContact2?.relationship} />
                <Row label="Alamat" value={selected.emergencyContact2?.address} />
              </Section>

              <Section title="💵 Data Penghasilan (¥)">
                <Row label="Gaji Pokok" value={selected.income?.baseSalary?.toLocaleString()} />
                <Row label="Tunjangan" value={selected.income?.allowances?.toLocaleString()} />
                <Row label="Bonus" value={selected.income?.bonus?.toLocaleString()} />
                <Row label="Pendapatan Lain" value={selected.income?.otherIncome?.toLocaleString()} />
              </Section>

              <Section title="📊 Data Pengeluaran (¥)">
                <Row label="Sewa Apato" value={selected.expenses?.apartmentRent?.toLocaleString()} />
                <Row label="Utilitas" value={selected.expenses?.utilities?.toLocaleString()} />
                <Row label="Biaya Hidup" value={selected.expenses?.livingCosts?.toLocaleString()} />
                <Row label="Total" value={
                  Object.values(selected.expenses || {}).reduce((a, b) => a + (Number(b) || 0), 0).toLocaleString()
                } />
              </Section>

              {selected.expenses?.hasOtherDebt === 'ya' && (
                <Section title="📝 Data Hutang">
                  <Row label="Pemilik" value={selected.debt?.who} />
                  <Row label="Kepada" value={selected.debt?.toWhom} />
                  <Row label="Sisa" value={formatCurrency(selected.debt?.remainingAmount)} />
                </Section>
              )}

              <Section title="📄 Dokumen">
                {selected.documents?.length > 0 ? selected.documents.map((doc, i) => (
                  <div key={i} className="mb-2">
                    <p className="font-medium text-gray-700 capitalize">{doc.type?.replace(/_/g, " ")}</p>
                    {doc.files?.map((f, j) => (
                      <a key={j} href={`${API_URL}${f.filePath}`} target="_blank" rel="noreferrer"
                        className="text-blue-600 hover:underline block ml-2 text-xs">
                        📎 {f.originalName || f.fileName}
                      </a>
                    ))}
                  </div>
                )) : <p className="text-gray-400">Tidak ada dokumen</p>}

                {/* Upload Section */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">📤 Upload Dokumen Baru</p>
                  <div className="flex flex-col gap-2">
                    <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs">
                      <option value="">Pilih tipe dokumen...</option>
                      {DOCUMENT_TYPES.map(t => (
                        <option key={t} value={t}>{DOCUMENT_LABELS[t] || t}</option>
                      ))}
                    </select>
                    <input id="ddUploadFile" type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-purple-50 file:text-purple-700" />
                    <button onClick={handleUpload} disabled={uploading || !uploadType || !uploadFile}
                      className="self-start px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-50">
                      {uploading ? "Mengupload..." : "📤 Upload"}
                    </button>
                  </div>
                </div>
              </Section>

              {selected.reviewNotes && (
                <Section title="📝 Catatan Review">
                  <p className="text-gray-700">{selected.reviewNotes}</p>
                </Section>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowDetail(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Tutup</button>
              {["submitted", "reviewing"].includes(selected.status) && (
                <>
                  <button onClick={() => updateStatus(selected._id, "reviewing")} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Mulai Review</button>
                  <button onClick={() => updateStatus(selected._id, "approved")} className="px-4 py-2 bg-green-600 text-white rounded-lg">✅ Setujui</button>
                  <button onClick={() => updateStatus(selected._id, "rejected")} className="px-4 py-2 bg-red-600 text-white rounded-lg">❌ Tolak</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="border rounded-lg p-3">
    <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
    {children}
  </div>
);

const Row = ({ label, value }) => value ? (
  <div className="flex justify-between py-1 border-b border-gray-100 last:border-0">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-right max-w-[60%]">{value}</span>
  </div>
) : null;

export default DanaDarurat;
