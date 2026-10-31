import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentProjectionReport } from "../src/utils/paymentProjectionReport.js";

const product = { _id: "product-1", title: "Paket Senpai", termDuration: 1, depositAmount: 2_500_000 };
const members = [
  { _id: "active-1", uuid: "JPSB-ACTIVE", name: "Anggota Aktif", isVerified: true, membershipStatus: "active", productId: "product-1", savingsStartDate: "2026-01-01" },
  { _id: "draft-1", uuid: "JPSB-DRAFT", name: "Anggota Draft", isVerified: true, membershipStatus: "draft", productId: "product-1", savingsStartDate: "2026-01-01" },
  { _id: "inactive-1", uuid: "JPSB-INACTIVE", name: "Anggota Nonaktif", isVerified: true, membershipStatus: "inactive", productId: "product-1", savingsStartDate: "2026-01-01" },
  { _id: "legacy-1", uuid: "JPSB-LEGACY", name: "Anggota Lama", isVerified: true, productId: "product-1", savingsStartDate: "2026-01-01" },
  { _id: "unverified-1", uuid: "JPSB-UNVERIFIED", name: "Belum Verifikasi", isVerified: false, membershipStatus: "draft", productId: "product-1", savingsStartDate: "2026-01-01" },
];

const buildReport = (membershipStatuses) => buildPaymentProjectionReport({
  members,
  products: [product],
  startYear: 2026,
  endYear: 2026,
  membershipStatuses,
});

test("no membership status selection preserves active-only projection rows and totals", () => {
  const report = buildReport();

  assert.deepEqual(report.rows.map((row) => row.customerCode), ["JPSB-ACTIVE", "JPSB-LEGACY"]);
  assert.equal(report.totalOutstanding, 5_000_000);
  assert.equal(report.totals["2026-01"], 5_000_000);
});

test("selected Draft and Nonaktif members appear as zero-value inspection rows only", () => {
  const report = buildReport(["DRAFT", "inactive"]);

  assert.deepEqual(new Set(report.rows.map((row) => row.customerCode)), new Set(["JPSB-DRAFT", "JPSB-INACTIVE"]));
  assert.equal(report.totalOutstanding, 0);
  assert.ok(report.rows.every((row) => row.isProjectionEligible === false));
  assert.ok(report.rows.every((row) => row.totalOutstanding === 0));
  assert.ok(report.rows.every((row) => Object.values(row.months).every((amount) => amount === 0)));
  assert.deepEqual(report.rows.map((row) => row.membershipStatus).sort(), ["draft", "inactive"]);
});

test("selecting Active and Draft includes both while only active members count toward totals", () => {
  const report = buildReport(["active", "draft"]);

  assert.deepEqual(new Set(report.rows.map((row) => row.customerCode)), new Set(["JPSB-ACTIVE", "JPSB-LEGACY", "JPSB-DRAFT"]));
  assert.equal(report.totalOutstanding, 5_000_000);
  assert.equal(report.rows.find((row) => row.customerCode === "JPSB-DRAFT").isProjectionEligible, false);
  assert.equal(report.rows.find((row) => row.customerCode === "JPSB-ACTIVE").isProjectionEligible, true);
});
