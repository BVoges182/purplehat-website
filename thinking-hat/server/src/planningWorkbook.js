import ExcelJS from "exceljs";
import { budgetPack, cashMonthPack, cashWeekPack, loadPlanning, variancePack } from "./planning.js";

const NAVY = "FF1F3864";
const TOTAL = "FFCCEEFF";
const NUM = "#,##0;(#,##0)";
const PCT = "0.0%";

const REVENUE = ["online_product_sales", "shipping_income", "returns_and_refunds"];
const COGS = ["product_purchases", "fulfilment_and_courier", "payment_processing_fees", "packaging"];
const OPEX = ["marketing", "software", "wages", "warehouse_rent", "insurance", "office"];
const PROFIT = new Set([...REVENUE, "net_revenue", "gross_profit", "net_income"]);

export const PLANNING_FILES = {
  budget: "PurpleHatDemo_Budget_FY2027.xlsx",
  variance: "PurpleHatDemo_BudgetVsActual_2026-12.xlsx",
  week: "PurpleHatDemo_CashForecast_13Week_2027-01-04.xlsx",
  month: "PurpleHatDemo_CashForecast_Monthly_FY2027.xlsx",
};

function book() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Purple Hat";
  return wb;
}

function letter(index) {
  let out = "";
  let value = index;
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function widths(sheet, list) {
  list.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function paintHeader(sheet) {
  const row = sheet.getRow(1);
  const last = Math.max(sheet.columnCount, row.cellCount);
  for (let column = 1; column <= last; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
    cell.alignment = { vertical: "bottom", wrapText: true };
  }
  row.height = 32;
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
}

function paintTotal(sheet, rowNumber) {
  const row = sheet.getRow(rowNumber);
  const last = Math.max(sheet.columnCount, row.cellCount);
  for (let column = 1; column <= last; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } };
    cell.font = { ...(cell.font || {}), bold: true, name: "Calibri", size: 11 };
  }
}

function numberCell(cell, value) {
  cell.value = value;
  cell.numFmt = NUM;
}

function formulaCell(cell, formula, format = NUM) {
  cell.value = { formula };
  cell.numFmt = format;
}

function addReadme(wb, lines) {
  const sheet = wb.addWorksheet("README");
  lines.forEach((line) => sheet.addRow([line]));
  sheet.getColumn(1).width = 118;
  return sheet;
}

function addMeta(wb, pairs) {
  const sheet = wb.addWorksheet("_meta");
  sheet.addRow(["key", "value"]);
  for (const [key, value] of pairs) sheet.addRow([key, value == null ? "" : String(value)]);
  paintHeader(sheet);
  widths(sheet, [28, 56]);
  return sheet;
}

function stamp() {
  return new Date().toISOString();
}

function sumFormula(key, rows, column) {
  const ref = (lineKey) => `${letter(column)}${rows[lineKey]}`;
  if (key === "net_revenue") return `SUM(${REVENUE.map(ref).join(",")})`;
  if (key === "cogs") return `SUM(${COGS.map(ref).join(",")})`;
  if (key === "opex") return `SUM(${OPEX.map(ref).join(",")})`;
  if (key === "gross_profit") return `SUM(${ref("net_revenue")},-${ref("cogs")})`;
  if (key === "net_income") return `SUM(${ref("gross_profit")},-${ref("opex")})`;
  return "0";
}

function addBudgetSheet(wb, name, doc, version) {
  const periods = doc.periods;
  const sheet = wb.addWorksheet(name);
  sheet.addRow(["line_key", "label", "row_type", ...periods, "FY"]);
  const rows = {};
  doc.lines.forEach((line) => {
    const row = sheet.addRow([line.key, line.label, line.rowType]);
    rows[line.key] = row.number;
  });
  for (const line of doc.lines) {
    const rowNumber = rows[line.key];
    const row = sheet.getRow(rowNumber);
    periods.forEach((period, index) => {
      const cell = row.getCell(4 + index);
      if (line.rowType === "input") numberCell(cell, version.monthly[period][line.key]);
      else formulaCell(cell, sumFormula(line.key, rows, 4 + index));
    });
    const fyColumn = 4 + periods.length;
    formulaCell(row.getCell(fyColumn), `SUM(${letter(4)}${rowNumber}:${letter(fyColumn - 1)}${rowNumber})`);
    if (line.rowType === "total") paintTotal(sheet, rowNumber);
  }
  paintHeader(sheet);
  widths(sheet, [28, 36, 12, ...periods.map(() => 12), 14]);
}

