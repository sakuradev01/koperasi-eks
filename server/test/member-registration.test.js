import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveRegistrationStatus,
  summarizeRegistrationDocuments,
  validateRegistrationPayload,
} from "../src/utils/memberRegistration.js";

const image = `data:image/jpeg;base64,${"a".repeat(180)}`;
const complete = {
  uuid: "JPTG0001",
  name: "Siswa Uji",
  gender: "L",
  nik: "1234567890123456",
  bankName: "Bank Uji",
  accountNumber: "1234567890",
  accountHolderName: "Siswa Uji",
  productId: "507f1f77bcf86cd799439011",
  signatureImage: image,
  ktpImage: image,
  selfieImage: image,
  livenessLeftImage: image,
  livenessRightImage: image,
  riplText: "RIPL",
  riplVersion: "2026.1",
  riplAgreedAt: "2026-09-01T00:00:00.000Z",
};

test("accepts a complete registration payload", () => {
  const result = validateRegistrationPayload(complete);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects KTP-only payload and names every missing document", () => {
  const result = validateRegistrationPayload({
    ...complete,
    selfieImage: "",
    livenessLeftImage: "",
    livenessRightImage: "",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    "selfieImage",
    "livenessLeftImage",
    "livenessRightImage",
  ]);
});

test("keeps legacy status mapping and explicit rejected status", () => {
  assert.equal(getEffectiveRegistrationStatus({ isVerified: true }), "approved");
  assert.equal(getEffectiveRegistrationStatus({ isVerified: false }), "pending");
  assert.equal(
    getEffectiveRegistrationStatus({ registrationStatus: "rejected", isVerified: false }),
    "rejected",
  );
});

test("summary contains booleans only, never image data", () => {
  const summary = summarizeRegistrationDocuments(complete);

  assert.equal(summary.ktp, true);
  assert.equal(Object.values(summary).includes(image), false);
});
