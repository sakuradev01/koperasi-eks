const formatBalance = (value) => Number(value || 0).toLocaleString("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Build transaction account choices from the hierarchical COA response.
 * Master and submenu rows are labels only; only individual COA accounts are selectable.
 */
export function buildTransactionAccountOptions(categories = []) {
  const groupsByName = new Map();
  let currentMaster = "";
  let currentSubmenu = "";

  categories.forEach((category) => {
    if (category.type === "master") {
      currentMaster = category.name || "COA";
      currentSubmenu = "";
      return;
    }

    if (category.type === "submenu") {
      currentSubmenu = category.name || "Akun lainnya";
      return;
    }

    if (category.type !== "account" || !category.id) return;

    const masterName = category.masterName || currentMaster || "COA";
    const submenuName = category.submenuName || currentSubmenu || "Akun lainnya";
    const groupName = `${masterName} · ${submenuName}`;
    const group = groupsByName.get(groupName) || [];
    const currency = category.currency || "Rp";
    const accountName = category.name || "Akun tanpa nama";
    const accountCode = category.code ? ` (${category.code})` : "";

    group.push({
      value: String(category.id),
      label: `${accountName}${accountCode}`,
      sublabel: `${currency} ${formatBalance(category.balance)}`,
      currency,
      balance: Number(category.balance) || 0,
    });
    groupsByName.set(groupName, group);
  });

  return [...groupsByName.entries()].map(([label, items]) => ({ label, items }));
}
