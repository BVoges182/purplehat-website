import { COINS } from "../../shared/coins.js";
import { groupTriggerHistory, mergeStored, tradesFromBook } from "../../shared/zigzag30/history.js";
import { closedOnly, runEngine } from "../../shared/zigzag30/engine.js";
import { readCandles, readVenue, saveCandles } from "./db.js";
import { mapLimit, productionMarket, resolveVenues } from "./refresh.js";

const INTERVAL = 30 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const WARMUP = 200;
const PAGE = 1000;

let job = null;

function ensure(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS zigzag30_trades (
      symbol TEXT NOT NULL,
      trade_id TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (symbol, trade_id)
    );
    CREATE TABLE IF NOT EXISTS zigzag30_backfill (
      symbol TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      pages INTEGER,
      candles INTEGER,
      trades INTEGER,
      overlaps INTEGER,
      differed INTEGER,
      error TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function backfillSpan(now = Date.now()) {
  const bars = Math.ceil(NINETY_DAYS / INTERVAL) + WARMUP;
  return {
    bars,
    start: Math.floor((now - bars * INTERVAL) / INTERVAL) * INTERVAL,
  };
}

export async function pullBackfillCandles(candlesFn, now = Date.now()) {
  const span = backfillSpan(now);
  let start = span.start;
  const byTime = new Map();
  let pages = 0;
  while (byTime.size < span.bars && start < now && pages < 8) {
    const batch = await candlesFn(PAGE, start);
    pages += 1;
    if (!batch?.length) break;
    let last = start;
    for (const candle of batch) {
      const open = Number(candle.openTime);
      if (Number.isFinite(open) && open + INTERVAL <= now) byTime.set(open, candle);
      if (Number.isFinite(open)) last = Math.max(last, open);
    }
    const next = last + INTERVAL;
    if (next <= start) break;
    start = next;
  }
  return {
    pages,
    start: span.start,
    candles: [...byTime.values()].sort((left, right) => Number(left.openTime) - Number(right.openTime)),
  };
}

function readRow(db, symbol, tradeId) {
  ensure(db);
  const row = db.prepare("SELECT source, payload FROM zigzag30_trades WHERE symbol = ? AND trade_id = ?").get(symbol, tradeId);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.payload), source: row.source };
  } catch {
    return null;
  }
}

