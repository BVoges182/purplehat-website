import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { acceptedCandle, dedupeCandles } from "../../shared/candleIntegrity.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time INTEGER NOT NULL,
  open TEXT NOT NULL,
  high TEXT NOT NULL,
  low TEXT NOT NULL,
  close TEXT NOT NULL,
  volume TEXT NOT NULL,
  close_time INTEGER NOT NULL,
  finalized INTEGER,
  PRIMARY KEY (symbol, interval, open_time)
);
CREATE TABLE IF NOT EXISTS candle_repairs (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickers (
  symbol TEXT PRIMARY KEY,
  last_price TEXT NOT NULL,
  change_percent TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS refreshes (
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  refreshed_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, interval)
);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  coin_id TEXT,
  timeframe TEXT NOT NULL,
  side TEXT NOT NULL,
  family TEXT NOT NULL,
  reason TEXT NOT NULL,
  bar_open_time INTEGER NOT NULL,
  context_open_time INTEGER,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  dismissed_at INTEGER
);
CREATE TABLE IF NOT EXISTS evaluations (
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  last_closed_open_time INTEGER,
  last_evaluated_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, interval)
);
CREATE TABLE IF NOT EXISTS alert_deliveries (
  signal_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at INTEGER,
  error TEXT,
  PRIMARY KEY (signal_id, channel)
);
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_sources (
  symbol TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  market TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT,
  decimals INTEGER,
  checked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playbook_trades (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  coin_id TEXT,
  timeframe TEXT NOT NULL,
  playbook_id TEXT NOT NULL,
  signal_open_time INTEGER NOT NULL,
  entry REAL NOT NULL,
  tp1 REAL NOT NULL,
  tp2 REAL NOT NULL,
  stop REAL NOT NULL,
  break_even REAL NOT NULL,
  outcome TEXT NOT NULL,
  r REAL,
  exit_open_time INTEGER,
  exit_price REAL,
  reward_risk REAL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playbook_preferences (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  playbook_id TEXT NOT NULL,
  reward_risk REAL NOT NULL,
  PRIMARY KEY (symbol, timeframe, playbook_id)
);
`;

export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  const signalColumns = db.prepare("PRAGMA table_info(signals)").all();
  if (signalColumns.length && !signalColumns.some((column) => column.name === "context_open_time")) {
    db.exec("ALTER TABLE signals ADD COLUMN context_open_time INTEGER");
  }
  if (signalColumns.length && !signalColumns.some((column) => column.name === "data_status")) {
    db.exec("ALTER TABLE signals ADD COLUMN data_status TEXT");
    db.exec("ALTER TABLE signals ADD COLUMN data_correction TEXT");
  }
  const candleColumns = db.prepare("PRAGMA table_info(candles)").all();
  if (candleColumns.length && !candleColumns.some((column) => column.name === "finalized")) {
    db.exec("ALTER TABLE candles ADD COLUMN finalized INTEGER");
  }
  const venueColumns = db.prepare("PRAGMA table_info(market_sources)").all();
  if (venueColumns.length && !venueColumns.some((column) => column.name === "decimals")) {
    db.exec("ALTER TABLE market_sources ADD COLUMN decimals INTEGER");
  }
  if (venueColumns.length && !venueColumns.some((column) => column.name === "tick_size")) {
    db.exec("ALTER TABLE market_sources ADD COLUMN tick_size TEXT");
  }
  const tradeColumns = db.prepare("PRAGMA table_info(playbook_trades)").all();
  if (tradeColumns.length && !tradeColumns.some((column) => column.name === "reward_risk")) {
    db.exec("ALTER TABLE playbook_trades ADD COLUMN reward_risk REAL");
  }
  return db;
}

function sameText(left, right) {
  return String(left) === String(right);
}

export function saveCandles(db, symbol, interval, candles, now = Date.now()) {
  const find = db.prepare(`
    SELECT open, high, low, close, volume, close_time AS closeTime, finalized
    FROM candles WHERE symbol = ? AND interval = ? AND open_time = ?
  `);
  const insert = db.prepare(`
    INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume, close_time, finalized)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, interval, open_time) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      close_time = excluded.close_time,
      finalized = excluded.finalized
  `);
  const finalize = db.prepare(`
    UPDATE candles SET finalized = 1
    WHERE symbol = ? AND interval = ? AND open_time = ? AND finalized IS NOT 1
  `);
  let written = 0;
  let skipped = 0;
  let rejected = 0;
  const corrected = [];
  db.exec("BEGIN");
  try {
    for (const candle of dedupeCandles(candles)) {
      if (!acceptedCandle(candle, interval)) {
        rejected += 1;
        continue;
      }
      const existing = find.get(symbol, interval, candle.openTime);
      const closed = Number(candle.closeTime) < now;
      const finalized = closed ? 1 : 0;
      if (existing && Number(existing.closeTime) < now && closed) {
        const ohlcChanged = !sameText(existing.open, candle.open)
          || !sameText(existing.high, candle.high)
          || !sameText(existing.low, candle.low)
          || !sameText(existing.close, candle.close);
        const unchanged = !ohlcChanged
          && sameText(existing.volume, candle.volume)
          && Number(existing.closeTime) === Number(candle.closeTime);
        if (unchanged) {
          if (Number(existing.finalized) !== 1) finalize.run(symbol, interval, candle.openTime);
          skipped += 1;
          continue;
        }
        insert.run(symbol, interval, candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime, finalized);
        written += 1;
        if (ohlcChanged) corrected.push(Number(candle.openTime));
        continue;
      }
      insert.run(symbol, interval, candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime, finalized);
      written += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { written, skipped, rejected, corrected };
}

export function readCandles(db, symbol, interval) {
  return db.prepare(`
    SELECT open_time AS openTime, open, high, low, close, volume, close_time AS closeTime, finalized
    FROM candles WHERE symbol = ? AND interval = ? ORDER BY open_time
  `).all(symbol, interval);
}

export function countCandles(db, symbol, interval) {
  return db.prepare("SELECT COUNT(*) AS n FROM candles WHERE symbol = ? AND interval = ?").get(symbol, interval).n;
}

export function markRefresh(db, symbol, interval, at = Date.now()) {
  db.prepare(`
    INSERT INTO refreshes (symbol, interval, refreshed_at) VALUES (?, ?, ?)
    ON CONFLICT(symbol, interval) DO UPDATE SET refreshed_at = excluded.refreshed_at
  `).run(symbol, interval, at);
}

export function latestRefresh(db, symbol) {
  const row = db.prepare("SELECT MIN(refreshed_at) AS at FROM refreshes WHERE symbol = ?").get(symbol);
  return row?.at || null;
}

export function saveTicker(db, symbol, ticker, at = Date.now()) {
  db.prepare(`
    INSERT INTO tickers (symbol, last_price, change_percent, refreshed_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      last_price = excluded.last_price,
      change_percent = excluded.change_percent,
      refreshed_at = excluded.refreshed_at
  `).run(symbol, ticker.lastPrice, ticker.changePercent, at);
}

export function readTicker(db, symbol) {
  const row = db.prepare("SELECT last_price AS lastPrice, change_percent AS changePercent, refreshed_at AS refreshedAt FROM tickers WHERE symbol = ?").get(symbol);
  return row || null;
}

export function saveVenue(db, symbol, venue, at = Date.now()) {
  db.prepare(`
    INSERT INTO market_sources (symbol, provider, market, label, kind, decimals, tick_size, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      provider = excluded.provider,
      market = excluded.market,
      label = excluded.label,
      kind = excluded.kind,
      decimals = excluded.decimals,
      tick_size = excluded.tick_size,
      checked_at = excluded.checked_at
  `).run(symbol, venue.provider, venue.market, venue.label, venue.kind || null, venue.decimals ?? null, venue.tickSize ?? null, at);
}

export function readVenue(db, symbol) {
  const row = db.prepare(`
    SELECT provider, market, label, kind, decimals, tick_size AS tickSize, checked_at AS checkedAt
    FROM market_sources WHERE symbol = ?
  `).get(symbol);
  return row || null;
}

function mapSignal(row) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    coinId: row.coin_id,
    timeframe: row.timeframe,
    side: row.side,
    family: row.family,
    reason: row.reason,
    barOpenTime: row.bar_open_time,
    score: row.score,
    createdAt: row.created_at,
    contextOpenTime: row.context_open_time,
    dismissedAt: row.dismissed_at,
    dataStatus: row.data_status || null,
    dataCorrection: row.data_correction || null,
  };
}

export function insertSignal(db, signal) {
  const info = db.prepare(`
    INSERT INTO signals (
      id, symbol, coin_id, timeframe, side, family, reason, bar_open_time, context_open_time, score, created_at,
      data_status, data_correction
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    signal.id,
    signal.symbol,
    signal.coinId,
    signal.timeframe,
    signal.side,
    signal.family,
    signal.reason,
    signal.barOpenTime,
    signal.contextOpenTime ?? signal.barOpenTime,
    signal.score,
    signal.createdAt,
    signal.dataStatus || null,
    signal.dataCorrection || null,
  );
  return info.changes === 1;
}

export function dismissSignal(db, id, at = Date.now()) {
  const info = db.prepare("UPDATE signals SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL").run(at, id);
  return info.changes === 1;
}

export function getCursor(db, symbol, interval) {
  const row = db.prepare("SELECT last_closed_open_time AS openTime FROM evaluations WHERE symbol = ? AND interval = ?").get(symbol, interval);
  return row ? row.openTime : null;
}

export function setCursor(db, symbol, interval, openTime, at = Date.now()) {
  db.prepare(`
    INSERT INTO evaluations (symbol, interval, last_closed_open_time, last_evaluated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol, interval) DO UPDATE SET
      last_closed_open_time = excluded.last_closed_open_time,
      last_evaluated_at = excluded.last_evaluated_at
  `).run(symbol, interval, openTime, at);
}

export function latestClosedOpen(db, symbol, interval, now = Date.now()) {
  const row = db.prepare(`
    SELECT MAX(open_time) AS openTime FROM candles
    WHERE symbol = ? AND interval = ? AND close_time < ?
  `).get(symbol, interval, now);
  return row?.openTime ?? null;
}

export function getDelivery(db, signalId, channel) {
  return db.prepare(`
    SELECT signal_id AS signalId, channel, status, sent_at AS sentAt, error
    FROM alert_deliveries WHERE signal_id = ? AND channel = ?
  `).get(signalId, channel) || null;
}

export function saveDelivery(db, signalId, channel, status, error, at = Date.now()) {
  db.prepare(`
    INSERT INTO alert_deliveries (signal_id, channel, status, sent_at, error)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(signal_id, channel) DO UPDATE SET
      status = excluded.status,
      error = excluded.error,
      sent_at = excluded.sent_at
  `).run(signalId, channel, status, at, error);
}

export function listFailedSignals(db) {
  return db.prepare(`
    SELECT s.* FROM signals s
    WHERE EXISTS (
      SELECT 1 FROM alert_deliveries d
      WHERE d.signal_id = s.id AND d.status = 'failed'
    )
  `).all().map(mapSignal);
}

export function listUnreadNotifications(db) {
  return db.prepare(`
    SELECT s.*, d.sent_at AS notified_at
    FROM alert_deliveries d
    JOIN signals s ON s.id = d.signal_id
    WHERE d.channel = 'inapp' AND d.status = 'unread'
    ORDER BY d.sent_at DESC
  `).all().map((row) => ({ ...mapSignal(row), notifiedAt: row.notified_at }));
}

export function markNotificationRead(db, id) {
  const info = db.prepare(`
    UPDATE alert_deliveries SET status = 'read'
    WHERE signal_id = ? AND channel = 'inapp' AND status = 'unread'
  `).run(id);
  return info.changes === 1;
}

export function querySignals(db, { symbol, view = "active", side, family, now = Date.now(), limit = 40 } = {}) {
  const rows = db.prepare(`
    SELECT * FROM signals
    WHERE (? IS NULL OR symbol = ?)
    ORDER BY bar_open_time DESC, id
  `).all(symbol || null, symbol || null).map(mapSignal).filter((signal) => {
    if (side && signal.side !== side) return false;
    if (family && signal.family !== family) return false;
    return true;
  });
  if (view === "dismissed") return rows.filter((signal) => signal.dismissedAt != null).slice(0, limit);
  if (view === "recent") return rows.slice(0, limit);
  if (view === "overview") {
    return rows.filter((signal) => {
      if (signal.dismissedAt != null || signal.dataStatus === "superseded-data-corrected") return false;
      return signal.contextOpenTime === latestClosedOpen(db, signal.symbol, signal.timeframe, now);
    });
  }
  return rows.filter((signal) => {
    if (signal.dismissedAt != null || signal.dataStatus === "superseded-data-corrected") return false;
    return signal.contextOpenTime === latestClosedOpen(db, signal.symbol, signal.timeframe, now);
  });
}

export function candleRepairApplied(db, id) {
  return Boolean(db.prepare("SELECT id FROM candle_repairs WHERE id = ?").get(id));
}

export function markCandleRepair(db, id, at = Date.now()) {
  db.prepare(`
    INSERT INTO candle_repairs (id, applied_at) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at
  `).run(id, at);
}

function pendingCorrectionId(version, symbol, interval, openTime) {
  return `pending:${version}:${symbol}:${interval}:${openTime}`;
}

export function queueCandleCorrections(db, version, symbol, interval, opens, at = Date.now()) {
  const insert = db.prepare(`
    INSERT INTO candle_repairs (id, applied_at) VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  for (const openTime of opens) insert.run(pendingCorrectionId(version, symbol, interval, openTime), at);
}

export function pendingCandleCorrections(db, version) {
  const prefix = `pending:${version}:`;
  const groups = new Map();
  for (const row of db.prepare("SELECT id FROM candle_repairs WHERE id LIKE ?").all(`${prefix}%`)) {
    const parts = String(row.id).slice(prefix.length).split(":");
    const openTime = Number(parts.pop());
    const interval = parts.pop();
    const symbol = parts.join(":");
    const key = `${symbol}|${interval}`;
    if (!groups.has(key)) groups.set(key, { symbol, interval, opens: [] });
    groups.get(key).opens.push(openTime);
  }
  return [...groups.values()];
}

export function clearCandleCorrections(db, version, symbol, interval, opens) {
  const remove = db.prepare("DELETE FROM candle_repairs WHERE id = ?");
  for (const openTime of opens) remove.run(pendingCorrectionId(version, symbol, interval, openTime));
}
