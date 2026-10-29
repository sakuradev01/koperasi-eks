import test from "node:test";
import assert from "node:assert/strict";
import {
  getLineAmountTotal,
  getUploadedFieldFiles,
  hasExpenseLinesInput,
  normalizeMoney,
  normalizeText,
  parseExpenseLines,
  toDate,
} from "../src/utils/expenseInput.js";

test("normalizes expense request values without throwing on empty input", () => {
  assert.equal(normalizeMoney("-1200"), 1_200);
  assert.equal(normalizeMoney("not a number"), 0);
  assert.equal(normalizeText(null), "");
  assert.equal(toDate("not a date"), null);
});

test("parses supported expense-line aliases and totals only positive categorized lines", () => {
  const lines = parseExpenseLines({
    lines: JSON.stringify([
      { category_id: "coa-1", notes: "Transfer", amount: 600 },
      { category: "coa-2", description: "Fee", amount: 400 },
      { categoryId: "", amount: 200 },
      { categoryId: "coa-3", amount: 0 },
    ]),
  });

  assert.deepEqual(lines, [
    { categoryId: "coa-1", description: "Transfer", amount: 600 },
    { categoryId: "coa-2", description: "Fee", amount: 400 },
  ]);
  assert.equal(getLineAmountTotal(lines), 1_000);
  assert.equal(hasExpenseLinesInput({ lines: [] }), true);
  assert.equal(hasExpenseLinesInput({}), false);
});

test("collects only uploaded files from the requested multipart fields", () => {
  const proofs = [{ filename: "proof-a.pdf" }];
  const attachments = [{ filename: "attachment.jpg" }];

  assert.deepEqual(
    getUploadedFieldFiles({ files: { payment_proofs: proofs, attachments } }, ["payment_proofs"]),
    proofs,
  );
});
