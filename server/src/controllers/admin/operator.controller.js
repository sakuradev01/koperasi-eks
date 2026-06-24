import { User } from "../../models/user.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

// Default permissions untuk operator baru
const DEFAULT_OPERATOR_PERMISSIONS = {
  dashboard: { view: true, create: false, edit: false, delete: false },
  simpanan: { view: false, create: false, edit: false, delete: false },
  donasi: { view: false, create: false, edit: false, delete: false },
  manajemenPinjaman: { view: false, create: false, edit: false, delete: false },
  danaDarurat: { view: false, create: false, edit: false, delete: false },
  laporan: { view: false, create: false, edit: false, delete: false },
  invoice: { view: false, create: false, edit: false, delete: false },
  anggota: { view: false, create: false, edit: false, delete: false },
  produkSimpanan: { view: false, create: false, edit: false, delete: false },
  produkPinjaman: { view: false, create: false, edit: false, delete: false },
  expenses: { view: false, create: false, edit: false, delete: false },
  akuntansi: { view: false, create: false, edit: false, delete: false },
  reports: { view: false, create: false, edit: false, delete: false },
  pengaturan: { view: false, create: false, edit: false, delete: false },
};

// GET /api/operators — List semua operator
export const getAllOperators = asyncHandler(async (req, res) => {
  const operators = await User.find(
    { role: "operator" },
    { password: 0 }
  ).sort({ createdAt: -1 });

  res.status(200).json(
    new ApiResponse(200, operators, "Data operator berhasil diambil")
  );
});

// POST /api/operators — Create operator baru
export const createOperator = asyncHandler(async (req, res) => {
  const { username, password, name, permissions } = req.body;

  // Validasi input
  if (!username || !password || !name) {
    throw new ApiError(400, "Username, password, dan nama wajib diisi");
  }

  if (password.length < 6) {
    throw new ApiError(400, "Password minimal 6 karakter");
  }

  // Cek duplikat username
  const existing = await User.findOne({ username });
  if (existing) {
    throw new ApiError(400, "Username sudah digunakan");
  }

  // Merge permissions dengan default
  const mergedPermissions = { ...DEFAULT_OPERATOR_PERMISSIONS };
  if (permissions && typeof permissions === "object") {
    for (const [key, val] of Object.entries(permissions)) {
      if (mergedPermissions[key]) {
        mergedPermissions[key] = { ...mergedPermissions[key], ...val };
      }
    }
  }

  const operator = await User.create({
    username,
    password,
    name,
    role: "operator",
    permissions: mergedPermissions,
    isActive: true,
  });

  res.status(201).json(
    new ApiResponse(201, operator.toJSON(), "Operator berhasil dibuat")
  );
});

// PUT /api/operators/:id — Update operator
export const updateOperator = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, password, name, permissions, isActive } = req.body;

  const operator = await User.findById(id);
  if (!operator || operator.role !== "operator") {
    throw new ApiError(404, "Operator tidak ditemukan");
  }

  // Update username — cek duplikat
  if (username && username !== operator.username) {
    const existing = await User.findOne({ username });
    if (existing) {
      throw new ApiError(400, "Username sudah digunakan");
    }
    operator.username = username;
  }

  if (name) operator.name = name;
  if (typeof isActive === "boolean") operator.isActive = isActive;

  // Update password
  if (password) {
    if (password.length < 6) {
      throw new ApiError(400, "Password minimal 6 karakter");
    }
    operator.password = password;
  }

  // Update permissions
  if (permissions && typeof permissions === "object") {
    const currentPerms = operator.permissions || {};
    for (const [key, val] of Object.entries(permissions)) {
      if (currentPerms[key]) {
        currentPerms[key] = { ...currentPerms[key], ...val };
      } else {
        // Jika feature baru, merge dari default
        const defaultPerm = DEFAULT_OPERATOR_PERMISSIONS[key];
        currentPerms[key] = defaultPerm
          ? { ...defaultPerm, ...val }
          : { view: false, create: false, edit: false, delete: false, ...val };
      }
    }
    operator.permissions = currentPerms;
  }

  await operator.save();

  res.status(200).json(
    new ApiResponse(200, operator.toJSON(), "Operator berhasil diupdate")
  );
});

// DELETE /api/operators/:id — Delete operator
export const deleteOperator = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const operator = await User.findOneAndDelete({ _id: id, role: "operator" });
  if (!operator) {
    throw new ApiError(404, "Operator tidak ditemukan");
  }

  res.status(200).json(
    new ApiResponse(200, null, "Operator berhasil dihapus")
  );
});

// PATCH /api/operators/:id/toggle-status — Aktif/nonaktifkan operator
export const toggleOperatorStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const operator = await User.findById(id);
  if (!operator || operator.role !== "operator") {
    throw new ApiError(404, "Operator tidak ditemukan");
  }

  operator.isActive = !operator.isActive;
  await operator.save();

  res.status(200).json(
    new ApiResponse(200, operator.toJSON(), `Operator berhasil ${operator.isActive ? "diaktifkan" : "dinonaktifkan"}`)
  );
});
