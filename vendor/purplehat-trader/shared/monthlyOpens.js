export const MONTHLY_OPEN_CACHE_MS = 60 * 60 * 1000;
export const MONTHLY_OPEN_COUNT = 3;

const OPEN_SLOTS = {
  current: { slot: "current", color: "#2563EB", lineWidth: 2.5 },
  previous: { slot: "previous", color: "#7C3AED", lineWidth: 2 },
  older: { slot: "older", color: "#0D9488", lineWidth: 2 },
};

export function monthlyOpenStyle(openTime, now = Date.now()) {
  const age = monthKey(now) - monthKey(openTime);
  if (age <= 0) return OPEN_SLOTS.current;
  if (age === 1) return OPEN_SLOTS.previous;
  return OPEN_SLOTS.older;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthKey(time) {
  const date = new Date(time);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function shortMonth(time) {
  return SHORT_MONTHS[new Date(time).getUTCMonth()];
}

function asCandle(row) {
  if (!row) return null;
  if (Array.isArray(row)) {
    return { openTime: Number(row[0]), open: row[1] == null ? "" : String(row[1]) };
  }
  if (row.openTime == null || row.open == null) return null;
  return { openTime: Number(row.openTime), open: String(row.open) };
}

export function firstCandlePerMonth(candles) {
  const rows = (Array.isArray(candles) ? candles : [])
    .map(asCandle)
    .filter((row) => row && Number.isFinite(row.openTime) && row.open !== "")
    .sort((left, right) => left.openTime - right.openTime);
  const seen = new Set();
  const months = [];
  for (const row of rows) {
    const key = monthKey(row.openTime);
    if (seen.has(key)) continue;
    seen.add(key);
    months.push(row);
  }
  return months;
}

export function selectMonthlyOpens(klines, now = Date.now(), format = (value) => String(value)) {
  const months = firstCandlePerMonth(klines)
    .filter((row) => row.openTime <= now)
    .slice(-MONTHLY_OPEN_COUNT);
  return months.map((row) => {
    const style = monthlyOpenStyle(row.openTime, now);
    const month = shortMonth(row.openTime);
    const price = format(row.open);
    return {
      openTime: row.openTime,
      open: row.open,
      month,
      current: style.slot === "current",
      slot: style.slot,
      label: style.slot === "current" ? `${month} open ${price}` : `${month} open`,
      lineWidth: style.lineWidth,
      color: style.color,
    };
  });
}

export function monthlyOpenSegments(opens, candles, now = Date.now(), format = (value) => String(value)) {
  const rows = (Array.isArray(candles) ? candles : [])
    .map((row) => ({ openTime: Number(row?.openTime), closeTime: Number(row?.closeTime) }))
    .filter((row) => Number.isFinite(row.openTime))
    .sort((left, right) => left.openTime - right.openTime);
  const closed = rows.filter((row) => Number.isFinite(row.closeTime) && row.closeTime < now);
  return (Array.isArray(opens) ? opens : []).map((open) => {
    const openTime = Number(open.openTime);
    const key = monthKey(openTime);
    const style = monthlyOpenStyle(openTime, now);
    const inMonth = rows.filter((row) => monthKey(row.openTime) === key && row.openTime <= now);
    const startTime = inMonth[0]?.openTime ?? openTime;
    const closedInMonth = closed.filter((row) => monthKey(row.openTime) === key);
    const endTime = style.slot === "current"
      ? (closedInMonth.at(-1)?.openTime ?? startTime)
      : (inMonth.at(-1)?.openTime ?? startTime);
    const month = open.month || shortMonth(openTime);
    const price = Number(open.open);
    return {
      openTime,
      open: String(open.open),
      price,
      month,
      current: style.slot === "current",
      slot: style.slot,
      startTime,
      endTime: endTime < startTime ? startTime : endTime,
      label: `${month} open ${format(open.open)}`,
      color: style.color,
      lineWidth: style.lineWidth,
    };
  });
}

export function createMonthlyOpenStore() {
  const cache = new Map();
  return {
    async load({ key, now, fetchKlines, format }) {
      const hit = cache.get(key);
      const sameMonth = hit && monthKey(hit.at) === monthKey(now);
      if (hit && sameMonth && now - hit.at < MONTHLY_OPEN_CACHE_MS) {
        return selectMonthlyOpens(hit.klines, now, format);
      }
      const klines = await fetchKlines();
      cache.set(key, { at: now, klines: Array.isArray(klines) ? klines : [] });
      return selectMonthlyOpens(klines, now, format);
    },
  };
}
