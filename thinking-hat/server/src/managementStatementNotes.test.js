import assert from "node:assert/strict";
import test from "node:test";
import { fillCashSubtotals, statementCopy } from "./parseManagementWorkbook.js";

test("cash-flow subtotals and the quarterly year note are filled when a workbook is read", () => {
  const source = [
    { kind: "heading", label: "Cash flows from operating activities" },
    { kind: "total", label: " ", values: [12] },
  ];
  const rows = fillCashSubtotals(source);
  assert.equal(rows[1].label, "Net cash from operating activities");
  const quarterly = statementCopy("Profit and loss quarterly", "Demo · For the month ended 31 December 2026", source);
  assert.match(quarterly.note, /for the year ended/i);
  assert.equal(quarterly.rows[1].label, " ");
  const cash = statementCopy("Statement of cash flows", "Demo · For the month ended 31 December 2026", [
    { kind: "heading", label: "Financing activities" },
    { kind: "total", label: "", values: [-4] },
  ]);
  assert.match(cash.note, /for the month ended/i);
  assert.equal(cash.rows[1].label, "Net cash from financing activities");
});
