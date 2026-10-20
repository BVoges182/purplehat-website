import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  addSections,
  applySectionAction,
  arrangeReportSections,
  deleteSection,
  mapTabName,
  normalizeEditorSections,
  parseWorkbook,
  reorderSections,
  sectionsFromMapping,
  updateSection,
} from "./templateSections.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-management-sections.xlsx");

test("tab names map to section types", () => {
  const cases = [
    ["Income Statement", "profit-and-loss"],
    ["income statement", "profit-and-loss"],
    ["P&L", "profit-and-loss"],
    ["Profit and Loss", "profit-and-loss"],
    ["Profit & Loss", "profit-and-loss"],
    ["Balance Sheet", "balance-sheet"],
    ["balance sheet", "balance-sheet"],
    ["Cash Flow", "cash-flows"],
    ["Cash Flow Statement", "cash-flows"],
    ["cashflow", "cash-flows"],
    ["Accounts Receivable", "aged-receivables"],
    ["AR", "aged-receivables"],
    ["Aged Receivables", "aged-receivables"],
    ["Accounts Payable", "aged-payables"],
    ["AP", "aged-payables"],
    ["Aged Payables", "aged-payables"],
    ["E-commerce", "ecommerce"],
    ["Ecommerce", "ecommerce"],
    ["e commerce report", "ecommerce"],
    ["Quarterly P&L", "quarterly-pl"],
    ["Scratch", ""],
  ];
  for (const [name, expected] of cases) {
    assert.equal(mapTabName(name), expected, name);
  }
});

test("the sample workbook parses headings, totals, indents, and formats", async () => {
  const parsed = await parseWorkbook(fs.readFileSync(fixturePath));
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.tabs.map((tab) => tab.name), [
    "Income Statement",
    "Balance Sheet",
    "Cash Flow",
    "Accounts Receivable",
    "Accounts Payable",
    "E-commerce",
  ]);
  assert.deepEqual(parsed.tabs.map((tab) => tab.suggestedType), [
    "profit-and-loss",
    "balance-sheet",
    "cash-flows",
    "aged-receivables",
    "aged-payables",
    "ecommerce",
  ]);

  const income = parsed.tabs[0];
  assert.equal(income.empty, false);
  assert.deepEqual(income.columns, ["January 2026", "Year to date"]);
  assert.equal(income.rows.find((row) => row.label === "Income").kind, "heading");
  const cost = income.rows.find((row) => row.label === "Cost of sales");
  assert.equal(cost.kind, "line");
  assert.equal(cost.indent, 1);
  assert.equal(cost.formats[0], "money2");
  assert.equal(cost.values[0], 300);
  assert.equal(income.rows.find((row) => row.label === "Gross profit").kind, "total");
  assert.equal(income.rows.find((row) => row.label === "Net income").kind, "total");
  assert.equal(income.rows.find((row) => row.label === "Total expenses").kind, "total");

  const cash = parsed.tabs[2];
  assert.equal(cash.rows.find((row) => row.label === "Closing cash").kind, "total");

  const commerce = parsed.tabs[5];
  assert.equal(commerce.rowCount, 2);
  const january = commerce.rows[0];
  assert.equal(january.label, "January");
  assert.equal(january.formats[2], "percent2");
  assert.equal(january.values[2], 0.12);

  const imported = sectionsFromMapping(parsed.tabs, parsed.tabs.map((tab) => ({
    index: tab.index,
    type: tab.suggestedType,
    skip: false,
  })));
  assert.equal(imported.error, undefined);
  assert.deepEqual(imported.sections.map((section) => section.title), [
    "Profit and loss",
    "Balance sheet",
    "Statement of cash flows",
    "Aged Receivable Summary",
    "Aged Payable Summary",
    "E-commerce report",
  ]);
  assert.equal(imported.sections[0].presentation, "table");
  assert.equal(imported.sections[3].presentation, "aging");
  assert.equal(imported.sections[5].presentation, "ecommerce");
  assert.equal(imported.sections[5].rows[0].month, "January");
});

