import { withBackoff } from "./backoff.js";
import { binanceBase, normalizeKline } from "./binance.js";

export const BINANCE_FALLBACK_BASE = "https://api.binance.com";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 30;

export function historyHosts() {
  const primary = binanceBase();
  return primary === BINANCE_FALLBACK_BASE ? [primary] : [primary, BINANCE_FALLBACK_BASE];
}

async function fetchPage(base, symbol, interval, startTime, fetchImpl) {
  const url = `${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${PAGE_LIMIT}&startTime=${startTime}`;
  return withBackoff(async () => {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      const error = new Error(`Binance ${response.status} for ${url}`);
      error.status = response.status;
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Binance klines were not a list");
    return rows.map(normalizeKline);
  });
}

async function paginateHost(base, { symbol, interval, startTime, endTime, now, fetchImpl }) {
  const out = [];
  const seen = new Set();
  let cursor = startTime;
  for (let page = 0; page < MAX_PAGES && cursor < endTime; page += 1) {
    const rows = await fetchPage(base, symbol, interval, cursor, fetchImpl);
    if (!rows.length) break;
    for (const candle of rows) {
      if (candle.openTime < startTime || candle.openTime >= endTime) continue;
      if (!(candle.closeTime < now)) continue;
      if (seen.has(candle.openTime)) continue;
      seen.add(candle.openTime);
      out.push(candle);
    }
    const next = rows[rows.length - 1].openTime + 1;
    if (!(next > cursor)) break;
    cursor = next;
    if (rows.length < PAGE_LIMIT) break;
  }
  out.sort((left, right) => left.openTime - right.openTime);
  return out;
}

export async function fetchKlineHistory({
  symbol,
  interval,
  startTime,
  endTime = Date.now(),
  now = Date.now(),
  fetchImpl = fetch,
  hosts = historyHosts(),
} = {}) {
  let lastError;
  for (const host of hosts) {
    try {
      return await paginateHost(host, { symbol, interval, startTime, endTime, now, fetchImpl });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Binance kline history failed");
}
