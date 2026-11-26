import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { PLANNING_FILES, buildBudgetWorkbook, buildMonthWorkbook, buildVarianceWorkbook, buildWeekWorkbook } from "./planningWorkbook.js";

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "planning", "purple-hat-demo");

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(seedDir, name), "utf8"));
}

async function openBook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function headerMap(sheet) {
  const map = {};
  sheet.getRow(1).eachCell((cell, column) => {
    map[String(cell.value)] = column;
  });
  return map;
}

function plain(value) {
  if (value && typeof value === "object" && "formula" in value) return { formula: value.formula };
  return value;
}

function meta(workbook) {
  const sheet = workbook.getWorksheet("_meta");
  const pairs = {};
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    pairs[String(row.getCell(1).value)] = String(row.getCell(2).value ?? "");
  });
  return pairs;
}

function assertDataSheet(sheet) {
  assert.deepEqual(sheet.model.merges || [], [], `${sheet.name} has merged cells`);
  const view = sheet.views[0];
  assert.equal(view.state, "frozen", sheet.name);
  assert.equal(view.xSplit, 2, sheet.name);
  assert.equal(view.ySplit, 1, sheet.name);
  assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb, "FF1F3864", sheet.name);
  assert.equal(sheet.getRow(1).getCell(1).font.color.argb, "FFFFFFFF", sheet.name);
}

function rowsByKey(sheet) {
  const headers = headerMap(sheet);
  const rows = {};
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const key = String(row.getCell(headers.line_key).value || "");
    if (key) rows[key] = row;
  });
  return { headers, rows };
}

test("budget workbook round-trips the input cells and formulas the totals", async () => {
  const doc = readSeed("budget-fy2027.json");
  const workbook = await openBook(await buildBudgetWorkbook());
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["README", "Drivers", "Versions", "Budget_v1", "Budget_Q1RF", "_meta"]);
  assert.match(String(workbook.getWorksheet("README").getRow(2).getCell(1).value), /Demo data, illustrative except where marked REAL/);
  const pairs = meta(workbook);
  assert.equal(pairs.schema_version, "1");
  assert.equal(pairs.type, "budget");
  assert.equal(pairs.entity, doc.entity);
  assert.equal(pairs.fiscal_year, String(doc.fiscalYear));
  assert.equal(pairs.version_id, "fy2027-v1");
  assert.ok(pairs.exported_at);

  const sheets = { "Budget_v1": "fy2027-v1", "Budget_Q1RF": "fy2027-q1-rf" };
  for (const [name, versionId] of Object.entries(sheets)) {
    const sheet = workbook.getWorksheet(name);
    assertDataSheet(sheet);
    const version = doc.versions.find((item) => item.id === versionId);
    const { headers, rows } = rowsByKey(sheet);
    assert.deepEqual(Object.keys(headers).slice(0, 3), ["line_key", "label", "row_type"]);
    assert.equal(headers.FY, 16);
    for (const line of doc.lines) {
      const row = rows[line.key];
      assert.equal(String(row.getCell(headers.row_type).value), line.rowType);
      for (const period of doc.periods) {
        const cell = row.getCell(headers[period]);
        if (line.rowType === "input") {
          assert.equal(cell.value, version.monthly[period][line.key], `${name} ${line.key} ${period}`);
          assert.equal(cell.numFmt, "#,##0;(#,##0)");
        } else {
          assert.equal(typeof plain(cell.value).formula, "string", `${name} ${line.key}`);
          assert.equal(row.getCell(1).fill.fgColor.argb, "FFCCEEFF");
        }
      }
      assert.equal(typeof plain(row.getCell(headers.FY).value).formula, "string");
    }
  }
  assert.equal(workbook.getWorksheet("Drivers").getRow(2).getCell(1).value, "revenue_growth_pct");
  assert.equal(PLANNING_FILES.budget, "PurpleHatDemo_Budget_FY2027.xlsx");
});

test("budget versus actual workbook keeps actuals, budgets, and reasons", async () => {
  const budget = readSeed("budget-fy2026.json");
  const commentary = readSeed("commentary-2026-12.json");
  const workbook = await openBook(await buildVarianceWorkbook());
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["README", "BvA_Month", "BvA_YTD", "Thresholds", "Commentary", "_meta"]);
  const pairs = meta(workbook);
  assert.equal(pairs.schema_version, "1");
  assert.equal(pairs.type, "budget-vs-actual");
  assert.equal(pairs.period, "2026-12");
  assert.equal(pairs.version_id, "fy2026-v2");
  const version = budget.versions[0];
  const sheets = {
    BvA_Month: budget.actuals.monthActual,
    BvA_YTD: budget.actuals.ytdActual,
  };
  const budgetMaps = {
    BvA_Month: version.monthly["2026-12"],
    BvA_YTD: version.ytdThrough["2026-12"],
  };
  for (const [name, actuals] of Object.entries(sheets)) {
    const sheet = workbook.getWorksheet(name);
    assertDataSheet(sheet);
    const { headers, rows } = rowsByKey(sheet);
    assert.deepEqual(
      ["line_key", "label", "row_type", "actual", "budget", "var_usd", "var_pct", "rag", "reason"].map((key) => headers[key]),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    for (const line of budget.lines.filter((item) => item.rowType === "input")) {
      const row = rows[line.key];
      assert.equal(row.getCell(headers.actual).value, actuals[line.key], `${name} ${line.key} actual`);
      assert.equal(row.getCell(headers.budget).value, budgetMaps[name][line.key], `${name} ${line.key} budget`);
      assert.equal(typeof plain(row.getCell(headers.var_usd).value).formula, "string");
      assert.equal(row.getCell(headers.var_pct).numFmt, "0.0%");
    }
    assert.equal(typeof plain(rows.net_revenue.getCell(headers.actual).value).formula, "string");
  }
  const month = rowsByKey(workbook.getWorksheet("BvA_Month"));
  assert.equal(month.rows.online_product_sales.getCell(month.headers.reason).value, commentary.lineReasons.online_product_sales);
  assert.equal(workbook.getWorksheet("Commentary").getRow(2).getCell(2).value, commentary.paragraphs[0].heading);
});

