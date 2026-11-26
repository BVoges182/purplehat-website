import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function purpleHatDemoBusiness(name) {
  return /purple\s*hat\s*demo/i.test(String(name || ""));
}

const seedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "planning");

const ENTITY_FILES = {
  "purple-hat-demo": [
    "budget-fy2026.json",
    "budget-fy2027.json",
    "cash-13week-2027-01-04.json",
    "cash-monthly-fy2027.json",
    "commentary-2026-12.json",
  ],
};

const REVENUE = ["online_product_sales", "shipping_income", "returns_and_refunds"];
const COGS = ["product_purchases", "fulfilment_and_courier", "payment_processing_fees", "packaging"];
const OPEX = ["marketing", "software", "wages", "warehouse_rent", "insurance", "office"];
const OTHER_FIXED = ["software", "warehouse_rent", "insurance", "office"];
const PROFIT = new Set([...REVENUE, "net_revenue", "gross_profit", "net_income"]);

const cache = new Map();

function fail(message) {
  const error = new Error(message);
  error.status = 500;
  throw error;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readJson(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) fail(`Planning file is missing: ${name}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail(`Planning file is not valid JSON: ${name}`);
  }
}

function requireKeys(doc, name, keys) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) fail(`${name} is not a planning document`);
  if (doc.schemaVersion !== 1) fail(`${name} schemaVersion must be 1`);
  if (doc.demoOnly !== true) fail(`${name} must be demo only`);
  for (const key of keys) {
    if (doc[key] == null) fail(`${name} is missing ${key}`);
  }
}

function sumKeys(values, keys) {
  return keys.reduce((total, key) => total + num(values[key]), 0);
}

export function recalcTotals(lines, values) {
  const source = values && typeof values === "object" ? values : {};
  const catalog = Array.isArray(lines) ? lines : null;
  const inputKeys = catalog
    ? catalog.filter((line) => line && line.rowType === "input").map((line) => line.key)
    : [...REVENUE, ...COGS, ...OPEX];
  const out = {};
  for (const key of inputKeys) out[key] = num(source[key]);
  out.net_revenue = sumKeys(out, REVENUE);
  out.cogs = sumKeys(out, COGS);
  out.gross_profit = out.net_revenue - out.cogs;
  out.opex = sumKeys(out, OPEX);
  out.net_income = out.gross_profit - out.opex;
  return out;
}

export function variance(lineKey, actual, budget) {
  const left = num(actual);
  const right = num(budget);
  const dollars = PROFIT.has(lineKey) ? left - right : right - left;
  const base = Math.abs(right);
  const pct = base === 0 ? (dollars === 0 ? 0 : null) : dollars / base;
  return { dollars, pct };
}

function asRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 1 ? n / 100 : n;
}

export function ragFor(varDollars, varPct) {
  const dollars = num(varDollars);
  const pct = varPct == null || !Number.isFinite(Number(varPct)) ? null : Number(varPct);
  const absPct = pct == null ? Number.POSITIVE_INFINITY : Math.abs(pct);
  const absDollars = Math.abs(dollars);
  if (dollars > 0 || absPct <= 0.02 || absDollars < 500) return "green";
  if (absPct > 0.05 && absDollars > 1000) return "red";
  return "amber";
}

export function headroom(closing, min) {
  return num(closing) - num(min);
}

function roundHalfEven(value) {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const floor = Math.floor(abs + 1e-9);
  const frac = abs - floor;
  if (Math.abs(frac - 0.5) < 1e-6) return sign * (floor % 2 === 0 ? floor : floor + 1);
  return sign * Math.round(abs);
}

function scaledExact(line, amount, scenario) {
  let value = num(amount);
  if (line.key === "card") value *= num(scenario.cardSalesFactor);
  if (line.key === "summit") value *= num(scenario.restockFactor);
  return value;
}

export function cashPosition(cash13, scenario) {
  const key = scenario || "base";
  const spec = cash13?.scenarios?.[key];
  if (!spec) fail(`Unknown cash scenario: ${key}`);
  const starts = cash13.weekStarts || [];
  let exact = num(cash13.openingCash);
  const weeks = starts.map((start, index) => {
    let receipts = 0;
    let payments = 0;
    for (const line of cash13.lines) {
      const amount = scaledExact(line, line.weekly?.[index], spec);
      if (line.direction === "receipt") receipts += amount;
      else payments += amount;
    }
    const opening = roundHalfEven(exact);
    exact += receipts - payments;
    const closing = roundHalfEven(exact);
    return {
      start,
      week: index + 1,
      opening,
      receipts: roundHalfEven(receipts),
      payments: roundHalfEven(payments),
      net: closing - opening,
      closing,
      headroom: headroom(closing, cash13.minimumCash),
    };
  });
  const low = weeks.reduce((best, row) => (row.closing < best.closing ? row : best), weeks[0]);
  return {
    scenario: key,
    label: spec.label || key,
    openingCash: num(cash13.openingCash),
    minimumCash: num(cash13.minimumCash),
    weeks,
    week13Closing: weeks.length ? weeks[weeks.length - 1].closing : null,
    low: low
      ? { amount: low.closing, week: low.week, start: low.start, headroom: low.headroom }
      : null,
  };
}

export function isPlanningClient(user) {
  if (!user) return false;
  const template = user.report_template ?? user.reportTemplate;
  if (template === "purple-hat-demo") return true;
  if (template === "wealth-tech") return false;
  return purpleHatDemoBusiness(user.business_name || user.businessName);
}

export function missingRedReasons(redLines, lineReasons) {
  const reasons = lineReasons && typeof lineReasons === "object" ? lineReasons : {};
  return (redLines || []).filter((line) => !String(reasons[line.key] || "").trim());
}

function periodsOf(doc, version) {
  if (Array.isArray(doc.periods) && doc.periods.length) return doc.periods;
  return Object.keys(version.monthly || {});
}

function recalculatedVersion(doc, version) {
  const periods = periodsOf(doc, version);
  const monthly = {};
  const summed = {};
  for (const period of periods) {
    if (!version.monthly?.[period]) continue;
    monthly[period] = recalcTotals(doc.lines, version.monthly[period]);
    for (const line of doc.lines) {
      if (line.rowType !== "input") continue;
      summed[line.key] = num(summed[line.key]) + monthly[period][line.key];
    }
  }
  const fullYear = Array.isArray(doc.periods) && doc.periods.length > 0 && doc.periods.every((period) => monthly[period]);
  const ytdThrough = {};
  for (const [period, values] of Object.entries(version.ytdThrough || {})) {
    ytdThrough[period] = recalcTotals(doc.lines, values);
  }
  return {
    ...version,
    monthly,
    ytdThrough,
    fyTotal: fullYear ? recalcTotals(doc.lines, summed) : null,
  };
}

function prepareBudget(doc) {
  return {
    ...doc,
    versions: (doc.versions || []).map((version) => recalculatedVersion(doc, version)),
    actuals: doc.actuals
      ? {
        ...doc.actuals,
        monthActual: recalcTotals(doc.lines, doc.actuals.monthActual),
        ytdActual: recalcTotals(doc.lines, doc.actuals.ytdActual),
      }
      : null,
  };
}

function prepareMonthly(doc) {
  const count = doc.periods.length;
  // Roll the published net movement. October's parts are $1 away from that
  // movement; the published net is what ties to the 38,092 and 68,841 closings.
  const net = (doc.rows.netCashFlow || []).slice(0, count).map(num);
  const opening = [];
  const closing = [];
  let open = num(doc.openingCash);
  for (let index = 0; index < count; index += 1) {
    const close = open + num(net[index]);
    opening.push(open);
    closing.push(close);
    open = close;
  }
  return {
    ...doc,
    rows: {
      ...doc.rows,
      netCashFlow: net,
      opening,
      closing,
    },
  };
}

function validateCashWeeks(doc, name) {
  const count = doc.weekStarts.length;
  for (const line of doc.lines) {
    if (!Array.isArray(line.weekly) || line.weekly.length !== count) fail(`${name} line ${line.key} does not cover every week`);
  }
  for (const key of ["base", "downside", "upside"]) {
    if (!doc.scenarios?.[key]) fail(`${name} is missing the ${key} scenario`);
  }
}

export function loadPlanning(entityKey) {
  const key = String(entityKey || "");
  if (!ENTITY_FILES[key]) fail("Unknown planning entity.");
  if (cache.has(key)) return cache.get(key);
  const dir = path.join(seedRoot, key);
  const names = ENTITY_FILES[key];
  const budget2026 = prepareBudget(readJson(dir, names[0]));
  const budget2027 = prepareBudget(readJson(dir, names[1]));
  const cash13 = readJson(dir, names[2]);
  const cashMonthly = prepareMonthly(readJson(dir, names[3]));
  const commentary = readJson(dir, names[4]);
  requireKeys(budget2026, names[0], ["entity", "currency", "fiscalYear", "lines", "versions", "actuals", "ragThresholds"]);
  requireKeys(budget2027, names[1], ["entity", "currency", "fiscalYear", "periods", "lines", "drivers", "versions"]);
  requireKeys(cash13, names[2], ["entity", "weekStarts", "openingCash", "minimumCash", "lines", "scenarios", "arAgingOpening", "apAgingOpening"]);
  requireKeys(cashMonthly, names[3], ["entity", "periods", "rows", "openingCash", "minimumCash", "tieOut13Week", "actualClosingCash2026"]);
  requireKeys(commentary, names[4], ["period", "paragraphs", "lineReasons"]);
  validateCashWeeks(cash13, names[2]);
  const loaded = { entityKey: key, budget2026, budget2027, cash13, cashMonthly, commentary };
  cache.set(key, loaded);
  return loaded;
}

function versionCard(version, revenueKey = "net_revenue") {
  const total = version.fyTotal || version.ytdThrough?.["2026-12"] || null;
  return {
    id: version.id,
    label: version.label,
    status: version.status,
    locked: Boolean(version.locked),
    preparedBy: version.preparedBy || null,
    preparedAt: version.preparedAt || null,
    reviewedBy: version.reviewedBy || null,
    reviewedAt: version.reviewedAt || null,
    approvedBy: version.approvedBy || null,
    approvedAt: version.approvedAt || null,
    note: version.note || null,
    basedOn: version.basedOn || null,
    netRevenue: total ? total[revenueKey] : null,
    netIncome: total ? total.net_income : null,
  };
}

function summaryMonth(values) {
  const other = OTHER_FIXED.reduce((total, key) => total + num(values[key]), 0);
  return {
    net_revenue: values.net_revenue,
    gross_profit: values.gross_profit,
    marketing: values.marketing,
    wages: values.wages,
    other_fixed: other,
    net_income: values.net_income,
  };
}

export function budgetPack(entityKey = "purple-hat-demo") {
  const { budget2026, budget2027 } = loadPlanning(entityKey);
  const current = budget2027.versions.find((version) => version.id === "fy2027-v1") || budget2027.versions[0];
  const grid = {};
  for (const period of budget2027.periods) grid[period] = summaryMonth(current.monthly[period]);
  const fy = summaryMonth(current.fyTotal);
  return {
    entity: budget2027.entity,
    currency: budget2027.currency,
    fiscalYear: budget2027.fiscalYear,
    periods: budget2027.periods,
    lines: budget2027.lines,
    drivers: budget2027.drivers,
    versions: [
      versionCard(budget2026.versions[0]),
      ...budget2027.versions.map((version) => versionCard(version)),
    ],
    detail: budget2027.versions.map((version) => ({
      ...versionCard(version),
      monthly: version.monthly,
      fyTotal: version.fyTotal,
    })),
    grid: { versionId: current.id, months: grid, fy },
    source: budget2027.source || "",
  };
}

function measureRows(lines, actualMap, budgetMap) {
  const actual = recalcTotals(lines, actualMap);
  const budget = recalcTotals(lines, budgetMap);
  return lines.map((line) => {
    const change = variance(line.key, actual[line.key], budget[line.key]);
    return {
      key: line.key,
      label: line.label,
      section: line.section,
      rowType: line.rowType,
      actual: actual[line.key],
      budget: budget[line.key],
      varUsd: change.dollars,
      varPct: change.pct,
      rag: ragFor(change.dollars, change.pct),
    };
  });
}

function margin(part, total) {
  if (!num(total)) return null;
  return num(part) / num(total);
}

function columnKpis(rows) {
  const revenue = rows.find((row) => row.key === "net_revenue");
  const profit = rows.find((row) => row.key === "gross_profit");
  const income = rows.find((row) => row.key === "net_income");
  const redLines = rows.filter((row) => row.rowType === "input" && row.rag === "red");
  return {
    netRevenue: revenue,
    grossMargin: {
      actual: margin(profit?.actual, revenue?.actual),
      budget: margin(profit?.budget, revenue?.budget),
    },
    netIncome: income,
    redCount: redLines.length,
    redLines: redLines.map((row) => ({ key: row.key, label: row.label })),
  };
}

export function variancePack(entityKey = "purple-hat-demo") {
  const { budget2026, commentary } = loadPlanning(entityKey);
  const version = budget2026.versions.find((item) => item.id === commentary.budgetVersion) || budget2026.versions[0];
  const month = measureRows(budget2026.lines, budget2026.actuals.monthActual, version.monthly[budget2026.actuals.month]);
  const ytdBudget = version.ytdThrough[budget2026.actuals.month];
  const ytd = measureRows(budget2026.lines, budget2026.actuals.ytdActual, ytdBudget);
  return {
    entity: budget2026.entity,
    currency: budget2026.currency,
    period: budget2026.actuals.month,
    budgetVersion: versionCard(version),
    thresholds: budget2026.ragThresholds,
    month: { rows: month, kpis: columnKpis(month) },
    ytd: { rows: ytd, kpis: columnKpis(ytd) },
    seedLineReasons: commentary.lineReasons,
    actualSource: budget2026.actuals.source,
  };
}

function weeklyLines(cash13, scenarioKey) {
  const spec = cash13.scenarios[scenarioKey];
  return cash13.lines.map((line) => {
    const weekly = cash13.weekStarts.map((_, index) => roundHalfEven(scaledExact(line, line.weekly[index], spec)));
    return {
      key: line.key,
      label: line.label,
      direction: line.direction,
      rowType: "input",
      weekly,
      total: weekly.reduce((sum, value) => sum + value, 0),
    };
  });
}

export function cashWeekPack(entityKey = "purple-hat-demo", scenario = "base") {
  const { cash13 } = loadPlanning(entityKey);
  const selected = ["base", "downside", "upside"].includes(scenario) ? scenario : "base";
  const positions = {
    base: cashPosition(cash13, "base"),
    downside: cashPosition(cash13, "downside"),
    upside: cashPosition(cash13, "upside"),
  };
  return {
    entity: cash13.entity,
    currency: cash13.currency,
    weekStarts: cash13.weekStarts,
    openingDate: cash13.openingDate,
    openingCash: num(cash13.openingCash),
    minimumCash: num(cash13.minimumCash),
    scenario: selected,
    lines: weeklyLines(cash13, selected),
    positions,
    assumptions: cash13.assumptions,
    accuracyLastCycle: cash13.accuracyLastCycle,
    risks: cash13.risks,
    opportunities: cash13.opportunities,
    arAgingOpening: cash13.arAgingOpening,
    apAgingOpening: cash13.apAgingOpening,
    scenarios: cash13.scenarios,
    source: cash13.source,
  };
}

const BRIDGE_ROWS = [
  ["netRevenue", "Net revenue", "input"],
  ["netIncome", "Net income", "input"],
  ["changeReceivables", "(Increase) / decrease in receivables", "input"],
  ["changeInventory", "(Increase) / decrease in inventory", "input"],
  ["changePayables", "Increase / (decrease) in payables", "input"],
  ["capex", "Capital expenditure", "input"],
  ["drawings", "Member drawings", "input"],
  ["netCashFlow", "Net cash flow", "total"],
  ["opening", "Opening bank balance", "total"],
  ["closing", "Closing bank balance", "total"],
];

export function cashMonthPack(entityKey = "purple-hat-demo") {
  const { cashMonthly, budget2027 } = loadPlanning(entityKey);
  const approved = budget2027.versions.find((version) => version.id === cashMonthly.basedOnBudget) || budget2027.versions[0];
  const rows = BRIDGE_ROWS.map(([key, label, rowType]) => {
    const values = (cashMonthly.rows[key] || []).map((value) => num(value));
    const fy = ["opening", "closing"].includes(key) ? null : values.reduce((sum, value) => sum + value, 0);
    return { key, label, rowType, values, fy };
  });
  const closing = cashMonthly.rows.closing;
  let lowIndex = 0;
  closing.forEach((value, index) => {
    if (value < closing[lowIndex]) lowIndex = index;
  });
  const tieOut = ["2027-01", "2027-02", "2027-03"].map((period) => {
    const index = cashMonthly.periods.indexOf(period);
    const monthlyClosing = closing[index];
    const week = num(cashMonthly.tieOut13Week[period]);
    return { period, monthlyClosing, weekForecast: week, difference: monthlyClosing - week };
  });
  return {
    entity: cashMonthly.entity,
    currency: cashMonthly.currency,
    fiscalYear: cashMonthly.fiscalYear,
    periods: cashMonthly.periods,
    minimumCash: num(cashMonthly.minimumCash),
    openingCash: num(cashMonthly.openingCash),
    basedOnBudget: approved.id,
    netRevenue: approved.fyTotal.net_revenue,
    netIncome: approved.fyTotal.net_income,
    priorNetRevenue: budget2027.drivers.fy2026Actual.netRevenue,
    priorNetIncome: budget2027.drivers.fy2026Actual.netIncome,
    rows,
    closing,
    low: { period: cashMonthly.periods[lowIndex], amount: closing[lowIndex] },
    yearEnd: closing[closing.length - 1],
    actualClosingCash2026: cashMonthly.actualClosingCash2026,
    tieOut,
    assumptions: cashMonthly.assumptions,
    watch: cashMonthly.watch,
    inventoryPath: cashMonthly.inventoryPath,
    source: cashMonthly.source,
  };
}

export function redLinesFor(column) {
  return (column?.rows || []).filter((row) => row.rowType === "input" && row.rag === "red");
}

export function clearPlanningCache() {
  cache.clear();
}