test("empty tabs and unreadable files are reported", async () => {
  const unreadable = await parseWorkbook(Buffer.from("this is not a workbook"));
  assert.equal(unreadable.error, "Could not read that Excel file.");

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Account", "Month"]]), "Balance Sheet");
  const empty = await parseWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  assert.equal(empty.tabs[0].empty, true);
  assert.equal(empty.tabs[0].error, "This tab is empty.");
  const blocked = sectionsFromMapping(empty.tabs, [{ index: 0, type: "balance-sheet", skip: false }]);
  assert.equal(blocked.error, 'Skip the empty tab "Balance Sheet".');
  const skipped = sectionsFromMapping(empty.tabs, [{ index: 0, type: "balance-sheet", skip: true }]);
  assert.equal(skipped.error, "Choose at least one tab to import.");

  const xls = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(xls, XLSX.utils.aoa_to_sheet([
    ["Account", "Month"],
    ["Cash", 10],
    ["Total assets", 10],
  ]), "Balance Sheet");
  const parsedXls = await parseWorkbook(XLSX.write(xls, { type: "buffer", bookType: "xls" }));
  assert.equal(parsedXls.error, undefined);
  assert.equal(parsedXls.tabs[0].suggestedType, "balance-sheet");
  assert.equal(parsedXls.tabs[0].rows[0].label, "Cash");
  assert.equal(parsedXls.tabs[0].rows[1].kind, "total");
});

test("sections can be added, edited, deleted, and reordered", () => {
  const added = addSections([], "profit-and-loss");
  assert.equal(added.sections.length, 1);
  assert.equal(added.sections[0].title, "Profit and loss");
  assert.equal(added.sections[0].presentation, "table");
  assert.equal(added.sections[0].rows.some((row) => row.kind === "total"), true);

  const both = addSections(added.sections, "top-expenses");
  assert.deepEqual(both.sections.map((section) => section.title), [
    "Profit and loss",
    "Top expenses",
    "Year to date — Top expenses",
  ]);
  assert.equal(both.sections[1].presentation, "contacts");
  assert.equal(both.sections[1].chart, true);

  const profit = both.sections[0];
  const edited = updateSection(both.sections, profit.id, {
    title: "Management P&L",
    subtitle: "Compared with last year",
    chart: false,
    hidden: true,
    columns: ["January", "February"],
    rows: [
      { kind: "heading", label: "Trading" },
      { kind: "line", label: "Sales", indent: 1, values: [10, 12], formats: ["money", "money"] },
      { kind: "total", label: "Gross profit", values: [10, 12], formats: ["money", "money"] },
    ],
  });
  const saved = edited.sections[0];
  assert.equal(saved.title, "Management P&L");
  assert.equal(saved.subtitle, "Compared with last year");
  assert.equal(saved.chart, false);
  assert.equal(saved.hidden, true);
  assert.deepEqual(saved.columns, ["January", "February"]);
  assert.deepEqual(saved.rows.map((row) => row.label), ["Trading", "Sales", "Gross profit"]);
  assert.equal(saved.rows[1].indent, 1);
  assert.equal(saved.rows[2].kind, "total");

  const removed = deleteSection(edited.sections, both.sections[2].id);
  assert.deepEqual(removed.sections.map((section) => section.title), ["Management P&L", "Top expenses"]);

  const order = [removed.sections[1].id, removed.sections[0].id];
  const reordered = reorderSections(removed.sections, order);
  const roundTrip = normalizeEditorSections(JSON.parse(JSON.stringify(reordered.sections)));
  assert.deepEqual(roundTrip.sections.map((section) => section.id), order);
  assert.equal(roundTrip.sections[1].subtitle, "Compared with last year");
  assert.equal(roundTrip.sections[1].hidden, true);

  const again = applySectionAction(roundTrip.sections, { action: "delete", id: order[0] });
  assert.equal(again.sections.length, 1);
  assert.equal(again.sections[0].title, "Management P&L");
  assert.equal(deleteSection(again.sections, "missing").error, "That section was not found.");
});

test("a saved template order is kept when a report is generated", () => {
  const report = [
    { title: "Executive summary" },
    { title: "Profit and loss" },
    { title: "Balance sheet" },
    { title: "Statement of cash flows" },
    { title: "E-commerce report" },
  ];
  const untouched = arrangeReportSections(report, [], { customOrder: false });
  assert.equal(untouched.customOrder, false);
  assert.equal(untouched.sections[2].title, "Balance sheet");
  assert.equal(untouched.sections[3].title, "Statement of cash flows");

  const moved = [
    { title: "Statement of cash flows" },
    { title: "Executive summary" },
    { title: "Profit and loss" },
    { title: "Balance sheet", hidden: true },
    { title: "E-commerce report" },
  ];
  const custom = arrangeReportSections(report, moved, { customOrder: true });
  assert.equal(custom.customOrder, true);
  assert.deepEqual(custom.sections.map((section) => section.title), [
    "Statement of cash flows",
    "Executive summary",
    "Profit and loss",
    "E-commerce report",
  ]);
});
