import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoiceStatusCountsByMember,
  matchesInvoiceStatusFilter,
} from "../src/utils/invoiceStatus.js";

const now = new Date("2026-06-15T12:00:00");

test("summarizes every effective invoice status for its member", () => {
  const invoices = [
    { memberId: "member-a", status: "draft", total: 100, totalPaid: 0, dueDate: "2026-06-20" },
    { memberId: "member-a", status: "sent", total: 100, totalPaid: 0, dueDate: "2026-06-20" },
    { memberId: "member-a", status: "sent", total: 100, totalPaid: 25, dueDate: "2026-06-20" },
    { memberId: "member-a", status: "sent", total: 100, totalPaid: 100, dueDate: "2026-06-20" },
    { memberId: "member-a", status: "sent", total: 100, totalPaid: 0, dueDate: "2026-06-14" },
    { memberId: "member-b", status: "draft", total: 100, totalPaid: 0, dueDate: "2026-06-20" },
  ];

  assert.deepEqual(buildInvoiceStatusCountsByMember(invoices, now), new Map([
    ["member-a", { draft: 1, sent: 1, partial: 1, paid: 1, overdue: 1 }],
    ["member-b", { draft: 1 }],
  ]));
});

test("invoice status filters match any invoice, or members with no invoices", () => {
  const counts = { draft: 1, sent: 2 };

  assert.equal(matchesInvoiceStatusFilter(counts, "all"), true);
  assert.equal(matchesInvoiceStatusFilter(counts, "sent"), true);
  assert.equal(matchesInvoiceStatusFilter(counts, "paid"), false);
  assert.equal(matchesInvoiceStatusFilter(counts, "none"), false);
  assert.equal(matchesInvoiceStatusFilter({}, "none"), true);
  assert.equal(matchesInvoiceStatusFilter({}, "draft"), false);
});
