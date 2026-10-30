import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectionTableData } from "../src/utils/paymentProjectionTable.js";

test("builds per-student totals and period totals from the visible projection columns", () => {
  const periods = [{ key: "2026-01" }, { key: "2026-02" }];
  const rows = [
    { id: "a", months: { "2026-01": 2_500_000, "2026-02": 0, "2026-03": 4_000_000 } },
    { id: "b", months: { "2026-01": 0, "2026-02": 1_250_000 } },
    { id: "c", months: { "2026-01": 0, "2026-02": 0, "2026-03": 9_000_000 } },
  ];

  const result = buildProjectionTableData(rows, periods);

  assert.deepEqual(result.rows.map(({ id, visibleTotalOutstanding }) => [id, visibleTotalOutstanding]), [
    ["a", 2_500_000],
    ["b", 1_250_000],
  ]);
  assert.deepEqual(result.totalsByPeriod, { "2026-01": 2_500_000, "2026-02": 1_250_000 });
  assert.equal(result.totalOutstanding, 3_750_000);
});

test("returns a stable empty projection table when rows or periods are empty", () => {
  assert.deepEqual(buildProjectionTableData([], [{ key: "2026-01" }]), {
    rows: [],
    totalsByPeriod: { "2026-01": 0 },
    totalOutstanding: 0,
  });
  assert.deepEqual(buildProjectionTableData([{ id: "a", months: { "2026-01": 100 } }], []), {
    rows: [],
    totalsByPeriod: {},
    totalOutstanding: 0,
  });
});