function addKeyValue(wb, name, headers, records) {
  const sheet = wb.addWorksheet(name);
  sheet.addRow(headers);
  for (const record of records) sheet.addRow(record);
  paintHeader(sheet);
  widths(sheet, headers.map((header, index) => (index < 2 ? 32 : 18)));
  return sheet;
}

export async function buildBudgetWorkbook(entityKey = "purple-hat-demo") {
  const planning = loadPlanning(entityKey);
  const doc = planning.budget2027;
  const pack = budgetPack(entityKey);
  const wb = book();
  addReadme(wb, [
    "Purple Hat Demo LLC — FY2027 budget workbook.",
    "Demo data, illustrative except where marked REAL.",
    `Entity: ${doc.entity}. Currency: ${doc.currency}.`,
    "Edit the input rows on Budget_v1 and Budget_Q1RF. Leave total rows and the FY column alone: they are formulas.",
    "Column A is the stable line_key. Period columns use YYYY-MM.",
    "Drivers and Versions describe how the budget was prepared. A later admin upload reads this same shape.",
    "REAL: FY2026 actuals named in the Drivers sheet. Everything for FY2027 is illustrative.",
  ]);
  const drivers = doc.drivers;
  addKeyValue(wb, "Drivers", ["line_key", "label", "row_type", "fy2026", "fy2027"], [
    ["revenue_growth_pct", "Revenue growth %", "input", "", drivers.revenueGrowthPct],
    ["seasonality", "Seasonality", "input", "Jul-Dec 2026 actual curve", drivers.seasonality],
    ["gross_margin_pct", "Gross margin %", "input", drivers.fy2026Actual.grossMarginPct, drivers.fy2026Actual.grossMarginPct],
    ["marketing_pct", "Marketing % of revenue", "input", drivers.fy2026Actual.marketingPctOfRevenue, drivers.marketingPctOfRevenue],
    ["target_roas", "Target ROAS", "input", "", drivers.targetROAS],
    ["wages_monthly", "Wages, monthly", "input", "", drivers.wagesMonthly],
    ["wages_monthly_oct_dec", "Wages, Oct-Dec", "input", "", drivers.wagesMonthlyOctDec],
    ["returns_pct", "Returns % of sales", "input", "", drivers.returnsPctOfSales],
    ["product_cost_pct", "Product cost % of sales", "input", "", drivers.productCostPctOfSales],
    ["fulfilment_pct", "Fulfilment % of sales", "input", "", drivers.fulfilmentPctOfSales],
    ["card_fees_pct", "Card fees % of sales", "input", "", drivers.cardFeesPctOfSales],
    ["packaging_pct", "Packaging % of sales", "input", "", drivers.packagingPctOfSales],
    ["shipping_income_pct", "Shipping income % of sales", "input", "", drivers.shippingIncomePctOfSales],
    ["fy2026_net_revenue", "FY2026 net revenue (REAL)", "input", drivers.fy2026Actual.netRevenue, ""],
    ["fy2026_net_income", "FY2026 net income (REAL)", "input", drivers.fy2026Actual.netIncome, ""],
  ]);
  addKeyValue(wb, "Versions", ["line_key", "label", "row_type", "status", "locked", "prepared_by", "prepared_at", "reviewed_by", "reviewed_at", "approved_by", "approved_at"], [
    ...pack.versions.map((version) => [
      version.id,
      version.label,
      "input",
      version.status,
      version.locked ? "yes" : "no",
      version.preparedBy || "",
      version.preparedAt || "",
      version.reviewedBy || "",
      version.reviewedAt || "",
      version.approvedBy || "",
      version.approvedAt || "",
    ]),
  ]);
  for (const version of doc.versions) {
    const sheetName = version.id === "fy2027-v1" ? "Budget_v1" : "Budget_Q1RF";
    addBudgetSheet(wb, sheetName, doc, version);
  }
  addMeta(wb, [
    ["schema_version", 1],
    ["type", "budget"],
    ["entity", doc.entity],
    ["fiscal_year", doc.fiscalYear],
    ["version_id", "fy2027-v1"],
    ["exported_at", stamp()],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function varianceSheet(wb, name, rows, reasons) {
  const sheet = wb.addWorksheet(name);
  sheet.addRow(["line_key", "label", "row_type", "actual", "budget", "var_usd", "var_pct", "rag", "reason"]);
  const rowByKey = {};
  const groups = {
    net_revenue: REVENUE,
    cogs: COGS,
    opex: OPEX,
  };
  for (const row of rows) {
    const added = sheet.addRow([row.key, row.label, row.rowType]);
    rowByKey[row.key] = added.number;
  }
  for (const row of rows) {
    const rowNumber = rowByKey[row.key];
    const excelRow = sheet.getRow(rowNumber);
    if (row.rowType === "input") {
      numberCell(excelRow.getCell(4), row.actual);
      numberCell(excelRow.getCell(5), row.budget);
    } else if (groups[row.key]) {
      const parts = groups[row.key].map((key) => rowByKey[key]);
      formulaCell(excelRow.getCell(4), `SUM(${parts.map((n) => `D${n}`).join(",")})`);
      formulaCell(excelRow.getCell(5), `SUM(${parts.map((n) => `E${n}`).join(",")})`);
    } else if (row.key === "gross_profit") {
      formulaCell(excelRow.getCell(4), `SUM(D${rowByKey.net_revenue},-D${rowByKey.cogs})`);
      formulaCell(excelRow.getCell(5), `SUM(E${rowByKey.net_revenue},-E${rowByKey.cogs})`);
    } else if (row.key === "net_income") {
      formulaCell(excelRow.getCell(4), `SUM(D${rowByKey.gross_profit},-D${rowByKey.opex})`);
      formulaCell(excelRow.getCell(5), `SUM(E${rowByKey.gross_profit},-E${rowByKey.opex})`);
    }
    const change = PROFIT.has(row.key)
      ? `D${rowNumber}-E${rowNumber}`
      : `E${rowNumber}-D${rowNumber}`;
    formulaCell(excelRow.getCell(6), change);
    formulaCell(excelRow.getCell(7), `IF(E${rowNumber}=0,0,F${rowNumber}/ABS(E${rowNumber}))`, PCT);
    excelRow.getCell(8).value = row.rag;
    excelRow.getCell(9).value = reasons[row.key] || "";
    if (row.rowType === "total") paintTotal(sheet, rowNumber);
  }
  paintHeader(sheet);
  widths(sheet, [28, 36, 12, 14, 14, 14, 12, 12, 56]);
}

export async function buildVarianceWorkbook(entityKey = "purple-hat-demo") {
  const pack = variancePack(entityKey);
  const commentary = loadPlanning(entityKey).commentary;
  const wb = book();
  addReadme(wb, [
    "Purple Hat Demo LLC — budget versus actual for December 2026.",
    "Demo data, illustrative except where marked REAL.",
    `Entity: ${pack.entity}. Period: ${pack.period}. Budget version: ${pack.budgetVersion.id}.`,
    "REAL: December 2026 actuals and the FY2026 year-to-date actuals.",
    "Illustrative: the FY2026 v2 budget, RAG thresholds, and the commentary draft.",
    "Edit actual, budget, and reason on input rows. Total rows and the variance columns are formulas.",
    "A positive variance is favourable. Revenue uses actual minus budget. Costs use budget minus actual.",
  ]);
  varianceSheet(wb, "BvA_Month", pack.month.rows, commentary.lineReasons || {});
  varianceSheet(wb, "BvA_YTD", pack.ytd.rows, {});
  addKeyValue(wb, "Thresholds", ["line_key", "label", "row_type", "value"], [
    ["green_max_abs_pct", "Green when absolute variance is at or under this percent", "input", pack.thresholds.green.maxAbsPct],
    ["green_or_abs_amount_below", "Green when absolute variance is under this amount", "input", pack.thresholds.green.orAbsAmountBelow],
    ["amber_max_abs_pct", "Amber up to this percent", "input", pack.thresholds.amber.maxAbsPct],
    ["red_min_abs_pct", "Red above this percent", "input", pack.thresholds.red.minAbsPct],
    ["red_and_abs_amount_above", "Red only when the amount is also above this", "input", pack.thresholds.red.andAbsAmountAbove],
    ["favourable_is_green", "A favourable variance is green", "input", pack.thresholds.favourableIsGreen ? "yes" : "no"],
  ]);
  addKeyValue(wb, "Commentary", ["line_key", "label", "row_type", "text"], commentary.paragraphs.map((item) => [
    item.heading.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    item.heading,
    "input",
    item.text,
  ]));
  addMeta(wb, [
    ["schema_version", 1],
    ["type", "budget-vs-actual"],
    ["entity", pack.entity],
    ["period", pack.period],
    ["version_id", pack.budgetVersion.id],
    ["exported_at", stamp()],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function buildWeekWorkbook(entityKey = "purple-hat-demo") {
  const planning = loadPlanning(entityKey);
  const cash = planning.cash13;
  const pack = cashWeekPack(entityKey, "base");
  const wb = book();
  addReadme(wb, [
    "Purple Hat Demo LLC — 13-week direct cash forecast.",
    "Demo data, illustrative except where marked REAL.",
    `Entity: ${cash.entity}. Opens ${cash.openingDate}.`,
    "REAL: opening bank, and the December receivable and payable ageing by name.",
    "Illustrative: 2027 receipts, payments, timing, and the three scenarios.",
    "Edit input rows on Weekly, AR_Opening, and AP_Opening. Total rows and the 13-week total column are formulas.",
    "Week columns are headed with the Monday they start.",
  ]);
  addKeyValue(wb, "Assumptions", ["line_key", "label", "row_type", "value"], [
    ["opening_cash", "Opening bank (REAL)", "input", cash.openingCash],
    ["minimum_cash", "Minimum cash", "input", cash.minimumCash],
    ["card_sales_factor_base", "Card sales factor, base", "input", cash.scenarios.base.cardSalesFactor],
    ["restock_factor_base", "Restock factor, base", "input", cash.scenarios.base.restockFactor],
    ["card_sales_factor_downside", "Card sales factor, downside", "input", cash.scenarios.downside.cardSalesFactor],
    ["restock_factor_downside", "Restock factor, downside", "input", cash.scenarios.downside.restockFactor],
    ["card_sales_factor_upside", "Card sales factor, upside", "input", cash.scenarios.upside.cardSalesFactor],
    ["restock_factor_upside", "Restock factor, upside", "input", cash.scenarios.upside.restockFactor],
    ...cash.assumptions.map((text, index) => [`assumption_${index + 1}`, text, "input", text]),
  ]);
  const weekly = wb.addWorksheet("Weekly");
  weekly.addRow(["line_key", "label", "row_type", "direction", ...cash.weekStarts, "total"]);
  const receiptRows = [];
  const paymentRows = [];
  for (const line of cash.lines) {
    const row = weekly.addRow([line.key, line.label, "input", line.direction, ...line.weekly]);
    const totalColumn = 5 + cash.weekStarts.length;
    formulaCell(row.getCell(totalColumn), `SUM(E${row.number}:${letter(totalColumn - 1)}${row.number})`);
    for (let index = 0; index < cash.weekStarts.length; index += 1) row.getCell(5 + index).numFmt = NUM;
    if (line.direction === "receipt") receiptRows.push(row.number);
    else paymentRows.push(row.number);
  }
  const receiptTotal = weekly.addRow(["total_receipts", "Total receipts", "total", "receipt"]);
  const paymentTotal = weekly.addRow(["total_payments", "Total payments", "total", "payment"]);
  const totalColumn = 5 + cash.weekStarts.length;
  for (let column = 5; column <= totalColumn; column += 1) {
    formulaCell(receiptTotal.getCell(column), `SUM(${receiptRows.map((row) => `${letter(column)}${row}`).join(",")})`);
    formulaCell(paymentTotal.getCell(column), `SUM(${paymentRows.map((row) => `${letter(column)}${row}`).join(",")})`);
  }
  paintTotal(weekly, receiptTotal.number);
  paintTotal(weekly, paymentTotal.number);
  paintHeader(weekly);
  widths(weekly, [24, 36, 12, 14, ...cash.weekStarts.map(() => 14), 14]);

  const position = wb.addWorksheet("Cash_Position");
  position.addRow(["line_key", "label", "row_type", "scenario", ...cash.weekStarts, "total"]);
  for (const key of ["base", "downside", "upside"]) {
    const scenario = pack.positions[key];
    const specs = [
      ["opening", "Opening", scenario.weeks.map((week) => week.opening)],
      ["net", "Net", scenario.weeks.map((week) => week.net)],
      ["closing", "Closing", scenario.weeks.map((week) => week.closing)],
      ["headroom", "Headroom", scenario.weeks.map((week) => week.headroom)],
    ];
    for (const [suffix, label, values] of specs) {
      const row = position.addRow([`${suffix}_${key}`, label, "total", key, ...values]);
      for (let index = 0; index < values.length; index += 1) row.getCell(5 + index).numFmt = NUM;
      formulaCell(row.getCell(5 + values.length), `SUM(E${row.number}:${letter(4 + values.length)}${row.number})`);
      paintTotal(position, row.number);
    }
  }
  paintHeader(position);
  widths(position, [24, 18, 12, 14, ...cash.weekStarts.map(() => 14), 14]);

  function ageingSheet(sheetName, ageing) {
    const sheet = wb.addWorksheet(sheetName);
    sheet.addRow(["line_key", "label", "row_type", "current", "30", "60", "90", "total"]);
    const numbers = [];
    for (const [name, buckets] of Object.entries(ageing.rows)) {
      const row = sheet.addRow([slug(name), name, "input", buckets.current, buckets["30"], buckets["60"], buckets["90"]]);
      formulaCell(row.getCell(8), `SUM(D${row.number}:G${row.number})`);
      for (const column of [4, 5, 6, 7]) row.getCell(column).numFmt = NUM;
      numbers.push(row.number);
    }
    const total = sheet.addRow(["total", "Total", "total"]);
    for (const column of [4, 5, 6, 7, 8]) {
      formulaCell(total.getCell(column), `SUM(${numbers.map((row) => `${letter(column)}${row}`).join(",")})`);
    }
    paintTotal(sheet, total.number);
    paintHeader(sheet);
    widths(sheet, [28, 28, 12, 14, 12, 12, 12, 14]);
  }
  ageingSheet("AR_Opening", cash.arAgingOpening);
  ageingSheet("AP_Opening", cash.apAgingOpening);
  addKeyValue(wb, "Risks", ["line_key", "label", "row_type", "tone", "detail"], [
    ...cash.risks.map((item, index) => [`risk_${index + 1}`, item.title, "input", item.tone, item.detail]),
    ...cash.opportunities.map((item, index) => [`opportunity_${index + 1}`, item.title, "input", item.tone, item.detail]),
  ]);
  addMeta(wb, [
    ["schema_version", 1],
    ["type", "cash-13-week"],
    ["entity", cash.entity],
    ["period", cash.weekStarts[0]],
    ["version_id", "base"],
    ["exported_at", stamp()],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildMonthWorkbook(entityKey = "purple-hat-demo") {
  const planning = loadPlanning(entityKey);
  const doc = planning.cashMonthly;
  const pack = cashMonthPack(entityKey);
  const wb = book();
  addReadme(wb, [
    "Purple Hat Demo LLC — FY2027 monthly indirect cash forecast.",
    "Demo data, illustrative except where marked REAL.",
    `Entity: ${doc.entity}. Budget: ${doc.basedOnBudget}.`,
    "REAL: July to December 2026 closing cash, and the 31 December 2026 opening bank.",
    "Illustrative: the FY2027 bridge, working-capital movements, capex, and drawings.",
    "Edit input rows on Bridge. Opening, closing, and the FY column are formulas.",
    "TieOut_13Week compares this forecast with the 13-week month ends for January, February, and March.",
  ]);
  addKeyValue(wb, "Assumptions", ["line_key", "label", "row_type", "value"], [
    ["opening_cash", "Opening bank 31 Dec 2026 (REAL)", "input", doc.openingCash],
    ["minimum_cash", "Minimum cash", "input", doc.minimumCash],
    ["gross_margin_pct", "Gross margin %", "input", doc.assumptions.grossMarginPct],
    ["marketing_pct", "Marketing % of revenue", "input", doc.assumptions.marketingPctOfRevenue],
    ["receivables_pct", "Receivables % of month revenue", "input", doc.assumptions.receivablesPctOfMonthRevenue],
    ["payables_pct", "Payables % of month revenue", "input", doc.assumptions.payablesPctOfMonthRevenue],
    ["capex", "Capital expenditure", "input", doc.assumptions.capex],
    ["drawings_monthly", "Drawings, monthly", "input", doc.assumptions.drawingsMonthly],
    ["based_on_budget", "Budget version", "input", doc.basedOnBudget],
  ]);
  const bridge = wb.addWorksheet("Bridge");
  bridge.addRow(["line_key", "label", "row_type", ...doc.periods, "FY"]);
  const rowByKey = {};
  for (const row of pack.rows) {
    const added = bridge.addRow([row.key, row.label, row.key === "netCashFlow" ? "input" : row.rowType]);
    rowByKey[row.key] = added.number;
  }
  const inputKeys = new Set(["netRevenue", "netIncome", "changeReceivables", "changeInventory", "changePayables", "capex", "drawings", "netCashFlow"]);
  for (const row of pack.rows) {
    const rowNumber = rowByKey[row.key];
    const excelRow = bridge.getRow(rowNumber);
    doc.periods.forEach((period, index) => {
      const cell = excelRow.getCell(4 + index);
      if (inputKeys.has(row.key)) numberCell(cell, doc.rows[row.key][index]);
    });
    const fyColumn = 4 + doc.periods.length;
    if (row.key !== "opening" && row.key !== "closing") {
      formulaCell(excelRow.getCell(fyColumn), `SUM(${letter(4)}${rowNumber}:${letter(fyColumn - 1)}${rowNumber})`);
    }
  }
  const openingRow = rowByKey.opening;
  const closingRow = rowByKey.closing;
  const netRow = rowByKey.netCashFlow;
  doc.periods.forEach((_, index) => {
    const column = 4 + index;
    const openingCell = bridge.getRow(openingRow).getCell(column);
    const closingCell = bridge.getRow(closingRow).getCell(column);
    if (index === 0) numberCell(openingCell, doc.openingCash);
    else formulaCell(openingCell, `${letter(column - 1)}${closingRow}`);
    formulaCell(closingCell, `${letter(column)}${openingRow}+${letter(column)}${netRow}`);
  });
  formulaCell(bridge.getRow(openingRow).getCell(4 + doc.periods.length), `SUM(${letter(4)}${openingRow}:${letter(3 + doc.periods.length)}${openingRow})`);
  formulaCell(bridge.getRow(closingRow).getCell(4 + doc.periods.length), `SUM(${letter(4)}${closingRow}:${letter(3 + doc.periods.length)}${closingRow})`);
  paintTotal(bridge, openingRow);
  paintTotal(bridge, closingRow);
  paintTotal(bridge, netRow);
  paintHeader(bridge);
  widths(bridge, [28, 48, 12, ...doc.periods.map(() => 12), 14]);

  const actual = wb.addWorksheet("Actual_2026");
  const months = Object.keys(doc.actualClosingCash2026);
  actual.addRow(["line_key", "label", "row_type", ...months]);
  const actualRow = actual.addRow(["closing_cash", "Closing cash (REAL)", "input", ...months.map((month) => doc.actualClosingCash2026[month])]);
  for (let index = 0; index < months.length; index += 1) actualRow.getCell(4 + index).numFmt = NUM;
  paintHeader(actual);
  widths(actual, [24, 28, 12, ...months.map(() => 14)]);

  const tie = wb.addWorksheet("TieOut_13Week");
  tie.addRow(["line_key", "label", "row_type", "2027-01", "2027-02", "2027-03"]);
  const monthlyRow = tie.addRow(["monthly_closing", "Monthly closing", "total"]);
  const weekRow = tie.addRow(["forecast_13week", "13-week forecast, month end", "input", ...pack.tieOut.map((item) => item.weekForecast)]);
  const diffRow = tie.addRow(["difference", "Difference (timing)", "total"]);
  pack.tieOut.forEach((item, index) => {
    const column = 4 + index;
    const bridgeColumn = 4 + doc.periods.indexOf(item.period);
    formulaCell(monthlyRow.getCell(column), `Bridge!${letter(bridgeColumn)}${closingRow}`);
    weekRow.getCell(column).numFmt = NUM;
    formulaCell(diffRow.getCell(column), `${letter(column)}${monthlyRow.number}-${letter(column)}${weekRow.number}`);
  });
  paintTotal(tie, monthlyRow.number);
  paintTotal(tie, diffRow.number);
  paintHeader(tie);
  widths(tie, [24, 36, 12, 14, 14, 14]);
  addMeta(wb, [
    ["schema_version", 1],
    ["type", "cash-monthly"],
    ["entity", doc.entity],
    ["fiscal_year", doc.fiscalYear],
    ["version_id", doc.basedOnBudget],
    ["exported_at", stamp()],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
