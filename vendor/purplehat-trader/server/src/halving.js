import { halvingModel } from "../../shared/halvingCycle.js";

const DAY = 24 * 60 * 60 * 1000;
const BINANCE_START = Date.parse("2017-08-17T00:00:00Z");
const HEIGHT_TTL = 4 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

function ensure(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS halving_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      height INTEGER,
      checked_at INTEGER,
      payload TEXT
    );
    CREATE TABLE IF NOT EXISTS halving_prices (
      source TEXT NOT NULL,
      time INTEGER NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (source, time)
    );
  `);
}

function readPrices(db) {
  ensure(db);
  return db.prepare("SELECT time, close, source FROM halving_prices ORDER BY time").all();
}

function writePrices(db, source, points) {
  ensure(db);
  const insert = db.prepare(`
    INSERT INTO halving_prices (source, time, close) VALUES (?, ?, ?)
    ON CONFLICT(source, time) DO UPDATE SET close = excluded.close
  `);
  db.exec("BEGIN");
  try {
    for (const point of points) insert.run(source, Number(point.time), Number(point.close));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function weeklyCloses(points) {
  const weeks = new Map();
  for (const point of points || []) {
    const time = Number(point.time);
    if (!Number.isFinite(time) || time < Date.UTC(2011, 0, 1)) continue;
    const date = new Date(time);
    const mondayDelta = (date.getUTCDay() + 6) % 7;
    const week = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - mondayDelta * DAY;
    weeks.set(week, { time: week, close: Number(point.close) });
  }
  return [...weeks.values()].sort((left, right) => left.time - right.time);
}

export function halvingView(db, now = Date.now()) {
  ensure(db);
  const meta = db.prepare("SELECT height, checked_at AS checkedAt FROM halving_meta WHERE id = 1").get();
  const prices = readPrices(db).map((row) => ({ time: Number(row.time), close: Number(row.close) }));
  if (!meta?.height || !prices.length) {
    return {
      empty: true,
      message: "No data yet — press Refresh",
      state: null,
      chip: null,
      weeks: [],
      table: [],
    };
  }
  const asOf = new Date(meta.checkedAt || now).toISOString().slice(0, 10);
  const model = halvingModel({ height: meta.height, asOf, now, points: prices });
  const weeks = weeklyCloses(prices);
  return {
    empty: false,
    stale: now - Number(meta.checkedAt) > HEIGHT_TTL,
    checkedAt: meta.checkedAt,
    height: meta.height,
    state: model.state,
    action: model.action,
    days: model.days,
    when: model.when,
    chip: model.chip,
    estimate: model.estimate,
    upcoming: {
      buy: model.upcoming.buy,
      sell: model.upcoming.sell,
      halving: model.upcoming.halving,
      buyMs: model.upcoming.buyMs,
      sellMs: model.upcoming.sellMs,
    },
    lastSell: model.lastSell ? { sell: model.lastSell.sell, sellMs: model.lastSell.sellMs } : null,
    table: model.table.map((row) => ({
      cycle: row.cycle,
      buy: row.buy,
      sell: row.sell,
      buyMs: row.buyMs,
      sellMs: row.sellMs,
      returnPct: row.returnPct ?? null,
      maxDdPct: row.maxDdPct ?? null,
    })),
    weeks: weeks.map((row) => ({ time: row.time, close: row.close })),
    price: weeks.at(-1)?.close ?? null,
  };
}

async function readHeight(fetchImpl) {
  try {
    const response = await fetchImpl("https://mempool.space/api/blocks/tip/height", { headers: { accept: "text/plain" } });
    if (response.ok) {
      const height = Number(String(await response.text()).trim());
      if (Number.isFinite(height)) return height;
    }
  } catch {
    // The public fallback is the next request.
  }
  const response = await fetchImpl("https://blockchain.info/q/getblockcount", { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error("Block height unavailable");
  const height = Number(String(await response.text()).trim());
  if (!Number.isFinite(height)) throw new Error("Block height unavailable");
  return height;
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Price history ${response.status}`);
  return response.json();
}

export async function refreshHalving(db, options = {}) {
  ensure(db);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now ?? Date.now();
  const meta = db.prepare("SELECT height, checked_at AS checkedAt FROM halving_meta WHERE id = 1").get();
  let height = meta?.height ?? null;
  if (!height || options.force || now - Number(meta?.checkedAt || 0) >= HEIGHT_TTL) {
    height = await readHeight(fetchImpl);
  }
  const haveChain = db.prepare("SELECT COUNT(*) AS n FROM halving_prices WHERE source = 'blockchain'").get().n;
  if (!haveChain) {
    const chart = await fetchJson(fetchImpl, "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false");
    const early = (chart.values || [])
      .filter((point) => point.x * 1000 < BINANCE_START)
      .map((point) => ({ time: point.x * 1000, close: Number(point.y) }));
    writePrices(db, "blockchain", early);
  }
  const last = db.prepare("SELECT MAX(time) AS time FROM halving_prices WHERE source = 'binance'").get();
  let start = last?.time != null ? Number(last.time) + DAY : BINANCE_START;
  const fresh = [];
  while (start < now) {
    const rows = await fetchJson(fetchImpl, `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=1000`);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      if (Number(row[6]) < now) fresh.push({ time: Number(row[0]), close: Number(row[4]) });
    }
    const next = Number(rows.at(-1)[0]) + DAY;
    if (next <= start) break;
    start = next;
    if (rows.length < 1000) break;
  }
  if (fresh.length) writePrices(db, "binance", fresh);
  db.prepare(`
    INSERT INTO halving_meta (id, height, checked_at, payload) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET height = excluded.height, checked_at = excluded.checked_at, payload = excluded.payload
  `).run(height, now, "");
  return halvingView(db, now);
}

export { WEEK };
