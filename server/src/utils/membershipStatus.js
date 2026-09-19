export const MEMBERSHIP_STATUSES = Object.freeze(["draft", "active", "inactive"]);
export const MEMBERSHIP_CLASSIFICATIONS = Object.freeze(["legacy", ...MEMBERSHIP_STATUSES]);

export const normalizeMembershipStatus = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return MEMBERSHIP_STATUSES.includes(normalized) ? normalized : "";
};

export const normalizeMembershipClassification = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "lama") return "legacy";
  return MEMBERSHIP_CLASSIFICATIONS.includes(normalized) ? normalized : "";
};

// Existing members predate this field. Treat an empty value as active so the
// new gate cannot silently stop a legacy member from paying before Finance
// has reviewed their status in the admin panel.
export const getEffectiveMembershipStatus = (member = {}) =>
  normalizeMembershipStatus(member.membershipStatus) || "active";

// Read-only admin classification for old records whose new field is empty.
// `legacy` is intentionally not persisted in the schema enum.
export const getMembershipClassification = (member = {}) =>
  normalizeMembershipStatus(member.membershipStatus) || "legacy";

export const isMembershipActive = (member = {}) =>
  getEffectiveMembershipStatus(member) === "active";

export const getMembershipStatusMessage = (status) => {
  if (status === "draft") {
    return "Tabungan Anda belum dibuka oleh tim Finance. Silakan tunggu sampai status keanggotaan diaktifkan.";
  }
  if (status === "inactive") {
    return "Tabungan Anda sudah ditutup. Pembayaran baru tidak dapat dilakukan.";
  }
  return "";
};
