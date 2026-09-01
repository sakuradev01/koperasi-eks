import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessFeature,
  isSavingsCoaOnlyEditor,
  normalizeSavingsPermission,
} from "../src/utils/permissions.js";
import {
  validateSavingsCoaOnlyPayload,
} from "../src/utils/savingsPermissions.js";
import { requireFeaturePermission } from "../src/middlewares/permission.middleware.js";

const accountId = "507f1f77bcf86cd799439011";
const categoryId = "507f1f77bcf86cd799439012";

test("admin bypasses feature permissions", () => {
  const admin = { role: "admin", permissions: {} };

  assert.equal(canAccessFeature(admin, "simpanan", "view"), true);
  assert.equal(canAccessFeature(admin, "simpanan", "create"), true);
  assert.equal(canAccessFeature(admin, "simpanan", "delete"), true);
});

test("COA-only savings access allows viewing/editing but no other action", () => {
  const operator = {
    role: "operator",
    permissions: {
      simpanan: { editCoaOnly: true, view: false, edit: false, create: true, delete: true },
    },
  };

  assert.equal(isSavingsCoaOnlyEditor(operator), true);
  assert.equal(canAccessFeature(operator, "simpanan", "view"), true);
  assert.equal(canAccessFeature(operator, "simpanan", "edit"), true);
  assert.equal(canAccessFeature(operator, "simpanan", "create"), false);
  assert.equal(canAccessFeature(operator, "simpanan", "delete"), false);
});

test("normalizing COA-only permission forces the safe CRUD flags", () => {
  assert.deepEqual(
    normalizeSavingsPermission({
      editCoaOnly: true,
      view: false,
      edit: false,
      create: true,
      delete: true,
    }),
    { editCoaOnly: true, view: true, edit: true, create: false, delete: false },
  );
});

test("COA-only payload accepts only account and category fields", () => {
  const result = validateSavingsCoaOnlyPayload(
    { accountId, categoryId, categoryType: "account" },
    { isSplit: false },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.payload, { accountId, categoryId, categoryType: "account" });
});

test("COA-only payload rejects attempts to change savings data", () => {
  const result = validateSavingsCoaOnlyPayload(
    {
      accountId,
      categoryId,
      categoryType: "account",
      amount: 1,
      status: "Approved",
    },
    { isSplit: false },
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.disallowedFields, ["amount", "status"]);
});

test("COA-only payload requires a category for non-split savings", () => {
  const result = validateSavingsCoaOnlyPayload(
    { accountId },
    { isSplit: false },
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Category/i);
});

test("COA-only payload can update the account of a split transaction without rewriting splits", () => {
  const result = validateSavingsCoaOnlyPayload(
    { accountId },
    { isSplit: true },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.payload, { accountId });
});

test("permission middleware blocks review actions for COA-only operators", () => {
  const req = {
    user: {
      role: "operator",
      permissions: { simpanan: { editCoaOnly: true } },
    },
  };
  let statusCode;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  requireFeaturePermission("simpanan", "edit", { allowSavingsCoaOnly: false })(
    req,
    res,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
  assert.match(responseBody.message, /Record Account dan Category/);
});

test("permission middleware marks allowed COA edits for the controller", () => {
  const req = {
    user: {
      role: "operator",
      permissions: { simpanan: { editCoaOnly: true } },
    },
  };
  let nextCalled = false;
  const res = {
    status() {
      throw new Error("allowed edit should not return an error");
    },
    json() {
      throw new Error("allowed edit should not return an error");
    },
  };

  requireFeaturePermission("simpanan", "edit")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.savingsEditCoaOnly, true);
});
