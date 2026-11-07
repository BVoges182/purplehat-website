const FOUR_HOURS = 4 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// Binance publishes the closed candle shortly after its open-time boundary.
export const PUBLICATION_DELAY_MS = 20_000;

export function intervalSize(interval) {
  return interval === "1d" ? ONE_DAY : FOUR_HOURS;
}

// Exchange candles are aligned to UTC epoch boundaries, not to when the page opened.
export function nextCloseTime(interval, now = Date.now()) {
  const size = intervalSize(interval);
  return Math.floor(now / size) * size + size;
}

export function candleCloseTime(interval, openTime) {
  return Number(openTime) + intervalSize(interval);
}

// Closed opens after lastProcessedOpen whose close has been published by `now`.
// An empty cursor does not invent a historical replay; the caller handles the first bar.
export function missedClosedOpens(interval, lastProcessedOpen, now = Date.now(), delay = PUBLICATION_DELAY_MS) {
  const previous = Number(lastProcessedOpen);
  if (!Number.isFinite(previous)) return [];
  const size = intervalSize(interval);
  const lastReadyOpen = Math.floor((now - delay) / size) * size - size;
  const opens = [];
  for (let open = previous + size; open <= lastReadyOpen; open += size) opens.push(open);
  return opens;
}

// First evaluation alerts only the latest closed bar. Later runs walk every missed bar in order.
export function newClosedOpens(previous, closedOpens) {
  const opens = (closedOpens || []).map(Number).filter(Number.isFinite);
  const latest = opens.at(-1) ?? null;
  if (latest == null || latest === previous) return [];
  if (previous == null) return [latest];
  return opens.filter((open) => open > previous);
}

export function processingKey(symbol, interval, openTime) {
  return `${symbol}|${interval}|${openTime}`;
}

export function createProcessingGate() {
  const seen = new Set();
  let running = false;
  return {
    start(keys) {
      const list = Array.isArray(keys) ? keys : [];
      if (running) return { ok: false, reason: "overlap", keys: [] };
      const fresh = list.filter((key) => !seen.has(key));
      if (!fresh.length) return { ok: false, reason: "duplicate", keys: [] };
      running = true;
      return {
        ok: true,
        keys: fresh,
        finish() {
          for (const key of fresh) seen.add(key);
          running = false;
        },
        cancel() {
          running = false;
        },
      };
    },
  };
}

export const BROWSER_REFRESH_LIMIT = "The open page refreshes the visible chart after exchange closes and cannot do that while the tab is closed or the computer is asleep. Scans for every watched symbol run only while the API process is running, and they do not run when that process is stopped.";
