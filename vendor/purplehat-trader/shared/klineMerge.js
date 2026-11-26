const INTERVAL_MS = {
  "30m": 30 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export function intervalMs(interval) {
  return INTERVAL_MS[interval] || 0;
}

export function mergeKlines(existing, incoming, now = Date.now()) {
  const byTime = new Map();
  for (const candle of existing || []) {
    if (candle?.openTime == null) continue;
    byTime.set(Number(candle.openTime), { ...candle });
  }
  for (const candle of incoming || []) {
    if (candle?.openTime == null) continue;
    const openTime = Number(candle.openTime);
    const previous = byTime.get(openTime);
    const closed = Number(candle.closeTime) < now;
    if (previous && Number(previous.closeTime) < now && !closed) continue;
    byTime.set(openTime, { ...candle, finalized: closed ? 1 : 0 });
  }
  return [...byTime.values()].sort((left, right) => Number(left.openTime) - Number(right.openTime));
}

export function missingAfter(lastOpenTime, interval, now = Date.now(), limit = 1000) {
  const size = intervalMs(interval);
  if (!size || !Number.isFinite(Number(lastOpenTime))) return [];
  const lastReady = Math.floor(now / size) * size - size;
  const opens = [];
  for (let open = Number(lastOpenTime) + size; open <= lastReady && opens.length < limit; open += size) {
    opens.push(open);
  }
  return opens;
}
