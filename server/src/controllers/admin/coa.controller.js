import { CoaMaster } from "../../models/coaMaster.model.js";
import { CoaSubmenu } from "../../models/coaSubmenu.model.js";
import { CoaAccount } from "../../models/coaAccount.model.js";

const MASTER_TYPES = ["Assets", "Liabilities", "Income", "Expenses", "Equity"];

// Account code ranges per master type
const CODE_RANGES = {
  Assets: 1000,
  Liabilities: 2000,
  Equity: 3000,
  Income: 4000,
  Expenses: 5000,
};

const MASTER_TYPE_ALIASES = {
  assets: "Assets",
  liabilities: "Liabilities",
  "liabilities & credit cards": "Liabilities",
  equity: "Equity",
  income: "Income",
  expenses: "Expenses",
};

const SUBMENU_ORDER = {
  Assets: [
    "Cash and Bank",
    "Money in Transit",
    "Expected Payments from Customers",
    "Inventory",
    "Property, Plant, Equipment",
    "Depreciation and Amortization",
    "Vendor Prepayments and Vendor Credits",
    "Other Short-Term Asset",
    "Other Long-Term Asset",
  ],
  Liabilities: [
    "Credit Card",
    "Loan and Line of Credit",
    "Expected Payments to Vendors",
    "Sales Taxes",
    "Due For Payroll",
    "Due to You and Other Business Owners",
    "Customer Prepayments and Customer Credits",
    "Other Short-Term Liability",
    "Other Long-Term Liability",
  ],
  Income: [
    "Income",
    "Discount",
    "Other Income",
    "Uncategorized Income",
    "Gain On Foreign Exchange",
  ],
  Expenses: [
    "Operating Expense",
    "Cost of Goods Sold",
    "Payment Processing Fee",
    "Payroll Expense",
    "Uncategorized Expense",
    "Loss On Foreign Exchange",
  ],
  Equity: [
    "Business Owner Contribution and Drawing",
    "Retained Earnings: Profit",
  ],
};

function pickBodyField(body, keys) {
  for (const key of keys) {
    if (body?.[key] !== undefined && body?.[key] !== null) {
      return body[key];
    }
  }
  return undefined;
}

async function releaseInactiveAccountCode(account) {
  if (!account || account.isActive || !account.accountCode) return false;
  account.accountCode = `${account.accountCode}__inactive_${account._id}`;
  await account.save();
  return true;
}

function normalizeMasterType(rawType) {
  if (!rawType || typeof rawType !== "string") return null;

  const decoded = decodeURIComponent(rawType).replace(/\+/g, " ").trim();
  if (MASTER_TYPES.includes(decoded)) return decoded;

  const key = decoded.toLowerCase();
  if (MASTER_TYPE_ALIASES[key]) return MASTER_TYPE_ALIASES[key];

  const compact = key.replace(/[^a-z]/g, "");
  if (compact === "liabilitiescreditcards") return "Liabilities";
  if (compact === "liability") return "Liabilities";
  return null;
}

function sortSubmenus(masterType, submenus) {
  const orderedNames = SUBMENU_ORDER[masterType] || [];
  const orderedMap = new Map(orderedNames.map((name, index) => [name, index]));

  return [...submenus].sort((a, b) => {
    const aRank = orderedMap.has(a.submenuName)
      ? orderedMap.get(a.submenuName)
      : Number.MAX_SAFE_INTEGER;
    const bRank = orderedMap.has(b.submenuName)
      ? orderedMap.get(b.submenuName)
      : Number.MAX_SAFE_INTEGER;

    if (aRank !== bRank) return aRank - bRank;
    return a.submenuName.localeCompare(b.submenuName);
  });
}

function toAccountCodeSegment(segment) {
  if (/^\d+$/.test(segment)) return Number(segment);
  return String(segment || "").toLowerCase();
}

