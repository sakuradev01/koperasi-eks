import test from "node:test";
import assert from "node:assert/strict";
import {
  isLegacyWithdrawalLinesBalanced,
  normalizeLegacyWithdrawalLines,
} from "../src/utils/legacySavingsWithdrawalForm.js";

test("single-category mode automatically books the full net transfer amount", () => {
  assert.deepEqual(
    normalizeLegacyWithdrawalLines({
      mode: "single",
      categoryId: "expense-category-1",
      netAmount: 9_400_000,
    }),
    [{ categoryId: "expense-category-1", description: "", amount: 9_400_000 }],
  );
});

test("single-category mode is incomplete until a bookkeeping category is chosen", () => {
  assert.deepEqual(
    normalizeLegacyWithdrawalLines({ mode: "single", categoryId: "", netAmount: 9_400_000 }),
    [],
  );
});

test("advanced split mode keeps selected category amounts and removes empty rows", () => {
  assert.deepEqual(
    normalizeLegacyWithdrawalLines({
      mode: "split",
      netAmount: 9_400_000,
      lines: [
        { categoryId: "expense-category-1", description: "Pencairan", amount: "9000000" },
        { categoryId: "expense-category-2", description: "", amount: "400000" },
        { categoryId: "", description: "", amount: "" },
      ],
    }),
    [
      { categoryId: "expense-category-1", description: "Pencairan", amount: 9_000_000 },
      { categoryId: "expense-category-2", description: "", amount: 400_000 },
    ],
  );
});

test("single and split categories are balanced only when they equal the net transfer", () => {
  assert.equal(isLegacyWithdrawalLinesBalanced([{ amount: 9_400_000 }], 9_400_000), true);
  assert.equal(isLegacyWithdrawalLinesBalanced([{ amount: 9_000_000 }], 9_400_000), false);
  assert.equal(isLegacyWithdrawalLinesBalanced([], 0), false);
});
