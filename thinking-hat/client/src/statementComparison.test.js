import assert from "node:assert/strict";
import test from "node:test";
import { threeMonthComparison } from "./statementComparison.js";

test("three month comparison keeps three months and adds the change", () => {
  const section = threeMonthComparison({
    columns: ["Dec 2026", "Nov 2026", "Oct 2026", "Year to date"],
    units: ["$", "$", "$", "$"],
    rows: [
      { kind: "heading", label: "Income" },
      { kind: "line", label: "Sales", values: [100, 80, 70, 250], formats: ["money", "money", "money", "money"] },
      { kind: "total", label: "Total", values: [40, null, 10, 50], formats: ["money", "money", "money", "money"] },
    ],
  }, "Income statement");

  assert.deepEqual(section.columns, ["Dec 2026", "Nov 2026", "Oct 2026", "Change"]);
  assert.equal(section.title, "Income statement");
  assert.deepEqual(section.rows[1].values, [100, 80, 70, 20]);
  assert.equal(section.rows[2].values[3], null);
  assert.equal(section.units.at(-1), "$");
});