test("13-week workbook stores the unscaled seed and all three cash positions", async () => {
  const cash = readSeed("cash-13week-2027-01-04.json");
  const workbook = await openBook(await buildWeekWorkbook());
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["README", "Assumptions", "Weekly", "Cash_Position", "AR_Opening", "AP_Opening", "Risks", "_meta"],
  );
  const pairs = meta(workbook);
  assert.equal(pairs.type, "cash-13-week");
  assert.equal(pairs.period, "2027-01-04");
  assert.equal(pairs.schema_version, "1");
  const weekly = workbook.getWorksheet("Weekly");
  assertDataSheet(weekly);
  const { headers, rows } = rowsByKey(weekly);
  assert.equal(headers[cash.weekStarts[0]], 5);
  assert.equal(headers.total, 18);
  for (const line of cash.lines) {
    const row = rows[line.key];
    assert.equal(String(row.getCell(headers.row_type).value), "input");
    cash.weekStarts.forEach((start, index) => {
      assert.equal(row.getCell(headers[start]).value, line.weekly[index], `${line.key} ${start}`);
    });
    assert.equal(typeof plain(row.getCell(headers.total).value).formula, "string");
  }
  assert.equal(typeof plain(rows.total_receipts.getCell(5).value).formula, "string");
  const position = rowsByKey(workbook.getWorksheet("Cash_Position"));
  assert.equal(position.rows.closing_base.getCell(position.headers["2027-03-29"]).value, 58930);
  assert.equal(position.rows.closing_downside.getCell(position.headers["2027-03-15"]).value, 39139);
  assert.equal(position.rows.closing_upside.getCell(position.headers["2027-03-29"]).value, 65566);
  const ar = rowsByKey(workbook.getWorksheet("AR_Opening"));
  assert.equal(ar.rows.northwind_buyers.getCell(ar.headers.current).value, 4200);
  assert.equal(typeof plain(ar.rows.total.getCell(ar.headers.total).value).formula, "string");
  assert.equal(PLANNING_FILES.week, "PurpleHatDemo_CashForecast_13Week_2027-01-04.xlsx");
});

test("monthly workbook round-trips the published net movement and the tie-out", async () => {
  const doc = readSeed("cash-monthly-fy2027.json");
  const workbook = await openBook(await buildMonthWorkbook());
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["README", "Assumptions", "Bridge", "Actual_2026", "TieOut_13Week", "_meta"],
  );
  const pairs = meta(workbook);
  assert.equal(pairs.type, "cash-monthly");
  assert.equal(pairs.fiscal_year, "2027");
  assert.equal(pairs.version_id, "fy2027-v1");
  const bridge = workbook.getWorksheet("Bridge");
  assertDataSheet(bridge);
  const { headers, rows } = rowsByKey(bridge);
  assert.equal(headers.line_key, 1);
  assert.equal(String(rows.netCashFlow.getCell(headers.row_type).value), "input");
  doc.periods.forEach((period, index) => {
    assert.equal(rows.netCashFlow.getCell(headers[period]).value, doc.rows.netCashFlow[index], period);
    assert.equal(rows.netRevenue.getCell(headers[period]).value, doc.rows.netRevenue[index]);
  });
  assert.equal(rows.opening.getCell(headers["2027-01"]).value, doc.openingCash);
  assert.equal(typeof plain(rows.opening.getCell(headers["2027-02"]).value).formula, "string");
  assert.equal(typeof plain(rows.closing.getCell(headers["2027-10"]).value).formula, "string");
  assert.equal(typeof plain(rows.netIncome.getCell(headers.FY).value).formula, "string");
  const actual = rowsByKey(workbook.getWorksheet("Actual_2026"));
  assert.equal(actual.rows.closing_cash.getCell(actual.headers["2026-12"]).value, 71970);
  assert.equal(actual.rows.closing_cash.getCell(actual.headers["2026-07"]).value, 68190);
  const tie = rowsByKey(workbook.getWorksheet("TieOut_13Week"));
  assert.deepEqual(
    ["2027-01", "2027-02", "2027-03"].map((period) => tie.rows.forecast_13week.getCell(tie.headers[period]).value),
    [84050, 78780, 58930],
  );
  assert.equal(typeof plain(tie.rows.difference.getCell(tie.headers["2027-01"]).value).formula, "string");
  assert.equal(PLANNING_FILES.month, "PurpleHatDemo_CashForecast_Monthly_FY2027.xlsx");
});
