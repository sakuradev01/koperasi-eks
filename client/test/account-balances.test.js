import test from "node:test";
import assert from "node:assert/strict";
import { applyReportBalancesToAccountGroups } from "../src/utils/accountBalances.js";

test("uses ledger report balances instead of stale stored COA balances", () => {
  const groups = {
    "Cash and Bank": [
      { _id: "bank-1", accountName: "Bank SAMIT", balance: 1_654_088_371, reportBalance: 1_655_288_371 },
    ],
  };

  assert.deepEqual(applyReportBalancesToAccountGroups(groups), {
    "Cash and Bank": [
      { _id: "bank-1", accountName: "Bank SAMIT", balance: 1_655_288_371, reportBalance: 1_655_288_371 },
    ],
  });
  assert.equal(groups["Cash and Bank"][0].balance, 1_654_088_371);
});

test("keeps the stored balance as a fallback when a ledger snapshot is unavailable", () => {
  assert.deepEqual(
    applyReportBalancesToAccountGroups({
      Cash: [
        { _id: "cash-1", balance: "250000", reportBalance: null },
        { _id: "cash-2", balance: undefined, reportBalance: Number.NaN },
      ],
    }),
    {
      Cash: [
        { _id: "cash-1", balance: 250000, reportBalance: null },
        { _id: "cash-2", balance: 0, reportBalance: Number.NaN },
      ],
    },
  );
});
