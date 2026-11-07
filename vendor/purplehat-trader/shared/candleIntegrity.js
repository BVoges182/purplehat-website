export const DATA_CORRECTION_VERSION = "binance-spot-kline-close-1";

const INTERVAL_MS = { "4h": 4 * 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000 };

export function intervalMs(interval) {
  return INTERVAL_MS[interval] || 0;
}

export function candleShapeOk(candle) {
  const openTime = Number(candle?.openTime);
  const closeTime = Number(candle?.closeTime);
  const open = Number(candle?.open);
  const high = Number(candle?.high);
  const low = Number(candle?.low);
  const close = Number(candle?.close);
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime) || closeTime <= openTime) return false;
  if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return false;
  if (low > Math.min(open, close) || high < Math.max(open, close)) return false;
  return true;
}

export function sessionAligned(interval, openTime, closeTime) {
  const size = intervalMs(interval);
  if (!size || Number(openTime) < 1e11) return true;
  return Number(closeTime) === Number(openTime) + size - 1;
}

export function acceptedCandle(candle, interval) {
  return candleShapeOk(candle) && sessionAligned(interval, candle.openTime, candle.closeTime);
}

export function dedupeCandles(candles) {
  const byTime = new Map();
  for (const candle of Array.isArray(candles) ? candles : []) {
    if (candle?.openTime == null) continue;
    byTime.set(Number(candle.openTime), candle);
  }
  return [...byTime.values()].sort((left, right) => Number(left.openTime) - Number(right.openTime));
}