function compareAccountCodeKeys(aKey, bKey) {
  const maxLength = Math.max(aKey.length, bKey.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (aKey[index] === undefined) return -1;
    if (bKey[index] === undefined) return 1;

    const aValue = aKey[index];
    const bValue = bKey[index];
    if (aValue === bValue) continue;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return aValue - bValue;
    }

    return String(aValue).localeCompare(String(bValue), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  return 0;
}

function buildAccountCodeKey(
  code,
  codeSet,
  cache = new Map(),
  seen = new Set(),
) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return [Number.MAX_SAFE_INTEGER];
  if (cache.has(normalizedCode)) return cache.get(normalizedCode);
  if (seen.has(normalizedCode))
    return normalizedCode.split(".").map(toAccountCodeSegment);

  seen.add(normalizedCode);
  const parts = normalizedCode.split(".");
  let key;

  if (parts.length === 2 && /^\d+$/.test(parts[1]) && parts[1].length > 2) {
    const [baseCode, suffix] = parts;

    for (let cut = suffix.length - 1; cut > 0; cut -= 1) {
      const possibleParent = `${baseCode}.${suffix.slice(0, cut)}`;
      if (codeSet.has(possibleParent)) {
        key = [
          ...buildAccountCodeKey(possibleParent, codeSet, cache, seen),
          toAccountCodeSegment(suffix.slice(cut)),
        ];
        break;
      }
    }
  }

  if (!key) {
    key = parts.map(toAccountCodeSegment);
  }

  cache.set(normalizedCode, key);
  seen.delete(normalizedCode);
  return key;
}

function sortAccountsByCode(accounts = []) {
  const codeSet = new Set(
    accounts
      .map((account) => String(account.accountCode || "").trim())
      .filter(Boolean),
  );
  const keyCache = new Map();

  return [...accounts].sort((a, b) => {
    const codeResult = compareAccountCodeKeys(
      buildAccountCodeKey(a.accountCode, codeSet, keyCache),
      buildAccountCodeKey(b.accountCode, codeSet, keyCache),
    );

    if (codeResult !== 0) return codeResult;
    return String(a.accountName || "").localeCompare(
      String(b.accountName || ""),
      undefined,
      {
        sensitivity: "base",
      },
    );
  });
}

async function resolveMasterAndSubmenus(rawMasterType) {
  const normalizedType = normalizeMasterType(rawMasterType);
  if (!normalizedType) {
    return { normalizedType: null, master: null, submenus: [] };
  }

  const master = await CoaMaster.findOne({
    masterName: normalizedType,
    isActive: true,
  });
  if (!master) {
    return { normalizedType, master: null, submenus: [] };
  }

  const submenus = await CoaSubmenu.find({
    masterId: master._id,
    isActive: true,
  });
  return {
    normalizedType,
    master,
    submenus: sortSubmenus(normalizedType, submenus),
  };
}

/**
 * Get all accounts grouped by master type (with counts)
 */
