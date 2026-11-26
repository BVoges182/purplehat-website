export const FUNDING_VENUES = ["binance", "okx", "bybit"];

export function venueSymbols(symbol) {
  const pair = String(symbol || "");
  const base = pair.endsWith("USDT") ? pair.slice(0, -4) : pair;
  return {
    binance: `${base}USDT`,
    okx: `${base}-USDT-SWAP`,
    bybit: `${base}USDT`,
  };
}

export function eightHourEquivalent(rate, intervalHours) {
  const value = Number(rate);
  const hours = Number(intervalHours);
  if (!Number.isFinite(value)) return null;
  const span = Number.isFinite(hours) && hours > 0 ? hours : 8;
  return value * (8 / span);
}

export function intervalLabel(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return "8h";
  if (Math.abs(value - Math.round(value)) < 1e-6) return `${Math.round(value)}h`;
  return `${value}h`;
}

export function parseBinancePremiumIndex(body) {
  const rows = Array.isArray(body) ? body : (body?.symbol ? [body] : []);
  const map = new Map();
  for (const row of rows) {
    const symbol = String(row?.symbol || "");
    const rate = Number(row?.lastFundingRate);
    if (!symbol || !Number.isFinite(rate)) continue;
    const next = Number(row.nextFundingTime);
    map.set(symbol, { rate, nextFundingTime: Number.isFinite(next) ? next : null });
  }
  return map;
}

export function parseBinanceFundingInfo(body) {
  const map = new Map();
  for (const row of Array.isArray(body) ? body : []) {
    const hours = Number(row?.fundingIntervalHours);
    if (row?.symbol && Number.isFinite(hours) && hours > 0) map.set(String(row.symbol), hours);
  }
  return map;
}

export function parseBinanceFundingHistory(body) {
  return (Array.isArray(body) ? body : []).map((row) => ({
    fundingTime: Number(row?.fundingTime),
    rate: Number(row?.fundingRate),
  })).filter((row) => Number.isFinite(row.fundingTime) && Number.isFinite(row.rate));
}

export function parseOkxFundingQuote(body) {
  if (!body || String(body.code) !== "0" || !Array.isArray(body.data) || !body.data[0]) return { listed: false };
  const row = body.data[0];
  const rate = Number(row.fundingRate);
  if (!Number.isFinite(rate)) return { listed: false };
  const next = Number(row.nextFundingTime);
  const current = Number(row.fundingTime);
  let intervalHours = 8;
  if (Number.isFinite(next) && Number.isFinite(current) && next > current) intervalHours = (next - current) / 3_600_000;
  return {
    listed: true,
    rate,
    nextFundingTime: Number.isFinite(next) ? next : null,
    intervalHours,
  };
}

export function parseOkxFundingHistory(body) {
  return (Array.isArray(body?.data) ? body.data : []).map((row) => ({
    fundingTime: Number(row?.fundingTime),
    rate: Number(row?.fundingRate),
  })).filter((row) => Number.isFinite(row.fundingTime) && Number.isFinite(row.rate));
}

export function bybitIntervalHours(row) {
  const named = Number(row?.fundingIntervalHour ?? row?.fundingIntervalHours);
  if (Number.isFinite(named) && named > 0 && named <= 24) return named;
  const raw = Number(row?.fundingInterval);
  if (!Number.isFinite(raw) || raw <= 0) return 8;
  return raw >= 30 ? raw / 60 : raw;
}

export function parseBybitTickers(body) {
  const map = new Map();
  for (const row of body?.result?.list || []) {
    const rate = Number(row?.fundingRate);
    if (!row?.symbol || !Number.isFinite(rate)) continue;
    const next = Number(row.nextFundingTime);
    map.set(String(row.symbol), { rate, nextFundingTime: Number.isFinite(next) ? next : null });
  }
  return map;
}

export function parseBybitInstruments(body) {
  const map = new Map();
  for (const row of body?.result?.list || []) {
    if (row?.symbol) map.set(String(row.symbol), bybitIntervalHours(row));
  }
  return { map, cursor: String(body?.result?.nextPageCursor || "") };
}

export function parseBybitFundingHistory(body) {
  return (body?.result?.list || []).map((row) => ({
    fundingTime: Number(row?.fundingRateTimestamp),
    rate: Number(row?.fundingRate),
  })).filter((row) => Number.isFinite(row.fundingTime) && Number.isFinite(row.rate));
}

function candleOpenFor(rows, time, size) {
  const target = Number(time);
  for (const row of rows || []) {
    const open = Number(row.openTime);
    if (target >= open && target < open + size) return open;
  }
  return null;
}

// One 8h-equivalent point per price candle, on the same time scale as the Binance histogram.
export function venueLinePlot(rows, prints, interval) {
  const size = interval === "1d" ? 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  const byOpen = new Map();
  for (const print of prints || []) {
    const time = Number(print.time ?? print.fundingTime);
    const equivalent = eightHourEquivalent(print.rate, print.intervalHours);
    const open = candleOpenFor(rows, time, size);
    if (open == null || equivalent == null) continue;
    byOpen.set(open, equivalent * 100);
  }
  return (rows || []).map((row) => {
    const time = Math.floor(Number(row.openTime) / 1000);
    const value = byOpen.get(Number(row.openTime));
    return value == null ? { time } : { time, value };
  });
}
