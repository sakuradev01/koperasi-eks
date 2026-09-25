import test from "node:test";
import assert from "node:assert/strict";
import { getVisiblePageNumbers } from "../src/utils/transactionPagination.js";

test("shows the first pages at the start of a long result set", () => {
  assert.deepEqual(getVisiblePageNumbers(1, 12), [1, 2, 3, 4, 5]);
});

test("keeps the current page visible and shifts the window near the end", () => {
  assert.deepEqual(getVisiblePageNumbers(10, 12), [8, 9, 10, 11, 12]);
});

test("returns only available page numbers and none for an empty result set", () => {
  assert.deepEqual(getVisiblePageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(getVisiblePageNumbers(1, 0), []);
});
