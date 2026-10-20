import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdminSavings,
  AdminSavingsCreationError,
} from "../src/modules/savings/application/createAdminSavings.js";

const input = {
  installmentPeriod: 2,
  memberId: "member-1",
  productId: "product-1",
  amount: 500,
  savingsDate: null,
  paymentDate: null,
  type: null,
  description: "",
  status: null,
  paymentType: "Full",
  notes: null,
  accountId: null,
  categoryId: null,
  categoryType: null,
  isSplit: false,
};

function makeHarness({ member = { _id: "member-1" }, product = { _id: "product-1", depositAmount: 1_000 }, existingCount = 2 } = {}) {
  const state = { created: null, memberLookups: 0, productLookups: 0 };
  const useCase = createAdminSavings({
    memberRepository: {
      findById: async () => {
        state.memberLookups += 1;
        return member;
      },
    },
    productRepository: {
      findById: async () => {
        state.productLookups += 1;
        return product;
      },
    },
    savingsRepository: {
      countForPeriod: async () => existingCount,
      create: async (data) => {
        state.created = data;
        return { _id: "saving-1", ...data };
      },
    },
    clock: () => new Date("2026-10-19T00:00:00.000Z"),
  });

  return { state, useCase };
}

test("creates a partial admin payment with the current sequence and defaults", async () => {
  const { state, useCase } = makeHarness();

  const result = await useCase.execute(input, "proof.jpg");

  assert.equal(result._id, "saving-1");
  assert.equal(state.created.partialSequence, 3);
  assert.equal(state.created.paymentType, "Partial");
  assert.equal(state.created.status, "Pending");
  assert.equal(state.created.type, "Setoran");
  assert.equal(state.created.description, "Pembayaran Simpanan Periode - 2 (#3)");
  assert.equal(state.created.savingsDate.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(state.created.proofFile, "proof.jpg");
  assert.equal(state.created.notes, "");
  assert.equal(state.created.accountId, null);
  assert.equal(state.created.isSplit, false);
});

test("keeps explicit admin fields but always derives payment type from amount and product", async () => {
  const { state, useCase } = makeHarness({ existingCount: 0 });

  const result = await useCase.execute({
    ...input,
    amount: 1_000,
    type: "Penarikan",
    status: "Approved",
    paymentType: "Partial",
    description: "Setoran manual",
    savingsDate: "2026-10-01",
    notes: "Catatan Finance",
  }, null);

  assert.equal(result.type, "Penarikan");
  assert.equal(result.status, "Approved");
  assert.equal(result.paymentType, "Full");
  assert.equal(result.description, "Setoran manual");
  assert.equal(result.savingsDate, "2026-10-01");
  assert.equal(result.notes, "Catatan Finance");
  assert.equal(result.proofFile, null);
  assert.equal(state.created.partialSequence, 1);
});

test("returns not-found errors before creating a saving", async () => {
  const missingMember = makeHarness({ member: null });
  await assert.rejects(
    missingMember.useCase.execute(input, null),
    (error) => error instanceof AdminSavingsCreationError
      && error.statusCode === 404
      && error.message === "Anggota tidak ditemukan",
  );
  assert.equal(missingMember.state.productLookups, 0);
  assert.equal(missingMember.state.created, null);

  const missingProduct = makeHarness({ product: null });
  await assert.rejects(
    missingProduct.useCase.execute(input, null),
    (error) => error instanceof AdminSavingsCreationError
      && error.statusCode === 404
      && error.message === "Produk tidak ditemukan",
  );
  assert.equal(missingProduct.state.created, null);
});
