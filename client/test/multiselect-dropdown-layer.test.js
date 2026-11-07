import test from "node:test";
import assert from "node:assert/strict";
import { getMultiSelectDropdownLayerClass } from "../src/utils/multiSelectDropdownLayer.js";

test("report dropdown layer stays above sticky report headers", () => {
  const dropdownLayerClass = getMultiSelectDropdownLayerClass("navy");

  assert.equal(dropdownLayerClass, "z-[60]");
});

test("non-report multi-select keeps its existing dropdown layer", () => {
  const dropdownLayerClass = getMultiSelectDropdownLayerClass("pink");

  assert.equal(dropdownLayerClass, "z-30");
});
