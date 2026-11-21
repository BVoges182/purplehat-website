import assert from "node:assert/strict";
import test from "node:test";
import {
  costLine,
  fillCashSubtotals,
  lineChange,
  periodPill,
  prepareStatementRows,
  quarterlyNote,
  usesPeriodTabs,
} from "./statementMobile.js";

test("period pills keep the year, the quarter, and the balance-sheet day", () => {
  assert.equal(periodPill("December 2026"), "Dec 2026");
  assert.equal(periodPill("Nov 2026"), "Nov 2026");
  assert.equal(periodPill("October"), "Oct");
  assert.equal(periodPill("Year to date"), "YTD");
  assert.equal(periodPill("Q4 2026"), "Q4");
  assert.equal(periodPill("31 December 2026"), "31 Dec 2026");
  assert.equal(periodPill("December 31, 2026"), "31 Dec 2026");
  assert.equal(periodPill("30 Nov 2026"), "30 Nov 2026");
});

test("a smaller refund is a favourable cost, and a negative cost still shows a percent", () => {
  const row = { label: "Returns and refunds", cost: true, formats: ["money"] };
  const change = lineChange(-3600, -4200, row);
  assert.equal(change.up, false);
  assert.equal(change.favourable, true);
  assert.equal(change.text, "14%");
});

test("a higher cost is unfavourable, and a huge swing shows the amount", () => {
  const purchases = lineChange(44100, 38700, { label: "Product purchases", cost: true });
  assert.equal(purchases.favourable, false);
  assert.equal(purchases.up, true);
  assert.equal(purchases.text, "14%");
  const cash = lineChange(15260, 550, { label: "Net cash from operating activities", cost: false });
  assert.equal(cash.favourable, true);
  assert.equal(cash.text, "14,710");
});

test("cost lines follow the section, and equity totals stay favourable when they rise", () => {
  assert.equal(costLine("Product purchases", "Cost of goods sold"), true);
  assert.equal(costLine("Wages", "Operating expenses"), true);
  assert.equal(costLine("Accounts payable", "Liabilities"), true);
  assert.equal(costLine("Payments to suppliers and employees"), true);
  assert.equal(costLine("Payment for property, plant and equipment"), true);
  assert.equal(costLine("Total liabilities"), true);
  assert.equal(costLine("Total liabilities and equity"), false);
  assert.equal(costLine("Gross profit (loss)", "Cost of goods sold"), false);
  assert.equal(costLine("Member drawings"), true);
  assert.equal(costLine("Cash spent"), true);
  assert.equal(costLine("Income tax expense"), false);
});

test("empty cash-flow subtotals get activity names, and the quarterly note names the year", () => {
  const rows = fillCashSubtotals([
    { kind: "heading", label: "Operating activities" },
    { kind: "total", label: "", values: [1] },
    { kind: "heading", label: "Investing activities" },
    { kind: "total", label: "", values: [0] },
    { kind: "heading", label: "Financing activities" },
    { kind: "total", label: "Net cash from financing activities", values: [-1] },
  ]);
  assert.equal(rows[1].label, "Net cash from operating activities");
  assert.equal(rows[3].label, "Net cash from investing activities");
  assert.equal(rows[5].label, "Net cash from financing activities");
  const prepared = prepareStatementRows({
    title: "Statement of cash flows",
    rows: [{ kind: "heading", label: "Operating activities" }, { kind: "total", label: "", values: [10] }],
  });
  assert.equal(prepared[1].label, "Net cash from operating activities");
  assert.equal(prepared[1].cost, false);
  assert.equal(quarterlyNote("Profit and loss quarterly", "Purple Hat Demo · For the month ended 31 December 2026"), "Purple Hat Demo · For the year ended 31 December 2026");
  assert.equal(quarterlyNote("Profit and loss", "For the month ended 31 December 2026"), "For the month ended 31 December 2026");
});

test("only the four statements and the executive summary use period tabs", () => {
  assert.equal(usesPeriodTabs("Profit and loss"), true);
  assert.equal(usesPeriodTabs("Profit and loss quarterly"), true);
  assert.equal(usesPeriodTabs("Balance sheet"), true);
  assert.equal(usesPeriodTabs("Statement of cash flows"), true);
  assert.equal(usesPeriodTabs("Executive summary"), true);
  assert.equal(usesPeriodTabs("Court lease profit and loss"), false);
});
