import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemberSavingsSubmission,
} from "../src/modules/savings/application/createMemberSavingsSubmission.js";

const validMember = (overrides = {}) => ({
  _id: "member-1",
  uuid: "JPSB00001",
  name: "Siswa Uji",
  membershipStatus: "active",
  completeAddress: "Jl. Contoh No. 1",
  addressUpdateStatus: "none",
  identityVerifyStatus: "verified",
  ktpImage: "ktp-image-valid",
  selfieImage: "selfie-image-valid",
  livenessLeftImage: "liveness-left-valid",
  livenessRightImage: "liveness-right-valid",
  productId: "product-1",
  ...overrides,
});

const validProduct = {
  _id: "product-1",
  termDuration: 3,
  depositAmount: 1_000,
};

function makeHarness(overrides = {}) {
  const state = {
    discardedFiles: [],
    createdSaving: null,
    pendingExists: false,
    existingCount: 0,
    paidSavings: [],
    member: validMember(),
    product: validProduct,
    productLookupCount: 0,
    memberLookupCount: 0,
    ...overrides,
  };

  const dependencies = {
    memberRepository: {
      findForSavings: async () => {
        state.memberLookupCount += 1;
        return state.member;
      },
    },
    productRepository: {
      findById: async () => {
        state.productLookupCount += 1;
        return state.product;
      },
    },
    savingsRepository: {
      findPaidSetoran: async () => state.paidSavings,
      hasPendingSetoran: async () => state.pendingExists,
      countForPeriod: async () => state.existingCount,
      create: async (record) => {
        state.createdSaving = {
          ...record,
          populate: async () => state.createdSaving,
        };
        return state.createdSaving;
      },
      populateProduct: async (saving) => saving,
    },
    proofStorage: {
      discard: async (file) => state.discardedFiles.push(file),
    },
  };

  return {
    state,
    useCase: createMemberSavingsSubmission(dependencies),
  };
}

const file = { path: "/tmp/payment-proof.jpg", filename: "payment-proof.jpg" };

test("creates a pending savings attempt for the first incomplete period", async () => {
  const { state, useCase } = makeHarness({
    paidSavings: [
      { installmentPeriod: 1, amount: 200, type: "Setoran", status: "Approved" },
    ],
    existingCount: 2,
  });

  const result = await useCase.execute({
    memberId: "member-1",
    input: {
      amount: 500,
      productId: "product-1",
      description: "Pembayaran siswa",
      paymentDate: "2026-10-19",
    },
    proofFile: file,
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.saving.installmentPeriod, 1);
  assert.equal(result.body.data.saving.status, "Pending");
  assert.equal(result.body.data.saving.paymentType, "Partial");
  assert.equal(result.body.data.saving.partialSequence, 3);
  assert.equal(result.body.data.saving.paymentDate.toISOString().slice(0, 10), "2026-10-19");
  assert.deepEqual(state.discardedFiles, []);
});

test("rejects a second pending attempt for the same period and removes its uploaded proof", async () => {
  const { state, useCase } = makeHarness({ pendingExists: true });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000, productId: "product-1" },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "PAYMENT_PENDING");
  assert.deepEqual(state.discardedFiles, [file]);
  assert.equal(state.createdSaving, null);
});

test("blocks non-active membership before checking product or schedule", async () => {
  const { state, useCase } = makeHarness({
    member: validMember({ membershipStatus: "draft" }),
  });
  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "MEMBERSHIP_DRAFT");
  assert.deepEqual(state.discardedFiles, [file]);
  assert.equal(state.productLookupCount, 0);
});

test("keeps legacy members without a membership status eligible to submit", async () => {
  const legacyMember = validMember();
  delete legacyMember.membershipStatus;
  const { useCase } = makeHarness({ member: legacyMember });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.data.saving.installmentPeriod, 1);
});

test("rejects invalid amount before querying member data", async () => {
  const { state, useCase } = makeHarness();

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 0 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.message, "Jumlah saving harus lebih dari 0");
  assert.equal(state.memberLookupCount, 0);
  assert.deepEqual(state.discardedFiles, []);
});

test("returns the address rejection reason and removes the uploaded proof", async () => {
  const { state, useCase } = makeHarness({
    member: validMember({
      addressUpdateStatus: "rejected",
      addressUpdateRejectionReason: "Alamat belum lengkap",
    }),
  });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "ADDRESS_REJECTED");
  assert.equal(result.body.message, "Alamat ditolak: Alamat belum lengkap");
  assert.deepEqual(state.discardedFiles, [file]);
});

test("requires identity verification approval before accepting a payment", async () => {
  const { state, useCase } = makeHarness({
    member: validMember({ identityVerifyStatus: "pending" }),
  });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "IDENTITY_PENDING_VERIFICATION");
  assert.deepEqual(state.discardedFiles, [file]);
});

test("does not allow a browser-supplied product to replace the member product", async () => {
  const { state, useCase } = makeHarness();

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000, productId: "another-product" },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "PRODUCT_MISMATCH");
  assert.equal(state.productLookupCount, 0);
  assert.deepEqual(state.discardedFiles, [file]);
});

test("rejects identity documents that are missing and discards the proof", async () => {
  const { state, useCase } = makeHarness({
    member: validMember({ selfieImage: "" }),
  });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "IDENTITY_DOCS_REQUIRED");
  assert.deepEqual(state.discardedFiles, [file]);
});

test("rejects a request to skip the first incomplete installment", async () => {
  const { state, useCase } = makeHarness();

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000, productId: "product-1", installmentPeriod: 2 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "INSTALLMENT_SEQUENCE");
  assert.equal(result.body.data.nextPeriod, 1);
  assert.deepEqual(state.discardedFiles, [file]);
});

test("does not accept another payment after every schedule period is complete", async () => {
  const { state, useCase } = makeHarness({
    paidSavings: [1, 2, 3].map((installmentPeriod) => ({
      installmentPeriod,
      amount: 1_000,
      type: "Setoran",
      status: "Approved",
    })),
  });

  const result = await useCase.execute({
    memberId: "member-1",
    input: { amount: 1_000 },
    proofFile: file,
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "SAVINGS_COMPLETE");
  assert.deepEqual(state.discardedFiles, [file]);
});
