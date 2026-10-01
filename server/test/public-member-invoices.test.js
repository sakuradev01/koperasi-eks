import test from "node:test";
import assert from "node:assert/strict";
import { getPublicMemberInvoicesByUuid } from "../src/controllers/admin/invoice.controller.js";
import { Invoice } from "../src/models/invoice.model.js";
import { Member } from "../src/models/member.model.js";

const makeQuery = (value) => ({
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  async lean() {
    return value;
  },
});

const callEndpoint = (member, invoices) => new Promise((resolve, reject) => {
  Member.findOne = () => makeQuery(member);
  Invoice.find = () => makeQuery(invoices);

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      resolve({ statusCode: this.statusCode, body });
      return this;
    },
  };

  getPublicMemberInvoicesByUuid({ params: { uuid: "student-uuid" } }, response, reject);
});

test("public member invoices remain visible for every membership status", async (t) => {
  const originalFindOne = Member.findOne;
  const originalFind = Invoice.find;
  t.after(() => {
    Member.findOne = originalFindOne;
    Invoice.find = originalFind;
  });

  for (const membershipStatus of ["draft", "active", "inactive"]) {
    const invoice = {
      invoiceNumber: `INV-${membershipStatus.toUpperCase()}`,
      memberId: null,
      customerSnapshot: { uuid: "" },
      status: "unpaid",
      items: [{ title: "Tabungan", quantity: 1, price: 2500, amount: 2500 }],
      projections: [],
      payments: [],
      total: 2500,
      totalPaid: 0,
      amountDue: 2500,
    };
    const result = await callEndpoint({
      _id: "member-id",
      uuid: "student-uuid",
      name: "Siswa Uji",
      isVerified: true,
      membershipStatus,
    }, [invoice]);

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.member.membershipStatus, membershipStatus);
    assert.equal(result.body.data.invoices.length, 1, `${membershipStatus} invoice should remain visible`);
    assert.equal(result.body.data.invoices[0].invoiceNumber, invoice.invoiceNumber);
    assert.equal(result.body.data.summary.totalInvoices, 1);
  }
});
