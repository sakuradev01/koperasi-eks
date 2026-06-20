/**
 * Resolve affiliator / referral code from CI4 panel (student.uuid → PSB ref_code).
 * Same student DB as student-dashboard; not stored in Mongo member docs.
 */

const DEFAULT_PANEL_BASE = "https://panel-v2.samit.co.id";
const DEFAULT_API_KEY = "samit-student-validation-2024";
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function panelBaseUrl() {
  return (
    process.env.PANEL_API_URL ||
    process.env.CI4PANEL_API_URL ||
    DEFAULT_PANEL_BASE
  ).replace(/\/$/, "");
}

function panelApiKey() {
  return process.env.PANEL_API_KEY || process.env.STUDENT_API_KEY || DEFAULT_API_KEY;
}

export async function fetchReferralCodeByStudentUuid(uuid) {
  const key = String(uuid || "").trim();
  if (!key) return "";

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.code;
  }

  const url = `${panelBaseUrl()}/api/student/referral/${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": panelApiKey(),
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      cache.set(key, { code: "", at: Date.now() });
      return "";
    }

    const body = await res.json();
    const code = String(body?.referralCode || body?.data?.referralCode || "")
      .trim()
      .toUpperCase();

    cache.set(key, { code, at: Date.now() });
    return code;
  } catch {
    return "";
  }
}

export async function enrichCustomerSnapshotReferral(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;

  const uuid = String(snapshot.uuid || "").trim();
  if (!uuid) return snapshot;

  const referralCode = await fetchReferralCodeByStudentUuid(uuid);
  return {
    ...snapshot,
    referralCode: referralCode || snapshot.referralCode || "",
  };
}