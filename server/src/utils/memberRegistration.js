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

  const dataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i;
  const uploadPathPattern = /^(?:https?:\/\/[^/]+)?\/uploads\/[\w./~!$&'()*+,;=@%:-]+$/i;

  return dataUrlPattern.test(raw) || uploadPathPattern.test(raw);
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
