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
  if (format === "percent") {
    const pct = roundHalfAway(number * 100, 0);
    const text = `${grouped(Math.abs(pct), 0)}%`;
    return pct < 0 ? `(${text})` : text;
  }
  const digits = format === "money2" ? 2 : 0;
  const rounded = roundHalfAway(number, digits);
  const text = grouped(Math.abs(rounded), digits);
  return rounded < 0 ? `(${text})` : text;
}

export const DONUT_COLOURS = [
  "#c4b5fd",
  "#b09afc",
  "#a78bfa",
  "#9674f8",
  "#8b5cf6",
  "#7c3aed",
  "#6d28d9",
  "#5b21b6",
  "#4c1d95",
  "#3c1778",
  "#31135f",
  "#2a1548",
];

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
  const pattern = new RegExp(`\\b(?:${MONTH_NAMES[index]}|${MONTH_SHORT[index]})\\b`, "i");
  return (columns || []).findIndex((label) => {
    const text = String(label || "");
    return !/year to date/i.test(text) && text.includes(match[1]) && pattern.test(text);
  });
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
      value: row.values?.[columnIndex] ?? null,
      format: row.formats?.[columnIndex] || "money",
      strong: row.kind === "total",
    });
  });
  return { column: String(section.columns?.[columnIndex] || ""), rows };
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
    cash: columnRows(cash, latestMonthColumn(cash?.columns, month)),
  };
}

export function reportPdfName(businessName, month) {
  const slug = String(businessName || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  return `${slug}-management-report-${month}.pdf`;
}
