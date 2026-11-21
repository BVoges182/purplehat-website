const MONTHS = {
  january: "Jan", jan: "Jan", february: "Feb", feb: "Feb", march: "Mar", mar: "Mar",
  april: "Apr", apr: "Apr", may: "May", june: "Jun", jun: "Jun", july: "Jul", jul: "Jul",
  august: "Aug", aug: "Aug", september: "Sep", sept: "Sep", sep: "Sep",
  october: "Oct", oct: "Oct", november: "Nov", nov: "Nov", december: "Dec", dec: "Dec",
};

const MONTH_PATTERN = "January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

function shortMonth(name) {
  return MONTHS[String(name || "").toLowerCase()] || name;
}

export function periodPill(column) {
  const text = String(column || "").trim();
  if (/year to date|^ytd$/i.test(text)) return "YTD";
  const quarter = text.match(/\bQ([1-4])\b/i);
  if (quarter) return `Q${quarter[1]}`;
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\b(?:\\s+(\\d{4}))?`, "i"));
  if (dayFirst) {
    const month = shortMonth(dayFirst[2]);
    return dayFirst[3] ? `${Number(dayFirst[1])} ${month} ${dayFirst[3]}` : `${Number(dayFirst[1])} ${month}`;
  }
  const monthFirst = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i"));
  if (monthFirst) return `${Number(monthFirst[2])} ${shortMonth(monthFirst[1])} ${monthFirst[3]}`;
  const month = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\b(?:\\s+(\\d{4}))?`, "i"));
  if (month) {
    const name = shortMonth(month[1]);
    return month[2] ? `${name} ${month[2]}` : name;
  }
  return text;
}

export function usesPeriodTabs(title) {
  const text = String(title || "").trim();
  return /^executive summary/i.test(text)
    || /^profit and loss$/i.test(text)
    || /^profit and loss quarterly$/i.test(text)
    || /^balance sheet$/i.test(text)
    || /cash flow/i.test(text);
}

const PROFIT_TOTAL = /^(gross profit(?:\s*\(loss\))?|net profit(?:\s*\(loss\))?|net income(?:\s*\(loss\))?|operating income(?:\s*\(loss\))?|net assets|total assets|total members' equity|total equity|net cash from operating activities|net cash from investing activities|net change in cash)$/i;

export function costLine(label, heading = "") {
  const name = String(label || "").trim();
  if (!name) return false;
  if (/total liabilities and equity/i.test(name)) return false;
  if (PROFIT_TOTAL.test(name)) return false;
  if (/^(cash spent|cost of sales|expenses|member drawings|partners' drawings)$/i.test(name)) return true;
  if (/refunds?|\breturns\b/i.test(name)) return true;
  if (/cost of goods sold|cost of sales/i.test(name)) return true;
  if (/operating expenses/i.test(name)) return true;
  if (/payments?\s+to\s+suppliers/i.test(name)) return true;
  if (/property,\s*plant|plant and equipment|\bppe\b/i.test(name)) return true;
  if (/liabilit/i.test(name)) return true;
  if (/member drawings|partners' drawings/i.test(name)) return true;
  if (/net cash from financing/i.test(name)) return true;
  const section = String(heading || "");
  if (/cost of goods sold|cost of sales|operating expenses/i.test(section)) return true;
  if (/liabilit/i.test(section) && !/equity/i.test(section)) return true;
  return false;
}

export function fillCashSubtotals(rows) {
  let heading = "";
  return (rows || []).map((row) => {
    if (row.kind === "heading") {
      heading = String(row.label || "");
      return row;
    }
    if (row.kind === "total" && !String(row.label || "").trim()) {
      const label = /operating/i.test(heading)
        ? "Net cash from operating activities"
        : /investing/i.test(heading)
          ? "Net cash from investing activities"
          : /financing/i.test(heading)
            ? "Net cash from financing activities"
            : "";
      if (label) return { ...row, label };
    }
    return row;
  });
}

export function assignCost(rows) {
  let heading = "";
  return (rows || []).map((row) => {
    if (row.kind === "heading") {
      heading = String(row.label || "");
      return row;
    }
    const cost = costLine(row.label, heading);
    if (/^(gross profit|operating income|net income|net profit)/i.test(String(row.label || ""))) heading = "";
    return { ...row, cost };
  });
}

export function prepareStatementRows(section) {
  const rows = /cash flow/i.test(String(section?.title || "")) ? fillCashSubtotals(section?.rows) : (section?.rows || []);
  return assignCost(rows);
}

export function quarterlyNote(title, note) {
  const text = String(note || "");
  if (!/^profit and loss quarterly$/i.test(String(title || "").trim())) return text;
  return text.replace(/for the month ended/gi, "For the year ended");
}

function roundHalfAway(value, digits) {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

function formatCount(value) {
  const digits = Number.isInteger(value) ? 0 : 1;
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function lineChange(current, previous, row) {
  const format = row.formats?.[0] || row.format || "money";
  const points = format === "percent" || format === "percent2";
  const cost = typeof row.cost === "boolean" ? row.cost : costLine(row.label, row.heading);
  const now = Number(current);
  const then = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(then)) return null;
  if (points) {
    const pp = (now - then) * 100;
    const shown = Math.abs(pp) >= 10 ? roundHalfAway(pp, 0) : roundHalfAway(pp, 1);
    if (shown === 0) return null;
    return { up: shown > 0, favourable: shown > 0, text: `${formatCount(Math.abs(shown))} pp` };
  }
  const delta = now - then;
  const basis = cost ? Math.abs(now) - Math.abs(then) : delta;
  const shown = roundHalfAway(basis, 0);
  if (shown === 0) return null;
  const previousShown = roundHalfAway(then, 0);
  const base = cost ? Math.abs(then) : then;
  const usePercent = (cost ? Math.abs(previousShown) > 0 : previousShown > 0) && base > 0;
  let text = formatCount(Math.abs(shown));
  if (usePercent) {
    const pct = Math.abs(roundHalfAway((basis / base) * 100, 0));
    text = pct >= 200 ? formatCount(Math.abs(shown)) : `${formatCount(pct)}%`;
  }
  return { up: shown > 0, favourable: cost ? shown < 0 : shown > 0, text };
}
