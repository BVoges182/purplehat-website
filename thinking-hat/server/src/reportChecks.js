// Checks and repairs for management-report sections.
// Figure repairs run for the Purple Hat Demo layout. UK books are left unchanged
// and reported as warnings instead.

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_WORD = "January|February|March|April|May|June|July|August|September|Sept|October|November|December";

const DETAIL_LABEL = /^(warehouse equipment|retained earnings|members?'?\s*drawings)$/i;

const CASH_LABELS = {
  operating: "Net cash from operating activities",
  investing: "Net cash from investing activities",
  financing: "Net cash from financing activities",
};

export function isPlainDetailLabel(label) {
  return DETAIL_LABEL.test(String(label || "").trim());
}

export function monthEndedLabel(month) {
  const parsed = parseMonthKey(month);
  if (!parsed) return "";
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return new Date(Date.UTC(parsed.year, parsed.month - 1, lastDay)).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthTitle(month) {
  const parsed = parseMonthKey(month);
  if (!parsed) return String(month || "");
  return new Date(Date.UTC(parsed.year, parsed.month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseMonthKey(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;
  return { year, month: monthIndex, key: `${match[1]}-${match[2]}` };
}

export function columnMonth(label) {
  const text = String(label || "").trim();
  if (/year to date/i.test(text)) return { ytd: true };
  const patterns = [
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
    /^([A-Za-z]+)\s+(\d{4})$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const words = match.slice(1).filter((part) => /[A-Za-z]/.test(part));
    const year = Number(match.slice(1).find((part) => /^\d{4}$/.test(part)));
    const month = MONTHS[String(words[0] || "").toLowerCase()];
    if (!month || !year) continue;
    return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
  }
  return null;
}

function datedParts(text) {
  const dayFirst = new RegExp(`^(\\d{1,2})\\s+(${MONTH_WORD})\\s+(\\d{4})$`, "i").exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    return month ? { year: Number(dayFirst[3]), month } : null;
  }
  const monthFirst = new RegExp(`^(${MONTH_WORD})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i").exec(text);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    return month ? { year: Number(monthFirst[3]), month } : null;
  }
  return null;
}

function datesInNote(note) {
  const found = [];
  const pattern = new RegExp(
    `\\b(\\d{1,2}\\s+(?:${MONTH_WORD})\\s+\\d{4}|(?:${MONTH_WORD})\\s+\\d{1,2},?\\s+\\d{4})\\b`,
    "gi",
  );
  for (const match of String(note || "").matchAll(pattern)) {
    const parsed = datedParts(match[1]);
    if (parsed) found.push({ text: match[1], ...parsed });
  }
  return found;
}

function replaceWrongDates(note, month) {
  const report = parseMonthKey(month);
  const ended = monthEndedLabel(month);
  if (!report || !ended) return note;
  return String(note || "").replace(
    new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTH_WORD})\\s+\\d{4}|(?:${MONTH_WORD})\\s+\\d{1,2},?\\s+\\d{4})\\b`, "gi"),
    (full) => {
      const parsed = datedParts(full);
      if (!parsed) return full;
      if (parsed.year === report.year && parsed.month === report.month) return full;
      return ended;
    },
  );
}

export function preserveReportFigures(info = {}) {
  const name = `${info.businessName || ""} ${info.templateName || ""} ${info.name || ""} ${info.sourceBusiness || ""}`;
  const key = String(info.templateKey || info.key || "");
  if (/plas[\s-]*yn[\s-]*grove/i.test(name) || key === "copy-4f8c11f1b756") return true;
  const layout = info.reportTemplate || info.layout || "";
  if (layout && layout !== "purple-hat-demo") return true;
  return false;
}

export function templateReviewWarnings(template = {}) {
  const name = `${template.name || ""} ${template.templateName || ""}`;
  const key = String(template.key || template.template_key || "");
  const layout = template.reportTemplate || template.report_template || template.layout || "";
  const plas = /plas[\s-]*yn[\s-]*grove/i.test(name) || key === "copy-4f8c11f1b756";
  if (plas && layout === "purple-hat-demo") {
    return [
      "Plas-Yn-Grove Farm is a UK GAAP client but this template uses US labels copied from Purple Hat Demo. Review it before using the template. Figures were not changed.",
    ];
  }
  return [];
}

function isPercentRow(row) {
  if (/^gp %$/i.test(String(row?.label || "").trim())) return true;
  return (row?.formats || []).some((format) => String(format || "").startsWith("percent"));
}

function rowNumbers(row) {
  if (Array.isArray(row?.values)) return row.values;
  if (typeof row?.value === "number") return [row.value];
  return [];
}

function numberAt(row, index) {
  const values = rowNumbers(row);
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function widthOf(section) {
  const listed = Array.isArray(section?.columns) ? section.columns.length : 0;
  const fromRows = (section?.rows || []).reduce((max, row) => Math.max(max, rowNumbers(row).length), 0);
  return Math.max(listed, fromRows);
}

function findRows(section, pattern, kind) {
  return (section?.rows || []).filter((row) => {
    if (kind && row.kind !== kind) return false;
    return pattern.test(String(row.label || "").trim());
  });
}

function findRow(section, pattern, kind) {
  return findRows(section, pattern, kind)[0] || null;
}

function previousTotal(rows, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].kind === "heading") break;
    if (rows[i].kind === "total") return rows[i];
  }
  return null;
}

function combined(left, right, op, width) {
  if (!left) return null;
  const out = [];
  let any = false;
  for (let index = 0; index < width; index += 1) {
    const a = numberAt(left, index);
    const b = right ? numberAt(right, index) : 0;
    const rightMissing = Boolean(right) && b === null;
    if (a === null || rightMissing) {
      out.push(null);
      continue;
    }
    any = true;
    out.push(op(a, b));
  }
  return any ? out : null;
}

function sumRows(rows, width) {
  if (!rows.length) return null;
  const out = Array.from({ length: width }, () => null);
  let any = false;
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) {
      const value = numberAt(row, index);
      if (value === null) continue;
      any = true;
      out[index] = (out[index] || 0) + value;
    }
  }
  return any ? out : null;
}

