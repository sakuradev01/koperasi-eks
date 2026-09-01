const SAVINGS_COA_FIELDS = new Set([
  "accountId",
  "account_id",
  "categoryId",
  "category_id",
  "categoryType",
  "category_type",
]);

const CATEGORY_TYPES = new Set(["master", "submenu", "account"]);

const isObjectId = (value) =>
  typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value.trim());

const valueFromAliases = (body, camelKey, snakeKey) =>
  body?.[camelKey] !== undefined ? body[camelKey] : body?.[snakeKey];

/**
 * Validate and normalize the deliberately narrow payload accepted by a
 * Simpanan COA-only editor.  This helper is pure so the whitelist is covered
 * independently from the Mongo/Express controller.
 */
export function validateSavingsCoaOnlyPayload(body = {}, { isSplit = false } = {}) {
  const disallowedFields = Object.keys(body).filter(
    (field) => !SAVINGS_COA_FIELDS.has(field),
  );

  if (disallowedFields.length > 0) {
    return {
      valid: false,
      disallowedFields,
      errors: [
        "Akses ini hanya boleh mengubah Record Account dan Category",
      ],
    };
  }

  const accountId = valueFromAliases(body, "accountId", "account_id");
  const categoryId = valueFromAliases(body, "categoryId", "category_id");
  const categoryType = valueFromAliases(body, "categoryType", "category_type");
  const errors = [];

  if (!isObjectId(accountId)) {
    errors.push("Record Account wajib dipilih");
  }

  // Split transactions keep their existing split rows.  Category is not a
  // top-level field for those rows, so only the account is required here.
  if (!isSplit) {
    if (!isObjectId(categoryId)) errors.push("Category wajib dipilih");
    if (!CATEGORY_TYPES.has(String(categoryType || "").trim().toLowerCase())) {
      errors.push("Category type tidak valid");
    }
  }

  const payload = { accountId: accountId?.trim() };
  if (categoryId !== undefined) payload.categoryId = categoryId?.trim();
  if (categoryType !== undefined) {
    payload.categoryType = String(categoryType || "").trim().toLowerCase();
  }

  return {
    valid: errors.length === 0,
    payload,
    disallowedFields: [],
    errors,
  };
}

export { SAVINGS_COA_FIELDS };
