import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveRegistrationStatus,
  hasUsableDocument,
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

test("accepts original evidence after it is persisted as upload paths", () => {
  const persisted = {
    ...complete,
    signatureImage: "/uploads/members/JPSB-test-signature.png",
    ktpImage: "/uploads/members/JPSB-test-ktp.jpg",
    selfieImage: "/uploads/members/JPSB-test-selfie.jpg",
    livenessLeftImage: "/uploads/members/JPSB-test-liveness-left.jpg",
    livenessRightImage: "/uploads/members/JPSB-test-liveness-right.jpg",
  };

  const result = validateRegistrationPayload(persisted);

  assert.equal(result.valid, true);
  assert.equal(result.summary.selfie, true);
});

test("accepts an iPhone JPEG whose picker reports application/octet-stream", () => {
  const jpegBytes = Buffer.from("ffd8ffe000104a46494600010100", "hex");
  const dataUrl = `data:application/octet-stream;base64,${jpegBytes.toString("base64")}`;

  assert.equal(hasUsableDocument(dataUrl), true);
  assert.equal(hasUsableDocument("data:application/octet-stream;base64,not-an-image"), false);
});
