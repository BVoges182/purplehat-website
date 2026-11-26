import { COINS } from "../../shared/coins.js";
import { missingAfter } from "../../shared/klineMerge.js";
import { detailCoin, presentCoin, presentOverview } from "../../shared/zigzag30/present.js";
import { winRate } from "../../shared/zigzag30/winRate.js";
import { fetchStats, recordBatch } from "./backoff.js";
import { readCandles, readTicker, readVenue, saveCandles } from "./db.js";
import { mapLimit, productionMarket, refreshTickerBatch } from "./refresh.js";
import { readBackfill, readTrades, rememberLiveTrades } from "./zigzagBackfill.js";

const WINDOW = 1000;
const THIRTY_MIN = 30 * 60 * 1000;
let batchJob = null;

function ensure(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS zigzag30_snapshot (
      symbol TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function readSnapshot(db, symbol) {
  ensure(db);
  const row = db.prepare("SELECT payload FROM zigzag30_snapshot WHERE symbol = ?").get(symbol);
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function writeSnapshot(db, symbol, payload, at) {
  ensure(db);
  db.prepare(`
    INSERT INTO zigzag30_snapshot (symbol, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(symbol, JSON.stringify(payload), at);
}

export function buildCoinSnapshot(db, coin, now = Date.now(), options = {}) {
  const candles = readCandles(db, coin.symbol, "30m");
  const ticker = readTicker(db, coin.symbol);
  const venue = readVenue(db, coin.symbol);
  const presented = presentCoin({ coin, candles, ticker, venue, now });
  const book = presented.book || null;
  const { book: _book, ...payload } = presented;
  if (options.rememberTrades && book) rememberLiveTrades(db, coin.symbol, book, now);
  return payload;
}

export function refreshSnapshots(db, coins = COINS, now = Date.now()) {
  const rows = [];
  for (const coin of coins) {
    const payload = buildCoinSnapshot(db, coin, now, { rememberTrades: true });
    writeSnapshot(db, coin.symbol, payload, now);
    rows.push(payload);
  }
  return rows;
}

export function zigzagOverview(db, now = Date.now()) {
  const rows = COINS.map((coin) => readSnapshot(db, coin.symbol) || buildCoinSnapshot(db, coin, now));
  const body = presentOverview(rows, now);
  body.stamp = body.stamp || "";
  for (const coin of body.coins) Object.assign(coin, tradeRecord(db, coin, now));
  return body;
}

function tradeRecord(db, coin, now) {
  const job = readBackfill(db, coin.symbol);
  const backfill = job?.status || "pending";
  return {
    backfill,
    winRate: backfill === "done" ? winRate(readTrades(db, coin.symbol), now) : null,
  };
}

export function zigzagCoin(db, coin, now = Date.now()) {
  const row = readSnapshot(db, coin.symbol) || buildCoinSnapshot(db, coin, now);
  if (!readSnapshot(db, coin.symbol)) writeSnapshot(db, coin.symbol, row, now);
  return { ...detailCoin(row), ...tradeRecord(db, coin, now) };
}

async function fetchBinanceKlines(deps, symbol, limit, startTime) {
  return deps.binance.candles(symbol, "30m", limit, startTime == null ? undefined : { startTime });
}

async function fetchHyperliquidKlines(deps, market, limit, startTime) {
  const end = Date.now();
  const start = startTime ?? (end - limit * THIRTY_MIN);
  const rows = await deps.hyperliquidCandles(market, start, end);
  return (rows || []).slice(-limit);
}

export async function refreshZigzag30(db, coins = COINS, options = {}) {
  if (batchJob) return batchJob;
  batchJob = refreshZigzagBody(db, coins, options).finally(() => {
    batchJob = null;
  });
  return batchJob;
}

async function refreshZigzagBody(db, coins, options) {
  const started = Date.now();
  const before = fetchStats().calls;
  const now = options.now ?? Date.now();
  const shared = productionMarket(options);
  const deps = {
    binance: shared.binance,
    hyperliquidCandles: async (market, start, end) => {
      const rows = await shared.hyperliquid.candles(market, "30m", WINDOW);
      return (rows || []).filter((row) => row.openTime >= start && row.openTime <= end);
    },
  };
  const results = await mapLimit(coins, options.concurrency ?? 4, async (coin) => {
    try {
      const venue = readVenue(db, coin.symbol);
      const stored = readCandles(db, coin.symbol, "30m");
      const last = stored.at(-1);
      const missing = last ? missingAfter(last.openTime, "30m", now, WINDOW) : [];
      let fetched = [];
      if (venue?.provider === "hyperliquid") {
        const start = missing.length > 2 ? missing[0] : last ? last.openTime + THIRTY_MIN : null;
        fetched = await fetchHyperliquidKlines(deps, venue.market, missing.length > 2 || !last ? WINDOW : 2, start);
      } else if (venue?.provider === "unavailable") {
        const payload = buildCoinSnapshot(db, coin, now, { rememberTrades: true });
        payload.unavailable = true;
        payload.message = payload.message || "No 30m data";
        writeSnapshot(db, coin.symbol, payload, now);
        return { id: coin.id, error: "unavailable", fetched: 0 };
      } else if (!last || missing.length > 2) {
        fetched = await fetchBinanceKlines(deps, coin.symbol, WINDOW, missing.length > 2 ? missing[0] : undefined);
      } else {
        fetched = await fetchBinanceKlines(deps, coin.symbol, 2, last.openTime + THIRTY_MIN);
      }
      const saved = saveCandles(db, coin.symbol, "30m", fetched, now);
      const payload = buildCoinSnapshot(db, coin, now, { rememberTrades: true });
      writeSnapshot(db, coin.symbol, payload, now);
      return { id: coin.id, fetched: fetched.length, written: saved.written, error: payload.unavailable ? payload.message : "" };
    } catch (error) {
      const payload = buildCoinSnapshot(db, coin, now, { rememberTrades: true });
      payload.unavailable = payload.chart?.length ? payload.unavailable : true;
      if (!payload.chart?.length) payload.message = "No 30m data";
      writeSnapshot(db, coin.symbol, payload, now);
      return { id: coin.id, error: error.message, fetched: 0 };
    }
  });
  try {
    await refreshTickerBatch(db, coins, shared, options);
  } catch {
    // The 30m candles are already stored. Prices catch up on the next close.
  }
  const after = fetchStats();
  recordBatch({
    name: "30m",
    calls: after.calls - before,
    weight: after.maxWeight,
    ms: Date.now() - started,
  });
  return { coins: results, overview: zigzagOverview(db, now) };
}
