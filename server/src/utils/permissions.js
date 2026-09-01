/**
 * Shared permission helpers.
 *
 * The admin UI stores feature permissions as a small CRUD object.  The
 * `simpanan.editCoaOnly` flag is intentionally stricter than normal edit
 * access: it grants read/edit access to the savings list while denying every
 * action other than changing the accounting account/category mapping.
 */

const COA_ONLY_ACTIONS = new Set(["view", "edit"]);

export function isSavingsCoaOnlyEditor(user) {
  return (
    user?.role !== "admin" &&
    user?.permissions?.simpanan?.editCoaOnly === true
  );
}

export function canAccessFeature(user, feature, action = "view") {
  if (user?.role === "admin") return true;

  const permission = user?.permissions?.[feature];
  if (!permission || typeof permission !== "object") return false;

  if (feature === "simpanan" && permission.editCoaOnly === true) {
    return COA_ONLY_ACTIONS.has(action);
  }

  return permission[action] === true;
}

export function normalizeSavingsPermission(permission = {}) {
  const normalized = {
    view: permission?.view === true,
    edit: permission?.edit === true,
    create: permission?.create === true,
    delete: permission?.delete === true,
    editCoaOnly: permission?.editCoaOnly === true,
  };

  if (normalized.editCoaOnly) {
    return {
      editCoaOnly: true,
      view: true,
      edit: true,
      create: false,
      delete: false,
    };
  }

  return normalized;
}
