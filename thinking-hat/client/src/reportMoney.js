function roundHalfAway(value, digits) {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

function grouped(value, digits) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function reportMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const formatted = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

export function reportFigure(value, format) {
  if (!format) return reportMoney(value);
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (format === "percent" || format === "percent2") {
    const digits = format === "percent2" ? 2 : 0;
    const pct = roundHalfAway(number * 100, digits);
    const text = `${grouped(Math.abs(pct), digits)}%`;
    return pct < 0 ? `(${text})` : text;
  }
  if (format === "number" || format === "number2") {
    const digits = format === "number2" ? 2 : 0;
    const rounded = roundHalfAway(number, digits);
    const text = grouped(Math.abs(rounded), digits);
    return rounded < 0 ? `(${text})` : text;
  }
  const digits = format === "money2" ? 2 : 0;
  const rounded = roundHalfAway(number, digits);
  const text = grouped(Math.abs(rounded), digits);
  return rounded < 0 ? `(${text})` : text;
}

export function reportMonthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return String(month || "");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isYearToDateTitle(title) {
  const text = String(title || "");
  return /year to date/i.test(text) || /[A-Za-z]+\s*[–—-]\s*[A-Za-z]+\s+\d{4}/.test(text);
}

export function yearToDateCash(sections) {
  const summary = (sections || []).find((section) => /executive summary/i.test(String(section.title || "")));
  const column = yearToDateColumn(summary?.columns);
  if (!summary || column < 0) return null;
  const groups = [];
  let current = null;
  for (const row of summary.rows || []) {
    if (row.kind === "heading") {
      const label = String(row.label || "").trim();
      if (/^(cash|profitability)$/i.test(label)) {
        current = { label, rows: [] };
        groups.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const value = row.values?.[column];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    current.rows.push({
      label: String(row.label || ""),
      value,
      format: row.formats?.[column] || "money",
      strong: row.kind === "total",
    });
  }
  const filled = groups.filter((group) => group.rows.length);
  return filled.length ? filled : null;
}

export function yearToDateContacts(sections) {
  const contacts = (sections || []).filter((section) => section.presentation === "contacts");
  const ranged = contacts.filter((section) => isYearToDateTitle(section.title));
  const pool = ranged.length ? ranged : contacts;
  const pick = (pattern) => pool.find((section) => pattern.test(String(section.title || ""))) || null;
  return {
    expenses: pick(/expense/i),
    income: pick(/income/i),
  };
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function sectionByTitle(sections, pattern) {
  return (sections || []).find((section) => pattern.test(String(section.title || ""))) || null;
}

export function yearToDateColumn(columns) {
  return (columns || []).findIndex((label) => /year to date/i.test(String(label || "")));
}

export function latestMonthColumn(columns, month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return -1;
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return -1;
  const aliases = [MONTH_NAMES[index], MONTH_SHORT[index]];
  if (MONTH_SHORT[index] === "sep") aliases.push("sept");
  const pattern = new RegExp(`\\b(?:${aliases.join("|")})\\b`, "i");
  return (columns || []).findIndex((label) => {
    const text = String(label || "");
    return !/year to date/i.test(text) && text.includes(match[1]) && pattern.test(text);
  });
}

function emphasizedTotal(row) {
  if (row?.kind !== "total") return false;
  const label = String(row.label || "").trim();
  return !/^(warehouse equipment|retained earnings|members?'?\s*drawings)$/i.test(label);
}

function columnRows(section, columnIndex) {
  if (!section || columnIndex < 0) return { column: "", rows: [] };
  const rows = [];
  (section.rows || []).forEach((row, index) => {
    if (row.kind === "heading") {
      const label = String(row.label || "").trim();
      if (label) rows.push({ key: `h-${index}`, label, heading: true });
      return;
    }
    rows.push({
      key: `r-${index}`,
      label: String(row.label || ""),
      indent: row.indent || 0,
      value: row.values?.[columnIndex] ?? null,
      format: row.formats?.[columnIndex] || "money",
      strong: emphasizedTotal(row),
    });
  });
  return { column: String(section.columns?.[columnIndex] || ""), rows };
}

function cashFlowColumn(section, month) {
  const yearToDate = yearToDateColumn(section?.columns);
  if (yearToDate >= 0) return yearToDate;
  return latestMonthColumn(section?.columns, month);
}

export function statementCards(report) {
  const sections = report?.sections || [];
  const month = report?.month;
  const profit = sectionByTitle(sections, /^profit and loss$/i);
  const balance = sectionByTitle(sections, /^balance sheet$/i);
  const cash = sectionByTitle(sections, /^statement of cash flows$/i);
  return {
    profit: columnRows(profit, yearToDateColumn(profit?.columns)),
    position: columnRows(balance, latestMonthColumn(balance?.columns, month)),
    cash: columnRows(cash, cashFlowColumn(cash, month)),
  };
}

export function isPlasYnGroveFarm(user) {
  const name = `${user?.templateName || ""} ${user?.businessName || ""}`;
  return /plas[\s-]*yn[\s-]*grove/i.test(name);
}

function cents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function positionBucket(label) {
  const text = String(label || "").trim();
  if (/creditors due after|due after more than one year|non-?current liabilit|long-?term liabilit/i.test(text)) {
    return "nonCurrentLiabilities";
  }
  if (/creditors due within|due within one year|current liabilit/i.test(text)) return "currentLiabilities";
  if (/\bcurrent assets\b/i.test(text)) return "currentAssets";
  if (/fixed assets|non-?current assets|tangible fixed assets/i.test(text)) return "nonCurrentAssets";
  if (/partners['’] accounts|members['’] equity|\bequity\b/i.test(text)) return "equity";
  return null;
}

function sectionAmount(rows, columnIndex) {
  const total = (rows || []).find((row) => {
    if (row.kind !== "total") return false;
    return !/^(net current assets|net assets)$/i.test(String(row.label || "").trim());
  });
  if (total) {
    const value = total.values?.[columnIndex];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  const lines = (rows || []).filter((row) => row.kind === "line");
  if (!lines.length) return null;
  return lines.reduce((sum, row) => {
    const value = row.values?.[columnIndex];
    return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
}

function bucketTotal(groups, key, columnIndex) {
  let sum = 0;
  for (const rows of groups[key] || []) {
    const amount = sectionAmount(rows, columnIndex);
    if (amount !== null) sum += amount;
  }
  return sum;
}

export function plasYnGroveFinancialPosition(report) {
  const balance = sectionByTitle(report?.sections, /^balance sheet$/i);
  const columnIndex = latestMonthColumn(balance?.columns, report?.month);
  if (!balance || columnIndex < 0) {
    return { column: "", rows: [], balanced: false, note: "No balance sheet column for this month." };
  }
  const groups = {
    nonCurrentAssets: [],
    currentAssets: [],
    nonCurrentLiabilities: [],
    currentLiabilities: [],
    equity: [],
  };
  let bucket = null;
  let pending = [];
  const flush = () => {
    if (bucket) groups[bucket].push(pending);
    pending = [];
  };
  for (const row of balance.rows || []) {
    if (row.kind === "heading") {
      flush();
      bucket = positionBucket(row.label);
      continue;
    }
    if (bucket) pending.push(row);
  }
  flush();
  const nonCurrentAssets = cents(bucketTotal(groups, "nonCurrentAssets", columnIndex));
  const currentAssets = cents(bucketTotal(groups, "currentAssets", columnIndex));
  const equity = cents(bucketTotal(groups, "equity", columnIndex));
  const nonCurrentLiabilities = cents(bucketTotal(groups, "nonCurrentLiabilities", columnIndex));
  const currentLiabilities = cents(bucketTotal(groups, "currentLiabilities", columnIndex));
  const totalAssets = cents(nonCurrentAssets + currentAssets);
  const totalEquityAndLiabilities = cents(equity + nonCurrentLiabilities + currentLiabilities);
  const difference = cents(totalAssets - totalEquityAndLiabilities);
  const line = (key, label, value, strong = false) => ({ key, label, value, format: "money2", strong });
  return {
    column: String(balance.columns?.[columnIndex] || ""),
    rows: [
      line("non-current-assets", "Non-current assets", nonCurrentAssets),
      line("current-assets", "Current assets", currentAssets),
      line("total-assets", "Total assets", totalAssets, true),
      line("equity", "Equity", equity),
      line("non-current-liabilities", "Non-current liabilities", nonCurrentLiabilities),
      line("current-liabilities", "Current liabilities", currentLiabilities),
      line("total-equity-liabilities", "Total equity and liabilities", totalEquityAndLiabilities, true),
    ],
    balanced: difference === 0,
    note: difference === 0
      ? ""
      : `Total assets do not equal total equity and liabilities. The difference is ${reportFigure(difference, "money2")}.`,
  };
}

function columnIndex(columns, pattern) {
  return (columns || []).findIndex((label) => pattern.test(String(label || "")));
}

function seriesValue(row, index) {
  if (index < 0) return null;
  const value = row?.values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ecommerceSeries(sections) {
  const section = (sections || []).find((item) => item.presentation === "ecommerce");
  if (!section?.rows?.length) return null;
  const columns = section.columns || [];
  const spend = columnIndex(columns, /ad spend/i);
  const revenue = columnIndex(columns, /revenue/i);
  const roas = columnIndex(columns, /^roas$/i);
  const cpa = columnIndex(columns, /^cpa$/i);
  const conversion = columnIndex(columns, /conversion/i);
  const points = section.rows.map((row) => ({
    month: row.month,
    spend: seriesValue(row, spend),
    revenue: seriesValue(row, revenue),
    roas: seriesValue(row, roas),
    cpa: seriesValue(row, cpa),
    conversion: seriesValue(row, conversion),
  })).filter((point) => point.month);
  if (!points.some((point) => [point.spend, point.revenue, point.roas, point.cpa, point.conversion].some((value) => value !== null))) {
    return null;
  }
  return points;
}

function average(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function trendDirection(points, key) {
  const values = points.map((point) => point[key]).filter((value) => typeof value === "number");
  if (values.length < 2) return "steady";
  const span = Math.max(1, Math.floor(values.length / 3));
  const early = average(values.slice(0, span));
  const late = average(values.slice(-span));
  if (early === null || late === null || early === 0) return "steady";
  const change = (late - early) / Math.abs(early);
  if (change >= 0.02) return "up";
  if (change <= -0.02) return "down";
  return "steady";
}

const INSIGHT_MONTHS = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

export function insightMonthName(label) {
  const match = String(label || "").match(/[A-Za-z]+/);
  if (!match) return "";
  return INSIGHT_MONTHS[match[0].slice(0, 3).toLowerCase()] || match[0];
}

export function ecommerceInsight(points) {
  if (!points?.length) return "";
  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : null;
  const roasTrend = trendDirection(points, "roas");
  const conversionTrend = trendDirection(points, "conversion");
  const year = String(latest.month || "").match(/\d{4}/)?.[0] || "";
  const through = year ? ` through ${year}` : "";
  let lead;
  if (roasTrend === "up" && conversionTrend === "up") {
    lead = `Both ROAS and conversion rate show an upward trend${through}`;
  } else if (roasTrend === "down" && conversionTrend === "down") {
    lead = `Both ROAS and conversion rate eased${through}`;
  } else if (roasTrend === "steady" && conversionTrend === "steady") {
    lead = `ROAS and conversion rate held fairly steady${through}`;
  } else {
    const phrase = { up: "rising", down: "easing", steady: "holding steady" };
    lead = `ROAS is ${phrase[roasTrend]} and conversion rate is ${phrase[conversionTrend]}${through}`;
  }
  const latestName = insightMonthName(latest.month);
  if (
    prior
    && typeof latest.roas === "number"
    && typeof prior.roas === "number"
    && latest.roas < prior.roas
    && roasTrend === "up"
    && latestName
  ) {
    lead += `, with a softer ${latestName}`;
  }
  const sentences = [`${lead}.`];
  if (prior && typeof latest.revenue === "number" && typeof prior.revenue === "number") {
    const priorName = insightMonthName(prior.month) || "the prior month";
    if (latest.revenue < prior.revenue) sentences.push(`Paid revenue is below ${priorName}.`);
    else if (latest.revenue > prior.revenue) sentences.push(`Paid revenue is ahead of ${priorName}.`);
    else sentences.push(`Paid revenue is level with ${priorName}.`);
  }
  return sentences.join(" ");
}

export function reportPdfName(businessName, month) {
  const slug = String(businessName || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  return `${slug}-management-report-${month}.pdf`;
}
