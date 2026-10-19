import test from "node:test";
import assert from "node:assert/strict";
import {
  getMemberInvoiceStatusEntries,
  matchesMemberInvoiceStatus,
} from "../src/utils/memberInvoiceStatus.js";

test("a member can display more than one invoice status and counts repeated invoices", () => {
  assert.deepEqual(getMemberInvoiceStatusEntries({ draft: 1, sent: 2, paid: 0 }), [
    { status: "draft", count: 1 },
    { status: "sent", count: 2 },
  ]);
});

test("invoice status filter finds any matching invoice and supports members without invoices", () => {
  const counts = { draft: 1, sent: 2 };

  assert.equal(matchesMemberInvoiceStatus(counts, "all"), true);
  assert.equal(matchesMemberInvoiceStatus(counts, "sent"), true);
  assert.equal(matchesMemberInvoiceStatus(counts, "paid"), false);
  assert.equal(matchesMemberInvoiceStatus(counts, "none"), false);
  assert.equal(matchesMemberInvoiceStatus({}, "none"), true);
  assert.equal(matchesMemberInvoiceStatus({}, "draft"), false);
});

test("invoice status filter matches any of multiple selected statuses", () => {
  assert.equal(matchesMemberInvoiceStatus({ draft: 1 }, ["draft", "paid"]), true);
  assert.equal(matchesMemberInvoiceStatus({ paid: 1 }, ["draft", "paid"]), true);
  assert.equal(matchesMemberInvoiceStatus({ sent: 1 }, ["draft", "paid"]), false);
  assert.equal(matchesMemberInvoiceStatus({}, ["none", "paid"]), true);
  assert.equal(matchesMemberInvoiceStatus({ draft: 1 }, ["none", "paid"]), false);
  assert.equal(matchesMemberInvoiceStatus({ draft: 1 }, ["all"]), true);
});
