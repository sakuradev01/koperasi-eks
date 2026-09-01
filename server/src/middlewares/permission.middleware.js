import {
  canAccessFeature,
  isSavingsCoaOnlyEditor,
} from "../utils/permissions.js";

const restrictedActionMessage =
  "Akses Simpanan ini hanya boleh mengubah Record Account dan Category";

/**
 * Authorize a feature action after verifyToken has populated req.user.
 * Admin tetap memiliki akses penuh.  Operator dengan mode editCoaOnly hanya
 * boleh membaca daftar dan mengubah mapping COA Simpanan.
 */
export const requireFeaturePermission = (
  feature,
  action = "view",
  { allowSavingsCoaOnly = true } = {},
) => (req, res, next) => {
  const isRestrictedSavingsEditor =
    feature === "simpanan" && isSavingsCoaOnlyEditor(req.user);

  if (isRestrictedSavingsEditor && !allowSavingsCoaOnly) {
    return res.status(403).json({
      success: false,
      message: restrictedActionMessage,
    });
  }

  if (!canAccessFeature(req.user, feature, action)) {
    return res.status(403).json({
      success: false,
      message: `Akses ditolak untuk fitur ${feature} (${action})`,
    });
  }

  req.savingsEditCoaOnly = isRestrictedSavingsEditor && action === "edit";
  return next();
};

export { restrictedActionMessage };