function linesOnlySum(rows, index, width) {
  const parts = [];
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "heading") break;
    if (row.kind === "total") return null;
    if (row.kind === "line" && !isPercentRow(row)) parts.push(row);
  }
  return sumRows(parts, width);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function moneyDiffers(expected, actual) {
  if (typeof expected !== "number" || typeof actual !== "number") return false;
  return Math.abs(Math.round(expected * 100) - Math.round(actual * 100)) > 1;
}

function rateDiffers(expected, actual) {
  if (typeof expected !== "number" || typeof actual !== "number") return true;
  return Math.abs(expected - actual) > 1e-9;
}

function formatAmount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "blank";
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.trunc(cents / 100).toLocaleString("en-GB");
  const frac = cents % 100;
  const body = frac === 0 ? whole : `${whole}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

function formatRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "blank";
  return String(Math.round(value * 1e8) / 1e8);
}

function columnName(section, index) {
  if (section.columns?.[index]) return section.columns[index];
  if (!section.columns?.length) return "the total";
  return `column ${index + 1}`;
}

function activityOf(label) {
  const name = String(label || "");
  if (/investing/i.test(name)) return "investing";
  if (/financing/i.test(name)) return "financing";
  if (/operating/i.test(name)) return "operating";
  return "";
}

function normalizeNotes(sections, month) {
  for (const section of sections) {
    if (!section?.note) continue;
    section.note = replaceWrongDates(section.note, month);
  }
}

function normalizeCashFlow(section) {
  const rows = section.rows || [];
  const width = Math.max(widthOf(section), 1);
  const groups = [];
  rows.forEach((row, index) => {
    if (row.kind !== "heading") return;
    const activity = activityOf(row.label);
    if (activity) groups.push({ activity, index });
  });
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const group = groups[groupIndex];
    const start = group.index + 1;
    let stop = groupIndex + 1 < groups.length ? groups[groupIndex + 1].index : rows.length;
    if (groupIndex === groups.length - 1) {
      for (let index = start; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.kind === "heading" || (row.kind === "total" && /^net change in cash|^net cash flows$/i.test(String(row.label || "").trim()))) {
          stop = index;
          break;
        }
      }
    }
    const slice = rows.slice(start, stop);
    const total = slice.find((row) => row.kind === "total");
    if (total) {
      if (!String(total.label || "").trim()) total.label = CASH_LABELS[group.activity];
      continue;
    }
    if (!slice.some((row) => row.kind === "line")) continue;
    const values = sumRows(slice.filter((row) => row.kind === "line"), width) || Array.from({ length: width }, () => 0);
    const sample = slice.find((row) => Array.isArray(row.formats));
    rows.splice(stop, 0, {
      kind: "total",
      label: CASH_LABELS[group.activity],
      indent: 0,
      values,
      formats: sample?.formats?.slice(0, width) || Array.from({ length: width }, () => "money"),
    });
  }
}

function ytdByMonth(section, netIncome) {
  const map = new Map();
  if (!section || !netIncome) return map;
  const ytdIndex = (section.columns || []).findIndex((column) => /year to date/i.test(String(column || "")));
  if (ytdIndex < 0) return map;
  const ytd = numberAt(netIncome, ytdIndex);
  if (ytd === null) return map;
  const monthly = [];
  (section.columns || []).forEach((column, index) => {
    const parsed = columnMonth(column);
    if (!parsed?.key) return;
    const value = numberAt(netIncome, index);
    if (value === null) return;
    monthly.push({ key: parsed.key, time: parsed.year * 12 + parsed.month, value });
  });
  monthly.sort((a, b) => b.time - a.time);
  let running = ytd;
  for (const entry of monthly) {
    map.set(entry.key, running);
    running -= entry.value;
  }
  return map;
}

function normalizeBalanceSheet(section, sections) {
  const rows = section.rows || [];
  for (const row of rows) {
    if (isPlainDetailLabel(row.label)) row.kind = "line";
  }
  const component = (pattern) => rows.findIndex((row) => pattern.test(String(row.label || "").trim()));
  const ppeIndex = component(/^property and equipment, net$/i);
  const componentIndexes = [
    component(/^website and software$/i),
    component(/^warehouse equipment$/i),
    component(/^accumulated depreciation$/i),
  ].filter((index) => index >= 0);
  if (ppeIndex >= 0 && componentIndexes.length) {
    const lastComponent = Math.max(...componentIndexes);
    if (ppeIndex < lastComponent) {
      const [ppe] = rows.splice(ppeIndex, 1);
      ppe.kind = "total";
      const shifted = componentIndexes.map((index) => (index > ppeIndex ? index - 1 : index));
      rows.splice(Math.max(...shifted) + 1, 0, ppe);
    } else {
      rows[ppeIndex].kind = "total";
    }
  }

  const profit = sections.find((item) => /^profit and loss$/i.test(String(item?.title || "").trim()));
  const profitIncome = findRow(profit, /^net income\b/i, "total") || findRow(profit, /^net income\b/i);
  const earned = ytdByMonth(profit, profitIncome);
  if (!earned.size) return;
  const netIncome = findRow(section, /^net income\b|^current[- ]year earnings\b/i);
  const retained = findRow(section, /^retained earnings$/i);
  if (!netIncome) return;
  netIncome.values = rowNumbers(netIncome).slice();
  if (retained) retained.values = rowNumbers(retained).slice();
  (section.columns || []).forEach((column, index) => {
    const key = columnMonth(column)?.key;
    if (!key || !earned.has(key)) return;
    const next = earned.get(key);
    const current = numberAt(netIncome, index);
    if (current === null) return;
    // Year-to-date earnings move onto this column. Retained earnings takes the
    // other side so assets still equal liabilities and equity, and cash stays tied.
    if (retained && numberAt(retained, index) !== null) {
      retained.values[index] = numberAt(retained, index) - (next - current);
    }
    netIncome.values[index] = next;
  });
}

function metricIndex(columns, pattern) {
  return (columns || []).findIndex((column) => pattern.test(String(column || "").trim()));
}

function ecommerceDerived(row, columns) {
  const indexes = {
    spend: metricIndex(columns, /ad spend/i),
    impressions: metricIndex(columns, /^impressions$/i),
    clicks: metricIndex(columns, /^clicks$/i),
    ctr: metricIndex(columns, /^ctr$/i),
    cpc: metricIndex(columns, /^cpc$/i),
    sessions: metricIndex(columns, /sessions/i),
    orders: metricIndex(columns, /orders/i),
    revenue: metricIndex(columns, /revenue/i),
    conversion: metricIndex(columns, /conversion/i),
    roas: metricIndex(columns, /^roas$/i),
    cpa: metricIndex(columns, /^cpa$/i),
    aov: metricIndex(columns, /^aov$/i),
  };
  const value = (index) => (index >= 0 ? numberAt(row, index) : null);
  const items = [];
  const ratio = (name, output, numerator, denominator, money) => {
    if (output < 0 || numerator < 0 || denominator < 0) return;
    const top = value(numerator);
    const bottom = value(denominator);
    if (top === null || bottom === null) return;
    if (bottom === 0) {
      items.push({ name, zero: true });
      return;
    }
    const raw = top / bottom;
    items.push({
      name,
      index: output,
      expected: money ? roundMoney(raw) : raw,
      actual: value(output),
      money,
    });
  };
  ratio("CTR", indexes.ctr, indexes.clicks, indexes.impressions, false);
  ratio("CPC", indexes.cpc, indexes.spend, indexes.clicks, true);
  ratio("Conversion Rate", indexes.conversion, indexes.orders, indexes.sessions, false);
  ratio("ROAS", indexes.roas, indexes.revenue, indexes.spend, false);
  ratio("CPA", indexes.cpa, indexes.spend, indexes.orders, true);
  ratio("AOV", indexes.aov, indexes.revenue, indexes.orders, true);
  return items;
}

function normalizeEcommerce(section) {
  for (const row of section.rows || []) {
    if (!Array.isArray(row.values)) continue;
    row.values = row.values.slice();
    for (const item of ecommerceDerived(row, section.columns)) {
      if (item.zero || item.index === undefined) continue;
      row.values[item.index] = item.expected;
    }
  }
}

function normalizeSections(sections, month) {
  normalizeNotes(sections, month);
  for (const section of sections) {
    const title = String(section?.title || "");
    if (/cash flow/i.test(title)) normalizeCashFlow(section);
    if (/balance sheet/i.test(title)) normalizeBalanceSheet(section, sections);
    if (section?.presentation === "ecommerce" || /e-?\s*commerce/i.test(title)) normalizeEcommerce(section);
  }
  return sections;
}

function expectGross(section, index, width) {
  const revenue = findRow(section, /^total net revenue$/i, "total");
  const cost = findRow(section, /^total cost of goods sold$/i, "total");
  if (revenue && cost) return combined(revenue, cost, (a, b) => a - b, width);
  const income = findRow(section, /^income$/i, "line");
  const sales = findRow(section, /^cost of sales$/i, "line");
  if (income && sales) return combined(income, sales, (a, b) => a - b, width);
  const second = previousTotal(section.rows, index);
  const first = second ? previousTotal(section.rows, section.rows.indexOf(second)) : null;
  if (first && second) return combined(first, second, (a, b) => a - b, width);
  return null;
}

function expectNet(section, index, width) {
  const operating = findRow(section, /^operating income\b/i, "total");
  if (operating) {
    const tax = findRow(section, /income tax/i, "line");
    return combined(operating, tax, (a, b) => a - b, width);
  }
  const gross = findRow(section, /^gross profit\b/i, "total");
  if (!gross) return null;
  const previous = previousTotal(section.rows, index);
  if (previous && previous !== gross) return combined(gross, previous, (a, b) => a - b, width);
  const expenses = findRow(section, /^expenses$/i, "line");
  if (expenses) return combined(gross, expenses, (a, b) => a - b, width);
  return null;
}

function expectNetCurrent(section, width) {
  const heading = (section.rows || []).findIndex((row) => row.kind === "heading" && /creditors/i.test(String(row.label || "")));
  if (heading < 0) return null;
  let current = null;
  for (let index = heading - 1; index >= 0; index -= 1) {
    if (section.rows[index].kind === "total") {
      current = section.rows[index];
      break;
    }
    if (section.rows[index].kind === "heading") break;
  }
  const netIndex = (section.rows || []).findIndex((row) => row.kind === "total" && /^net current assets\b/i.test(String(row.label || "").trim()));
  const creditors = netIndex > 0 ? previousTotal(section.rows, netIndex) : null;
  if (!current || !creditors) return null;
  return combined(current, creditors, (a, b) => a - b, width);
}

function expectActivityChange(section, width) {
  const parts = (section.rows || []).filter((row) => row.kind === "total" && /net cash (flows )?from (operating|investing|financing)|net cash from (operating|investing|financing)/i.test(String(row.label || "")));
  return parts.length ? sumRows(parts, width) : null;
}

function cashChangeRow(section) {
  return findRow(section, /net change in cash/i, "line")
    || findRow(section, /^net change in cash\b|^net cash flows$/i, "total");
}

function expectedTotal(section, row, index, width) {
  const label = String(row.label || "").trim();
  if (/^gross profit\b/i.test(label)) return expectGross(section, index, width);
  if (/^operating income\b/i.test(label)) {
    const gross = findRow(section, /^gross profit\b/i, "total");
    const expenses = findRow(section, /^total operating expenses$/i, "total");
    if (gross && expenses) return combined(gross, expenses, (a, b) => a - b, width);
    return null;
  }
  if (/^net (income|profit)\b/i.test(label)) return expectNet(section, index, width);
  if (/^property and equipment, net$/i.test(label)) {
    const parts = (section.rows || []).filter((item) => /^(website and software|warehouse equipment|accumulated depreciation)$/i.test(String(item.label || "").trim()));
    return sumRows(parts, width);
  }
  if (/^total assets$/i.test(label)) {
    const current = findRow(section, /^total current assets$/i, "total");
    const equipment = findRow(section, /^property and equipment, net$/i, "total");
    if (current && equipment) return combined(current, equipment, (a, b) => a + b, width);
    return null;
  }
  if (/^total liabilities and equity$/i.test(label)) {
    const liabilities = findRow(section, /^total liabilities$/i, "total");
    const equity = findRow(section, /^total members['’] equity$/i, "total");
    if (liabilities && equity) return combined(liabilities, equity, (a, b) => a + b, width);
    return null;
  }
  if (/^total liabilities$/i.test(label)) {
    const current = findRow(section, /^total current liabilities$/i, "total");
    const longTerm = findRow(section, /^long-term liabilities$/i, "line");
    if (current && longTerm) return combined(current, longTerm, (a, b) => a + b, width);
    if (current) return combined(current, null, (a) => a, width);
    return null;
  }
  if (/^net current assets\b/i.test(label)) return expectNetCurrent(section, width);
  if (/^net assets$/i.test(label)) {
    const tangible = findRow(section, /tangible assets$/i, "total");
    const current = findRow(section, /^net current assets\b/i, "total");
    if (tangible && current) return combined(tangible, current, (a, b) => a + b, width);
    return null;
  }
  if (/^net change in cash\b|^net cash flows$/i.test(label)) return expectActivityChange(section, width);
  if (/cash and cash equivalents at end/i.test(label)) {
    const beginning = findRow(section, /cash and cash equivalents at beginning/i);
    const change = cashChangeRow(section);
    if (beginning && change) return combined(beginning, change, (a, b) => a + b, width);
    return null;
  }
  return linesOnlySum(section.rows || [], index, width);
}

function checkTotal(section, row, index, warnings) {
  const width = widthOf(section);
  const expected = expectedTotal(section, row, index, width);
  if (!expected) return;
  const label = String(row.label || "").trim() || "untitled total";
  for (let column = 0; column < width; column += 1) {
    const wanted = expected[column];
    const found = numberAt(row, column);
    if (wanted === null && (found === null || found === 0)) continue;
    if (found === null && wanted === 0) continue;
    if (wanted === null || found === null || moneyDiffers(wanted, found)) {
      warnings.push(
        `${section.title || "Report"}: "${label}" does not add up in ${columnName(section, column)} (expected ${formatAmount(wanted)}, found ${formatAmount(found)}).`,
      );
    }
  }
}

function checkBalance(section, warnings) {
  if (!/balance sheet|financial position/i.test(String(section.title || ""))) return;
  const assets = findRow(section, /^total assets$/i, "total");
  const equity = findRow(section, /^total liabilities and equity$/i, "total");
  let left = assets;
  let right = equity;
  let rightName = "liabilities and equity";
  if (!left || !right) {
    left = findRow(section, /^net assets$/i, "total");
    right = [...(section.rows || [])].reverse().find((row) => row.kind === "total" && row !== left);
    rightName = "equity";
  }
  if (!left || !right) return;
  const width = widthOf(section);
  for (let column = 0; column < width; column += 1) {
    const a = numberAt(left, column);
    const b = numberAt(right, column);
    if (a === null && b === null) continue;
    if (a === null || b === null || moneyDiffers(a, b)) {
      warnings.push(
        `${section.title || "Balance sheet"}: assets do not equal ${rightName} in ${columnName(section, column)} (assets ${formatAmount(a)}, ${rightName} ${formatAmount(b)}).`,
      );
    }
  }
}

function checkEarningsTie(sections, warnings) {
  const profit = sections.find((section) => /^profit and loss$/i.test(String(section?.title || "").trim()));
  const balance = sections.find((section) => /^balance sheet$/i.test(String(section?.title || "").trim()));
  if (!profit || !balance) return;
  const profitIncome = findRow(profit, /^net income\b/i, "total") || findRow(profit, /^net income\b/i);
  const balanceIncome = findRow(balance, /^net income\b|^current[- ]year earnings\b/i);
  if (!profitIncome || !balanceIncome) return;
  const earned = ytdByMonth(profit, profitIncome);
  (balance.columns || []).forEach((column, index) => {
    const key = columnMonth(column)?.key;
    if (!key || !earned.has(key)) return;
    const expected = earned.get(key);
    const actual = numberAt(balanceIncome, index);
    if (actual === null || moneyDiffers(expected, actual)) {
      warnings.push(
        `Balance sheet: net income in ${column} is ${formatAmount(actual)} but the profit and loss year to date for that month is ${formatAmount(expected)}.`,
      );
    }
  });
}

function checkNotes(section, month, warnings) {
  const report = parseMonthKey(month);
  if (!report || !section?.note) return;
  for (const date of datesInNote(section.note)) {
    if (date.year === report.year && date.month === report.month) continue;
    warnings.push(
      `${section.title || "Report"}: the note says "${date.text}", which does not match ${monthTitle(month)}.`,
    );
  }
}

function checkEcommerce(section, warnings) {
  for (const row of section.rows || []) {
    const when = row.month || "a month";
    for (const item of ecommerceDerived(row, section.columns)) {
      if (item.zero) {
        warnings.push(`${section.title || "E-commerce report"}: ${item.name} for ${when} was not calculated because its divisor is zero.`);
        continue;
      }
      const differs = item.money ? moneyDiffers(item.expected, item.actual) : rateDiffers(item.expected, item.actual);
      if (!differs) continue;
      const shown = item.money ? formatAmount : formatRate;
      warnings.push(
        `${section.title || "E-commerce report"}: ${item.name} for ${when} is ${shown(item.actual)} but the inputs give ${shown(item.expected)}.`,
      );
    }
  }
}

export function validateReport(sections, month) {
  const warnings = [];
  const list = Array.isArray(sections) ? sections : [];
  for (const section of list) {
    const rows = section?.rows || [];
    const unlabeled = [];
    rows.forEach((row, index) => {
      if (row?.kind !== "total") return;
      if (!String(row.label || "").trim()) {
        let context = "the statement";
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          if (rows[cursor].kind === "heading" && String(rows[cursor].label || "").trim()) {
            context = rows[cursor].label;
            break;
          }
        }
        unlabeled.push(context);
      }
      checkTotal(section, row, index, warnings);
    });
    if (unlabeled.length === 1) {
      warnings.push(`${section.title || "Report"}: a total row has no label under ${unlabeled[0]}.`);
    } else if (unlabeled.length > 1) {
      warnings.push(`${section.title || "Report"}: total rows have no label under ${unlabeled.join(", ")}.`);
    }
    checkBalance(section, warnings);
    checkNotes(section, month, warnings);
    if (section?.presentation === "ecommerce" || /e-?\s*commerce/i.test(String(section?.title || ""))) {
      checkEcommerce(section, warnings);
    }
  }
  checkEarningsTie(list, warnings);
  return warnings;
}

export function reportWarnings(sections, month) {
  const title = monthTitle(month);
  return validateReport(sections, month).map((warning) => (title ? `${title}: ${warning}` : warning));
}

export function prepareReport(sections, month, options = {}) {
  const source = Array.isArray(sections) ? sections : [];
  const next = options.preserveFigures ? structuredClone(source) : normalizeSections(structuredClone(source), month);
  return { sections: next, warnings: reportWarnings(next, month) };
}