export const getAccountsByType = async (req, res) => {
  try {
    const requestedType =
      req.params.type ||
      req.query.type ||
      pickBodyField(req.body, ["masterType", "master_type"]) ||
      "Assets";
    const currentType = normalizeMasterType(requestedType) || "Assets";

    // Get account counts for all types
    const accountCounts = {};
    for (const t of MASTER_TYPES) {
      const master = await CoaMaster.findOne({ masterName: t, isActive: true });
      if (master) {
        const submenus = await CoaSubmenu.find({
          masterId: master._id,
          isActive: true,
        });
        const submenuIds = submenus.map((s) => s._id);
        accountCounts[t] = await CoaAccount.countDocuments({
          submenuId: { $in: submenuIds },
          isActive: true,
        });
      } else {
        accountCounts[t] = 0;
      }
    }

    // Get accounts grouped by submenu for current type
    const { master, submenus } = await resolveMasterAndSubmenus(currentType);
    let accountsBySubtype = {};

    if (master) {
      for (const sub of submenus) {
        const accounts = await CoaAccount.find({
          submenuId: sub._id,
          isActive: true,
        });
        accountsBySubtype[sub.submenuName] = {
          submenuId: sub._id,
          accounts: sortAccountsByCode(accounts),
        };
      }
    }

    res.status(200).json({
      success: true,
      currentType,
      accountTypes: MASTER_TYPES,
      accountCounts,
      accountsBySubtype,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get account detail
 */
export const getAccountDetail = async (req, res) => {
  try {
    const account = await CoaAccount.findById(req.params.id).populate({
      path: "submenuId",
      populate: { path: "masterId" },
    });

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });
    }

    res.status(200).json({ success: true, data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create new account
 */
export const createAccount = async (req, res) => {
  try {
    const accountName = String(
      pickBodyField(req.body, ["accountName", "account_name"]) || "",
    ).trim();
    const submenuId = String(
      pickBodyField(req.body, ["submenuId", "submenu_id"]) || "",
    ).trim();
    const accountCode = String(
      pickBodyField(req.body, ["accountCode", "account_code"]) || "",
    ).trim();
    const currency = String(pickBodyField(req.body, ["currency"]) || "").trim();
    const description = String(
      pickBodyField(req.body, ["description"]) || "",
    ).trim();

    if (!accountName || accountName.length < 3) {
      return res
        .status(400)
        .json({ success: false, message: "Account name minimal 3 karakter" });
    }
    if (!submenuId) {
      return res
        .status(400)
        .json({ success: false, message: "Submenu ID wajib diisi" });
    }

    // Get submenu with master info
    const submenu = await CoaSubmenu.findById(submenuId).populate("masterId");
    if (!submenu) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid submenu" });
    }

    // Generate or validate account code
    let finalCode = accountCode;
    if (!finalCode) {
      finalCode = await generateNextAccountCode(submenu.masterId.masterName);
    } else {
      const exists = await CoaAccount.findOne({ accountCode: finalCode });
      if (exists) {
        if (!exists.isActive) {
          await releaseInactiveAccountCode(exists);
        } else {
          const visibility = exists.isActive ? "aktif" : "nonaktif/terhapus";
          return res
            .status(400)
            .json({
              success: false,
              message: `Account code ${finalCode} sudah ada (${visibility}) pada "${exists.accountName || "-"}"`,
              conflict: {
                id: exists._id,
                accountCode: exists.accountCode,
                accountName: exists.accountName,
                isActive: exists.isActive,
              },
            });
        }
      }
    }

    const account = await CoaAccount.create({
      submenuId,
      accountCode: finalCode,
      accountName,
      currency,
      description,
      balance: 0,
      isActive: true,
    });

    res
      .status(201)
      .json({
        success: true,
        message: "Account created successfully",
        data: account,
      });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Account code sudah ada" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update account
 */
export const updateAccount = async (req, res) => {
  try {
    const incomingAccountName = pickBodyField(req.body, [
      "accountName",
      "account_name",
    ]);
    const incomingAccountCode = pickBodyField(req.body, [
      "accountCode",
      "account_code",
    ]);
    const incomingCurrency = pickBodyField(req.body, ["currency"]);
    const incomingDescription = pickBodyField(req.body, ["description"]);

    const hasAccountName = incomingAccountName !== undefined;
    const hasAccountCode = incomingAccountCode !== undefined;
    const hasCurrency = incomingCurrency !== undefined;
    const hasDescription = incomingDescription !== undefined;

    const account = await CoaAccount.findById(req.params.id);

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });
    }

    if (hasAccountName) {
      const normalizedName = String(incomingAccountName || "").trim();
      if (!normalizedName || normalizedName.length < 3) {
        return res
          .status(400)
          .json({ success: false, message: "Account name minimal 3 karakter" });
      }
      account.accountName = normalizedName;
    }

    let normalizedCode = account.accountCode || "";
    if (hasAccountCode) {
      normalizedCode = String(incomingAccountCode || "").trim();
    }

    // Check code uniqueness
    if (normalizedCode && normalizedCode !== account.accountCode) {
      const exists = await CoaAccount.findOne({
        accountCode: normalizedCode,
        _id: { $ne: account._id },
      });
      if (exists) {
        if (!exists.isActive) {
          await releaseInactiveAccountCode(exists);
        } else {
          const visibility = exists.isActive ? "aktif" : "nonaktif/terhapus";
          return res
            .status(400)
            .json({
              success: false,
              message: `Account code ${normalizedCode} sudah ada (${visibility}) pada "${exists.accountName || "-"}"`,
              conflict: {
                id: exists._id,
                accountCode: exists.accountCode,
                accountName: exists.accountName,
                isActive: exists.isActive,
              },
            });
        }
      }
    }

    if (hasAccountCode) {
      account.accountCode = normalizedCode;
    }
    if (hasCurrency) {
      account.currency = String(incomingCurrency || "").trim();
    }
    if (hasDescription) {
      account.description = String(incomingDescription || "").trim();
    }

    await account.save();

    res
      .status(200)
      .json({
        success: true,
        message: "Account updated successfully",
        data: account,
      });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Account code sudah ada" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Soft delete account
 */
export const deleteAccount = async (req, res) => {
  try {
    const account = await CoaAccount.findById(req.params.id);
    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });
    }

    account.isActive = false;
    await releaseInactiveAccountCode(account);
    await account.save();

    res
      .status(200)
      .json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get submenus by master type
 */
export const getSubmenusByMasterType = async (req, res) => {
  try {
    const requestedType =
      req.params.masterType ||
      pickBodyField(req.body, ["masterType", "master_type"]);
    const { normalizedType, master, submenus } =
      await resolveMasterAndSubmenus(requestedType);

    if (!normalizedType || !master) {
      return res
        .status(404)
        .json({ success: false, message: "Master type not found" });
    }

    res.status(200).json({ success: true, data: submenus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Legacy endpoint compatibility for samitbank POST /chart-of-accounts/getSubmenus
 */
export const getSubmenusLegacy = async (req, res) => {
  try {
    const requestedType =
      req.params.masterType ||
      pickBodyField(req.body, ["masterType", "master_type"]);
    const { normalizedType, master, submenus } =
      await resolveMasterAndSubmenus(requestedType);

    if (!normalizedType || !master) {
      return res.status(200).json({ error: "Master type not found" });
    }

    return res.status(200).json(submenus);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get all categories (hierarchical) for transaction category select
 */
export const getAllCategories = async (req, res) => {
  try {
    // Batch read: 3 queries instead of nested N+1 finds
    const [masters, submenus, accounts] = await Promise.all([
      CoaMaster.find({ isActive: true }).sort({ masterName: 1 }).lean(),
      CoaSubmenu.find({ isActive: true }).sort({ submenuName: 1 }).lean(),
      CoaAccount.find({ isActive: true }).lean(),
    ]);

    const subsByMaster = new Map();
    for (const sub of submenus) {
      const key = String(sub.masterId);
      if (!subsByMaster.has(key)) subsByMaster.set(key, []);
      subsByMaster.get(key).push(sub);
    }

    const accsBySub = new Map();
    for (const acc of accounts) {
      const key = String(acc.submenuId);
      if (!accsBySub.has(key)) accsBySub.set(key, []);
      accsBySub.get(key).push(acc);
    }

    const categories = [];
    for (const master of masters) {
      categories.push({
        id: master._id,
        name: master.masterName,
        type: "master",
      });

      for (const sub of subsByMaster.get(String(master._id)) || []) {
        categories.push({
          id: sub._id,
          name: sub.submenuName,
          type: "submenu",
        });

        const sortedAccs = sortAccountsByCode(
          accsBySub.get(String(sub._id)) || [],
        );
        for (const acc of sortedAccs) {
          categories.push({
            id: acc._id,
            name: acc.accountName,
            code: acc.accountCode || "",
            type: "account",
          });
        }
      }
    }

    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all assets accounts (for dropdowns)
 */
export const getAssetsAccounts = async (req, res) => {
  try {
    const master = await CoaMaster.findOne({
      masterName: "Assets",
      isActive: true,
    });
    if (!master) {
      return res.status(200).json({ success: true, data: {} });
    }

    const rawSubmenus = await CoaSubmenu.find({
      masterId: master._id,
      isActive: true,
    }).lean();
    const submenus = sortSubmenus("Assets", rawSubmenus);
    const submenuIds = submenus.map((s) => s._id);
    const allAccounts = submenuIds.length
      ? await CoaAccount.find({
          submenuId: { $in: submenuIds },
          isActive: true,
        }).lean()
      : [];
    const accsBySub = new Map();
    for (const acc of allAccounts) {
      const key = String(acc.submenuId);
      if (!accsBySub.has(key)) accsBySub.set(key, []);
      accsBySub.get(key).push(acc);
    }
    const grouped = {};
    for (const sub of submenus) {
      grouped[sub.submenuName] = sortAccountsByCode(
        accsBySub.get(String(sub._id)) || [],
      );
    }

    res.status(200).json({ success: true, data: grouped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper: generate next account code
 */
async function generateNextAccountCode(masterName) {
  const baseCode = CODE_RANGES[masterName] || 1000;
  const master = await CoaMaster.findOne({ masterName });
  if (!master) return baseCode + 1;

  const submenus = await CoaSubmenu.find({ masterId: master._id });
  const submenuIds = submenus.map((s) => s._id);

  const numericAccounts = await CoaAccount.find({
    submenuId: { $in: submenuIds },
    accountCode: { $regex: /^\d+$/ },
  }).select("accountCode");

  let maxCode = baseCode;
  for (const account of numericAccounts) {
    const parsed = parseInt(account.accountCode, 10);
    if (!Number.isNaN(parsed) && parsed > maxCode) {
      maxCode = parsed;
    }
  }

  return String(maxCode + 1);
}