export function storeTrade(db, symbol, trade, source, now = Date.now()) {
  ensure(db);
  const existing = readRow(db, symbol, trade.id);
  const decision = mergeStored(existing, trade, source);
  if (decision.action === "keep-live" || decision.action === "same") return decision;
  db.prepare(`
    INSERT INTO zigzag30_trades (symbol, trade_id, source, payload, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol, trade_id) DO UPDATE SET
      source = excluded.source,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run(symbol, trade.id, decision.source, JSON.stringify(decision.trade), now);
  return decision;
}

export function readTrades(db, symbol) {
  ensure(db);
  return db.prepare("SELECT payload, source FROM zigzag30_trades WHERE symbol = ?").all(symbol).map((row) => {
    try {
      return { ...JSON.parse(row.payload), source: row.source };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function readBackfill(db, symbol) {
  ensure(db);
  return db.prepare(`
    SELECT status, pages, candles, trades, overlaps, differed, error, updated_at AS updatedAt
    FROM zigzag30_backfill WHERE symbol = ?
  `).get(symbol) || null;
}

export function backfillStatus(db) {
  ensure(db);
  const rows = new Map(db.prepare(`
    SELECT symbol, status, pages, candles, trades, overlaps, differed, error, updated_at AS updatedAt
    FROM zigzag30_backfill
  `).all().map((row) => [row.symbol, row]));
  return COINS.map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    ...(rows.get(coin.symbol) || { status: "pending" }),
  }));
}

function writeStatus(db, symbol, patch, now = Date.now()) {
  ensure(db);
  const current = readBackfill(db, symbol) || {};
  const next = { ...current, ...patch };
  db.prepare(`
    INSERT INTO zigzag30_backfill (symbol, status, pages, candles, trades, overlaps, differed, error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      status = excluded.status,
      pages = excluded.pages,
      candles = excluded.candles,
      trades = excluded.trades,
      overlaps = excluded.overlaps,
      differed = excluded.differed,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(
    symbol,
    next.status || "pending",
    next.pages ?? null,
    next.candles ?? null,
    next.trades ?? null,
    next.overlaps ?? null,
    next.differed ?? null,
    next.error || null,
    now,
  );
}

export function rememberLiveTrades(db, symbol, book, now = Date.now()) {
  const trades = tradesFromBook(book);
  let overlaps = 0;
  let differed = 0;
  for (const trade of trades) {
    const decision = storeTrade(db, symbol, trade, "live", now);
    if (decision.overlap) overlaps += 1;
    if (decision.differed) differed += 1;
  }
  return { stored: trades.length, overlaps, differed };
}

export function zigzagHistory(db, coin, now = Date.now()) {
  const trades = readTrades(db, coin.symbol);
  const last = closedOnly(readCandles(db, coin.symbol, "30m"), now).at(-1);
  const job = readBackfill(db, coin.symbol);
  return {
    id: coin.id,
    symbol: coin.symbol,
    backfill: job?.status || "pending",
    overlaps: job?.overlaps ?? 0,
    differed: job?.differed ?? 0,
    trades: groupTriggerHistory(trades, last ? Number(last.close) : null),
    updatedAt: now,
  };
}

async function backfillCoin(db, coin, deps, now) {
  const venue = readVenue(db, coin.symbol);
  if (venue?.provider === "unavailable") {
    writeStatus(db, coin.symbol, { status: "done", pages: 0, candles: 0, trades: 0, overlaps: 0, differed: 0, error: "No 30m data" }, now);
    return { id: coin.id, status: "done", trades: 0 };
  }
  writeStatus(db, coin.symbol, { status: "running", error: null }, now);
  const pulled = await pullBackfillCandles(
    (limit, startTime) => deps.binance.candles(coin.symbol, "30m", limit, { startTime }),
    now,
  );
  saveCandles(db, coin.symbol, "30m", pulled.candles, now);
  const book = runEngine(pulled.candles, { coinId: coin.id, startIndex: 150, now, window: pulled.candles.length });
  const trades = tradesFromBook(book);
  let overlaps = 0;
  let differed = 0;
  for (const trade of trades) {
    const decision = storeTrade(db, coin.symbol, trade, "backfill", now);
    if (decision.overlap) overlaps += 1;
    if (decision.differed) differed += 1;
  }
  writeStatus(db, coin.symbol, {
    status: "done",
    pages: pulled.pages,
    candles: pulled.candles.length,
    trades: trades.length,
    overlaps,
    differed,
    error: null,
  }, now);
  console.log(`Backfill ${coin.id}: pages ${pulled.pages} candles ${pulled.candles.length} trades ${trades.length} overlaps ${overlaps} differed ${differed}`);
  return { id: coin.id, status: "done", pages: pulled.pages, candles: pulled.candles.length, trades: trades.length, overlaps, differed };
}

export async function runZigzagBackfill(db, coins = COINS, options = {}) {
  if (job && !options.force) return job;
  job = runBackfillBody(db, coins, options).finally(() => {
    job = null;
  });
  return job;
}

async function runBackfillBody(db, coins, options) {
  const now = options.now ?? Date.now();
  const pending = coins.filter((coin) => {
    const row = readBackfill(db, coin.symbol);
    return options.force || !row || row.status !== "done";
  });
  if (!pending.length) return backfillStatus(db);
  try {
    await resolveVenues(db, pending, options);
  } catch (error) {
    console.error(`Backfill venue check failed: ${error.message}`);
  }
  const deps = {
    binance: options.binance || productionMarket(options).binance,
  };
  await mapLimit(pending, options.concurrency ?? 4, async (coin) => {
    try {
      return await backfillCoin(db, coin, deps, now);
    } catch (error) {
      writeStatus(db, coin.symbol, { status: "error", error: error.message }, now);
      console.error(`Backfill ${coin.id} failed: ${error.message}`);
      return { id: coin.id, status: "error", error: error.message };
    }
  });
  return backfillStatus(db);
}

export function startZigzagBackfill(db) {
  return runZigzagBackfill(db).catch((error) => {
    console.error(`30m backfill failed: ${error.message}`);
  });
}
