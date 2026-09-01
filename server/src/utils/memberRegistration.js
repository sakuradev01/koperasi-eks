const REGISTRATION_STATUSES = new Set(["pending", "approved", "rejected"]);
const MIN_DOCUMENT_LENGTH = 20;

const DOCUMENT_FIELDS = [
  "ktpImage",
  "selfieImage",
  "livenessLeftImage",
  "livenessRightImage",
  "signatureImage",
];

const REQUIRED_FIELDS = [
  "uuid",
  "name",
  "gender",
  "nik",
  "bankName",
  "accountNumber",
  "accountHolderName",
  "productId",
  ...DOCUMENT_FIELDS,
  "riplText",
  "riplVersion",
  "riplAgreedAt",
];

function asTrimmedString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function hasUsableDocument(value) {
  const raw = asTrimmedString(value);
  if (raw.length < MIN_DOCUMENT_LENGTH) return false;

  const uploadPathPattern = /^(?:https?:\/\/[^/]+)?\/uploads\/[\w./~!$&'()*+,;=@%:-]+$/i;

  return isUsableImageDataUrl(raw) || uploadPathPattern.test(raw);
}

function isUsableImageDataUrl(raw) {
  const match = raw.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return false;

  const mime = match[1].toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime !== "application/octet-stream") return false;

  // Some iPhone/document pickers omit the image MIME type. Accept only when
  // the decoded bytes still have a recognized image signature.
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (bytes.length < 4) return false;
  const startsWith = (signature) =>
    bytes.subarray(0, signature.length).equals(Buffer.from(signature));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const gifHeader = bytes.subarray(0, 6).toString("ascii");
  const isGif = gifHeader === "GIF87a" || gifHeader === "GIF89a";
  const isWebp =
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const heicBrand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
  const isHeic =
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(heicBrand);
  return isJpeg || isPng || isGif || isWebp || isHeic;
}

export function getEffectiveRegistrationStatus(member = {}) {
  const explicitStatus = asTrimmedString(member.registrationStatus).toLowerCase();
  if (REGISTRATION_STATUSES.has(explicitStatus)) return explicitStatus;
  return member.isVerified === true ? "approved" : "pending";
}

export function summarizeRegistrationDocuments(payload = {}) {
  return {
    ktp: hasUsableDocument(payload.ktpImage),
    selfie: hasUsableDocument(payload.selfieImage),
    livenessLeft: hasUsableDocument(payload.livenessLeftImage),
    livenessRight: hasUsableDocument(payload.livenessRightImage),
    signature: hasUsableDocument(payload.signatureImage),
    bank: Boolean(asTrimmedString(payload.bankName)),
    accountNumber: Boolean(asTrimmedString(payload.accountNumber)),
    product: Boolean(asTrimmedString(payload.productId)),
    ripl: Boolean(
      asTrimmedString(payload.riplText) &&
        asTrimmedString(payload.riplVersion) &&
        isValidDate(payload.riplAgreedAt),
    ),
  };
}

function isValidDate(value) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function hasValidScalarField(field, payload) {
  const value = asTrimmedString(payload[field]);
  if (!value) return false;
  if (field === "gender") return ["L", "P"].includes(value.toUpperCase());
  if (field === "nik") return /^\d{16}$/.test(value);
  if (field === "riplAgreedAt") return isValidDate(payload[field]);
  return true;
}

export function validateRegistrationPayload(payload = {}, options = {}) {
  const requireUuid = options.requireUuid !== false;
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (field === "uuid" && !requireUuid) continue;
    const valid = DOCUMENT_FIELDS.includes(field)
      ? hasUsableDocument(payload[field])
      : hasValidScalarField(field, payload);
    if (!valid) errors.push(field);
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: summarizeRegistrationDocuments(payload),
  };
}

export function isStudentRegistration(member = {}) {
  return asTrimmedString(member.registrationSource).toLowerCase() === "student_dashboard";
}

export const registrationDocumentFields = Object.freeze([...DOCUMENT_FIELDS]);
