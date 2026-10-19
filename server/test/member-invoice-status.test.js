import test from "node:test";
import assert from "node:assert/strict";
import { getAllMembers, exportMembersExcel } from "../src/controllers/admin/member.controller.js";
import { Invoice } from "../src/models/invoice.model.js";
import { Member } from "../src/models/member.model.js";
import { Savings } from "../src/models/savings.model.js";

const members = [
  { _id: "member-a", uuid: "JPSB-A", name: "Siswa Draft Paid", isVerified: true, membershipStatus: "active" },
  { _id: "member-b", uuid: "JPSB-B", name: "Siswa Tanpa Invoice", isVerified: true, membershipStatus: "draft" },
];
const invoices = [
  { memberId: "member-a", status: "draft", total: 100, totalPaid: 0, dueDate: "2099-06-20" },
  { memberId: "member-a", status: "sent", total: 100, totalPaid: 100, dueDate: "2099-06-20" },
];

function query(value) {
  return {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    lean() { return Promise.resolve(value); },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(value) { this.body = value; return this; },
  };
}

function mockMethod(t, model, name, implementation) {
  const original = model[name];
  model[name] = implementation;
  t.after(() => { model[name] = original; });
}

function mockMemberData(t, onMemberFilter = () => {}) {
  const invoiceFilters = [];
  mockMethod(t, Member, "find", (filter) => {
    onMemberFilter(filter);
    return query(members);
  });
  mockMethod(t, Invoice, "find", (filter) => {
    invoiceFilters.push(filter);
    return query(invoices);
  });
  mockMethod(t, Savings, "aggregate", async () => []);
  return invoiceFilters;
}

function callHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = response();
    handler(req, {
      ...res,
      status(code) { res.status(code); return this; },
      json(value) { res.json(value); resolve(res); return this; },
      setHeader(name, value) { res.setHeader(name, value); },
      send(value) { res.send(value); resolve(res); return this; },
    }, reject);
  });
}

test("member list includes all linked invoice statuses and marks members without invoices", async (t) => {
  const invoiceFilters = mockMemberData(t);

  const result = await callHandler(getAllMembers, { query: {} });

  assert.equal(result.statusCode, 200);
  assert.equal(invoiceFilters.length, 1, "invoice statuses are fetched in one batch rather than per member");
  assert.deepEqual(invoiceFilters[0].memberId.$in, ["member-a", "member-b"]);
  assert.deepEqual(result.body.data[0].invoiceStatusCounts, { draft: 1, paid: 1 });
  assert.deepEqual(result.body.data[1].invoiceStatusCounts, {});
});

test("member list can filter by effective invoice status or no invoice", async (t) => {
  mockMemberData(t);

  const paidMembers = await callHandler(getAllMembers, { query: { invoiceStatus: "paid" } });
  assert.deepEqual(paidMembers.body.data.map((member) => member.uuid), ["JPSB-A"]);

  const membersWithoutInvoices = await callHandler(getAllMembers, { query: { invoiceStatus: "none" } });
  assert.deepEqual(membersWithoutInvoices.body.data.map((member) => member.uuid), ["JPSB-B"]);
});

test("member list matches any selected invoice status", async (t) => {
  mockMemberData(t);

  const result = await callHandler(getAllMembers, {
    query: { invoiceStatus: ["draft", "paid"] },
  });

  assert.deepEqual(result.body.data.map((member) => member.uuid), ["JPSB-A"]);
});

test("member export applies the invoice filter and includes invoice statuses", async (t) => {
  const invoiceFilters = mockMemberData(t);

  const result = await callHandler(exportMembersExcel, { query: { invoiceStatus: "draft" } });

  assert.equal(result.statusCode, 200);
  assert.equal(invoiceFilters.length, 1);
  assert.match(result.body, /Status Tabungan\tStatus Invoice/);
  assert.match(result.body, /JPSB-A/);
  assert.doesNotMatch(result.body, /JPSB-B/);
  assert.match(result.body, /Draft, Paid/);
});

test("member export includes members matching any selected invoice status", async (t) => {
  mockMemberData(t);

  const result = await callHandler(exportMembersExcel, {
    query: { invoiceStatus: ["none", "paid"] },
  });

  assert.equal(result.statusCode, 200);
  assert.match(result.body, /JPSB-A/);
  assert.match(result.body, /JPSB-B/);
});

test("member export combines multi-select filters with OR within each filter", async (t) => {
  let memberFilter;
  mockMemberData(t, (filter) => { memberFilter = filter; });

  await callHandler(exportMembersExcel, {
    query: {
      verificationStatus: ["verified", "rejected"],
      completionStatus: ["completed", "not_completed"],
      productId: ["product-a", "product-b"],
      membershipStatus: ["draft", "active"],
    },
  });

  assert.deepEqual(memberFilter, {
    $and: [
      {
        $or: [
          { isVerified: true },
          { registrationStatus: "rejected" },
        ],
        productId: { $in: ["product-a", "product-b"] },
      },
      {
        $or: [
          { membershipStatus: "draft" },
          { membershipStatus: "active" },
        ],
      },
    ],
  });
});
