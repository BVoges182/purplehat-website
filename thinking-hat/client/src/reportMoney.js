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

export function reportPdfName(businessName, month) {
  const slug = String(businessName || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  return `${slug}-management-report-${month}.pdf`;
}
