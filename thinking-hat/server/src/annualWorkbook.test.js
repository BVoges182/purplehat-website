import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { annualSectionTitles, parseAnnualWorkbook, viewerCanReadAnnual } from "./annualWorkbook.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "PurpleHatDemo_Audited_FS_FY2026.xlsx");

test("the sample workbook maps tabs, values, totals, and workings checks", async () => {
  const document = await parseAnnualWorkbook(fs.readFileSync(fixture));
  assert.deepEqual(document.errors, []);
  const balance = document.statements.find((item) => item.key === "balance-sheets");
  const assets = balance.rows.find((row) => row.label === "Total assets");
  const operations = document.statements.find((item) => item.key === "operations");
  const income = operations.rows.find((row) => row.label === "Net income");
  assert.deepEqual(assets.values.map((value) => Math.round(value)), [174470, 172000]);
  assert.deepEqual(income.values.map((value) => Math.round(value)), [19070, 10790]);
  assert.equal(document.notes.length, 14);
  const policies = document.notes.find((note) => note.number === 2);
  assert.ok(policies.blocks.some((block) => block.type === "p" && /US GAAP/.test(block.text)));
  const cashTable = policies.blocks.find((block) => block.type === "table" && block.rows.some((row) => row.label === "Cash at bank"));
  assert.ok(cashTable);
  assert.deepEqual(cashTable.headers, ["2026", "2025"]);
  assert.ok(!cashTable.rows.some((row) => row.label.length > 90));
  assert.ok(document.checks.length > 0);
  assert.ok(document.checks.every((check) => check.ok));
  const titles = annualSectionTitles(document);
  assert.ok(titles.some((title) => /auditor/i.test(title)));
  for (let n = 1; n <= 14; n += 1) assert.ok(titles.some((title) => title.startsWith(`${n}.`)));
});

test("a workbook that does not balance is rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  for (const name of [
    "Cover", "Index", "Auditor's Report", "Balance Sheets", "Statements of Operations",
    "Member's Equity", "Cash Flows", "Workings & Reconciliations",
    ...Array.from({ length: 14 }, (_, index) => `Note ${index + 1}`),
  ]) workbook.addWorksheet(name);
  const balance = workbook.getWorksheet("Balance Sheets");
  balance.getCell("A1").value = "Total assets";
  balance.getCell("C5").value = "2026";
  balance.getCell("D5").value = "2025";
  balance.getCell("A6").value = "Total assets";
  balance.getCell("C6").value = 10;
  balance.getCell("D6").value = 10;
  balance.getCell("A7").value = "Total liabilities and member's equity";
  balance.getCell("C7").value = 4;
  balance.getCell("D7").value = 10;
  const cash = workbook.getWorksheet("Cash Flows");
  cash.getCell("C5").value = "2026";
  cash.getCell("D5").value = "2025";
  cash.getCell("A6").value = "Cash at beginning of year";
  cash.getCell("C6").value = 1;
  cash.getCell("D6").value = 1;
  cash.getCell("A7").value = "Net change in cash";
  cash.getCell("C7").value = 1;
  cash.getCell("D7").value = 1;
  cash.getCell("A8").value = "Cash at end of year";
  cash.getCell("C8").value = 2;
  cash.getCell("D8").value = 2;
  const equity = workbook.getWorksheet("Member's Equity");
  equity.getCell("C5").value = "2026";
  equity.getCell("D5").value = "2025";
  equity.getCell("A6").value = "Member's equity";
  equity.getCell("C6").value = 6;
  equity.getCell("D6").value = 6;
  const buffer = await workbook.xlsx.writeBuffer();
  const document = await parseAnnualWorkbook(Buffer.from(buffer));
  assert.ok(document.errors.some((error) => /does not balance for 2026/.test(error)));
});

test("tabs that lost their apostrophes still parse", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(fixture));
  workbook.getWorksheet("Auditor's Report").name = "Auditors Report";
  workbook.getWorksheet("Member's Equity").name = "Members Equity";
  const document = await parseAnnualWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(document.errors, []);
  const balance = document.statements.find((item) => item.key === "balance-sheets");
  const assets = balance.rows.find((row) => row.label === "Total assets");
  assert.deepEqual(assets.values.map((value) => Math.round(value)), [174470, 172000]);
  assert.ok(document.auditor.blocks.some((block) => /benjamin voges/i.test(block.text)));
});

test("note 4 ages both years, ties to the balance sheet, and keeps the demo line on the cover", async () => {
  const document = await parseAnnualWorkbook(fs.readFileSync(fixture));
  assert.deepEqual(document.errors, []);
  const note = document.notes.find((item) => item.number === 4);
  const narrative = note.blocks.find((block) => /ASC 326/.test(block.text || ""));
  assert.equal(narrative.type, "p");
  assert.match(narrative.text, /30-day terms/);
  assert.match(narrative.text, /zero at both year-ends/);
  const collected = note.blocks.find((block) => /collected in January 2027/.test(block.text || ""));
  assert.equal(collected.type, "p");
  const summary = note.blocks.find((block) => block.type === "table" && block.rows.some((row) => row.label === "December 31, 2026") && block.rows.some((row) => row.label === "December 31, 2025"));
  assert.deepEqual(summary.headers, ["Current", "1-30 days past due", "31-60 days past due", "Over 60 days", "Total"]);
  const year2026 = summary.rows.find((row) => row.label === "December 31, 2026");
  const year2025 = summary.rows.find((row) => row.label === "December 31, 2025");
  assert.deepEqual(year2026.values, [10600, 1700, 200, 0, 12500]);
  assert.deepEqual(year2025.values, [8500, 1300, 200, 0, 10000]);
  const balance = document.statements.find((item) => item.key === "balance-sheets");
  const receivable = balance.rows.find((row) => /^accounts receivable$/i.test(row.label));
  assert.equal(year2026.values[4], receivable.values[0]);
  assert.equal(year2025.values[4], receivable.values[1]);
  const rollforward = note.blocks.find((block) => block.type === "table" && block.rows.some((row) => row.label === "Ending balance"));
  for (const row of rollforward.rows) assert.deepEqual(row.values, [0, 0]);
  const customers = note.blocks.filter((block) => block.type === "table" && block.rows.some((row) => row.label === "Northwind Buyers"));
  assert.equal(customers.length, 2);
  assert.deepEqual(customers[0].rows.at(-1).values, [10600, 1700, 200, 0, 12500]);
  assert.deepEqual(customers[1].rows.at(-1).values, [8500, 1300, 200, 0, 10000]);
  for (const item of document.notes) {
    for (const block of item.blocks) {
      if (block.type !== "table") continue;
      for (const row of block.rows) assert.ok(row.values.some((value) => value != null), `${item.number} ${row.label}`);
    }
  }
  assert.ok(document.checks.some((check) => check.label === "Note 4 aging buckets total 10,000, 2025" && check.ok));
  assert.ok(document.checks.some((check) => check.label === "Note 13 wages equal the face, 2026" && check.ok));
  const phrase = "Illustrative demo: fictitious entity";
  assert.equal(document.cover.lines.filter((line) => line.text === phrase).length, 1);
  assert.equal(JSON.stringify({ notes: document.notes, auditor: document.auditor }).includes(phrase), false);
});

test("another client cannot read a published set", () => {
  assert.equal(viewerCanReadAnnual({ id: 6, role: "client" }, 6), true);
  assert.equal(viewerCanReadAnnual({ id: 24, role: "client" }, 6), false);
  assert.equal(viewerCanReadAnnual({ id: 1, role: "admin" }, 6), true);
  assert.equal(viewerCanReadAnnual(null, 6), false);
});
