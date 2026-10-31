import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMultiSelectQueryValues,
  withMultiSelectQueryParam,
} from "../src/utils/multiSelectQueryParams.js";

test("parses, normalizes, and deduplicates comma-separated or repeated status values", () => {
  assert.deepEqual(
    parseMultiSelectQueryValues([" Draft, Sent ", "sent", "PARTIAL"]),
    ["draft", "sent", "partial"],
  );
});

test("keeps a default report query unchanged until the apply transformation runs", () => {
  const defaultQuery = new URLSearchParams("year=2026");
  const pendingSelection = ["draft"];

  assert.deepEqual(parseMultiSelectQueryValues(defaultQuery.getAll("memberStatus")), []);
  assert.equal(defaultQuery.toString(), "year=2026");

  const appliedQuery = withMultiSelectQueryParam(
    Object.fromEntries(defaultQuery),
    "memberStatus",
    pendingSelection,
  );

  assert.deepEqual(parseMultiSelectQueryValues(new URLSearchParams(appliedQuery).getAll("memberStatus")), ["draft"]);
  assert.equal(defaultQuery.toString(), "year=2026", "the current report query is immutable before Apply");
});

test("only persists a multi-select query parameter when values are selected", () => {
  const period = { year: "2026", status: "all" };
  assert.deepEqual(withMultiSelectQueryParam(period, "invoiceStatuses", ["sent", "paid"]), {
    year: "2026",
    status: "all",
    invoiceStatuses: "sent,paid",
  });
  assert.deepEqual(withMultiSelectQueryParam({ ...period, memberStatus: "draft" }, "memberStatus", []), period);
});
