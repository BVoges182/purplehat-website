import https from "node:https";
import zlib from "node:zlib";
import { createPacer, withBackoff, requestJson, HttpError } from "./backoff.js";
import {
  PEAK_REASON,
  POSITION_METHOD,
  READOUT_SYMBOL,
  READOUT_VENUE,
  classifyPositionBar,
  intervalMs,
  latestClosedOpen,
  netShortPeaks,
  ninetyDayPeak,
  nsPivotSettings,
  peakCaption,
  rollingPriorMax,
  withCumulative,
} from "../../shared/readouts.js";

const SYMBOL = READOUT_SYMBOL;
const VENUE = READOUT_VENUE;
const FUNDING_START = Date.parse("2025-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
// futures/data/openInterestHist rejects a startTime around 40 days back.
// 29 days keeps the one-bar overlap inside the retained window. Older bars come from Vision.
export const LIVE_POSITION_WINDOW_MS = 29 * DAY;

export function fapiBase(env = process.env) {
  return String(env.BINANCE_FAPI_BASE || "https://fapi.binance.com").replace(/\/$/, "");
}

export function visionBase(env = process.env) {
  return String(env.BINANCE_VISION_BASE || "https://data.binance.vision").replace(/\/$/, "");
}

function textNum(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "0";
}

function runMany(db, sql, rows, bind) {
  if (!rows.length) return;
  db.exec("BEGIN");
  try {
    const statement = db.prepare(sql);
    for (const row of rows) statement.run(...bind(row));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function upsertFundingRates(db, rows) {
  runMany(db, `
    INSERT INTO funding_rates (symbol, venue, funding_time, rate, mark_price)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol, venue, funding_time) DO UPDATE SET
      rate = excluded.rate,
      mark_price = excluded.mark_price
  `, rows, (row) => [SYMBOL, VENUE, Number(row.fundingTime), String(row.rate), row.markPrice == null ? null : String(row.markPrice)]);
}

export function saveFundingLive(db, row, fetchedAt) {
  db.prepare(`
    INSERT INTO funding_live (symbol, venue, rate, next_funding_time, mark_price, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, venue) DO UPDATE SET
      rate = excluded.rate,
      next_funding_time = excluded.next_funding_time,
      mark_price = excluded.mark_price,
      fetched_at = excluded.fetched_at
  `).run(SYMBOL, VENUE, String(row.rate), Number(row.nextFundingTime), row.markPrice == null ? null : String(row.markPrice), fetchedAt);
}

export function upsertOpenInterest(db, rows) {
  runMany(db, `
    INSERT INTO futures_oi (symbol, venue, time, oi_coin, oi_usd)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol, venue, time) DO UPDATE SET
      oi_coin = excluded.oi_coin,
      oi_usd = excluded.oi_usd
  `, rows, (row) => [SYMBOL, VENUE, Number(row.time), textNum(row.oiCoin), row.oiUsd == null ? null : textNum(row.oiUsd)]);
}

export function upsertFuturesKlines(db, interval, rows) {
  runMany(db, `
    INSERT INTO futures_klines (
      symbol, venue, interval, open_time, open, high, low, close, volume, taker_buy, close_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, venue, interval, open_time) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      taker_buy = excluded.taker_buy,
      close_time = excluded.close_time
  `, rows, (row) => [
    SYMBOL, VENUE, interval, Number(row.openTime), String(row.open), String(row.high), String(row.low),
    String(row.close), String(row.volume), String(row.takerBuy), Number(row.closeTime),
  ]);
}

export function replaceNetPositioning(db, interval, bars, now) {
  db.exec("BEGIN");
  try {
    const statement = db.prepare(`
      INSERT INTO net_positioning (
        symbol, venue, interval, open_time, d_oi, taker_buy, taker_sell, d_nl, d_ns, method, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, venue, interval, open_time) DO UPDATE SET
        d_oi = excluded.d_oi,
        taker_buy = excluded.taker_buy,
        taker_sell = excluded.taker_sell,
        d_nl = excluded.d_nl,
        d_ns = excluded.d_ns,
        method = excluded.method,
        created_at = excluded.created_at
    `);
    for (const bar of bars) {
      statement.run(
        SYMBOL, VENUE, interval, Number(bar.openTime), textNum(bar.dOi), textNum(bar.takerBuy), textNum(bar.takerSell),
        textNum(bar.dNl), textNum(bar.dNs), POSITION_METHOD, now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function replaceReadoutMarkers(db, interval, flags, now) {
  db.exec("BEGIN");
  try {
    db.prepare(`
      DELETE FROM readout_markers
      WHERE symbol = ? AND venue = ? AND interval = ? AND kind = ?
    `).run(SYMBOL, VENUE, interval, "net-short-peak");
    const statement = db.prepare(`
      INSERT INTO readout_markers (symbol, venue, interval, open_time, kind, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const flag of flags) {
      statement.run(SYMBOL, VENUE, interval, Number(flag.openTime), "net-short-peak", flag.reason || PEAK_REASON, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function parseFundingPrints(body) {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((row) => ({
    fundingTime: Number(row.fundingTime),
    rate: row.fundingRate,
    markPrice: row.markPrice == null ? null : row.markPrice,
  })).filter((row) => Number.isFinite(row.fundingTime) && row.rate != null && row.rate !== "");
}

export function parsePremiumIndex(body) {
  const rate = body?.lastFundingRate;
  const nextFundingTime = Number(body?.nextFundingTime);
  if (rate == null || rate === "" || !Number.isFinite(nextFundingTime)) return null;
  return { rate, nextFundingTime, markPrice: body.markPrice == null ? null : body.markPrice };
}

export function parseOiHist(body) {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((row) => ({
    time: Number(row.timestamp),
    oiCoin: row.sumOpenInterest,
    oiUsd: row.sumOpenInterestValue,
  })).filter((row) => Number.isFinite(row.time) && row.oiCoin != null);
}

export function parseFuturesKline(row) {
  if (!Array.isArray(row)) return null;
  const openTime = Number(row[0]);
  const closeTime = Number(row[6]);
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return null;
  return {
    openTime,
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    takerBuy: row[9],
    closeTime,
  };
}

function csvCells(line) {
  return String(line).split(",").map((cell) => cell.trim());
}

function metricTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) return NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

export function parseMetricsCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = csvCells(lines[0]);
  const headed = header.includes("create_time");
  const timeIndex = headed ? header.indexOf("create_time") : 0;
  const oiIndex = headed ? header.indexOf("sum_open_interest") : 2;
  const usdIndex = headed ? header.indexOf("sum_open_interest_value") : 3;
  const body = headed ? lines.slice(1) : lines;
  const rows = [];
  for (const line of body) {
    const cells = csvCells(line);
    const time = metricTime(cells[timeIndex]);
    if (!Number.isFinite(time)) continue;
    rows.push({ time, oiCoin: cells[oiIndex], oiUsd: cells[usdIndex] || null });
  }
  return rows;
}

export function parseKlineCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  const rows = [];
  for (const line of lines) {
    const cells = csvCells(line);
    if (!Number.isFinite(Number(cells[0]))) continue;
    const parsed = parseFuturesKline(cells);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export function unzipFirst(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < 30 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("Not a zip file");
  const method = bytes.readUInt16LE(8);
  const compressed = bytes.readUInt32LE(18);
  const nameLength = bytes.readUInt16LE(26);
  const extraLength = bytes.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const name = bytes.subarray(30, 30 + nameLength).toString("utf8");
  const payload = bytes.subarray(start, start + compressed);
  if (method === 0) return { name, body: payload };
  if (method === 8) return { name, body: zlib.inflateRawSync(payload) };
  throw new Error(`Unsupported zip method ${method}`);
}

function nearestOi(sorted, time) {
  let low = 0;
  let high = sorted.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found < 0) return null;
  const row = sorted[found];
  if (time - row.time > 5 * 60 * 1000) return null;
  return row;
}

// OI history is stamped at the bar open. The close sample is the next bar's open print.
// Five-minute Vision rows use the last sample at or before each boundary, within five minutes.
export function positionBarsFromStores(klines, oiRows, interval, now) {
  const sorted = (oiRows || [])
    .map((row) => ({ time: Number(row.time), oiCoin: row.oiCoin }))
    .filter((row) => Number.isFinite(row.time))
    .sort((left, right) => left.time - right.time);
  const size = intervalMs(interval);
  const bars = [];
  for (const kline of klines || []) {
    const openTime = Number(kline.openTime);
    const closeTime = Number(kline.closeTime);
    if (!Number.isFinite(openTime) || !(closeTime < now)) continue;
    const openOi = nearestOi(sorted, openTime);
    const closeOi = nearestOi(sorted, openTime + size);
    if (!openOi || !closeOi || closeOi.time === openOi.time) continue;
    const classified = classifyPositionBar({
      oiOpen: openOi.oiCoin,
      oiClose: closeOi.oiCoin,
      volume: kline.volume,
      takerBuy: kline.takerBuy,
    });
    bars.push({
      openTime,
      closeTime,
      low: Number(kline.low),
      close: Number(kline.close),
      ...classified,
    });
  }
  return bars.sort((left, right) => left.openTime - right.openTime);
}

function readFunding(db) {
  return db.prepare(`
    SELECT funding_time AS fundingTime, rate, mark_price AS markPrice
    FROM funding_rates WHERE symbol = ? AND venue = ? ORDER BY funding_time
  `).all(SYMBOL, VENUE);
}

function readLive(db) {
  return db.prepare(`
    SELECT rate, next_funding_time AS nextFundingTime, mark_price AS markPrice, fetched_at AS fetchedAt
    FROM funding_live WHERE symbol = ? AND venue = ?
  `).get(SYMBOL, VENUE) || null;
}

function readKlines(db, interval) {
  return db.prepare(`
    SELECT open_time AS openTime, open, high, low, close, volume, taker_buy AS takerBuy, close_time AS closeTime
    FROM futures_klines WHERE symbol = ? AND venue = ? AND interval = ? ORDER BY open_time
  `).all(SYMBOL, VENUE, interval);
}

function readOi(db) {
  return db.prepare(`
    SELECT time, oi_coin AS oiCoin, oi_usd AS oiUsd
    FROM futures_oi WHERE symbol = ? AND venue = ? ORDER BY time
  `).all(SYMBOL, VENUE);
}

function readPosition(db, interval) {
  return db.prepare(`
    SELECT open_time AS openTime, d_oi AS dOi, taker_buy AS takerBuy, taker_sell AS takerSell,
           d_nl AS dNl, d_ns AS dNs, method
    FROM net_positioning WHERE symbol = ? AND venue = ? AND interval = ? ORDER BY open_time
  `).all(SYMBOL, VENUE, interval);
}

export function recomputeNetPosition(db, interval, now = Date.now()) {
  const bars = positionBarsFromStores(readKlines(db, interval), readOi(db), interval, now);
  replaceNetPositioning(db, interval, bars, now);
  return bars.length;
}

export function buildReadouts(db, settings = {}, now = Date.now()) {
  const settled = readFunding(db).map((row) => ({
    time: Number(row.fundingTime),
    rate: Number(row.rate),
    markPrice: row.markPrice == null ? null : Number(row.markPrice),
  }));
  const live = readLive(db);
  const current = live ? {
    rate: Number(live.rate),
    nextFundingTime: Number(live.nextFundingTime),
    markPrice: live.markPrice == null ? null : Number(live.markPrice),
    fetchedAt: Number(live.fetchedAt),
  } : null;
  const intervals = {};
  for (const interval of ["4h", "1d"]) {
    const stored = readPosition(db, interval).map((row) => ({
      openTime: Number(row.openTime),
      dNs: Number(row.dNs),
      dNl: Number(row.dNl),
      dOi: Number(row.dOi),
    }));
    const cumulative = withCumulative(stored);
    const pivots = nsPivotSettings(settings, interval);
    const flags = netShortPeaks(cumulative, pivots);
    replaceReadoutMarkers(db, interval, flags, now);
    const bands = rollingPriorMax(cumulative.map((row) => row.ns), pivots.lookback);
    const points = cumulative.map((row, index) => ({ ...row, rollingHigh: bands[index] }));
    const latest = points.at(-1) || null;
    const peak90 = latest ? ninetyDayPeak(points, latest.openTime) : null;
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const rollingOver = Boolean(previous && flags.some((flag) => flag.openTime === previous.openTime));
    intervals[interval] = {
      points,
      flags,
      latest: latest ? {
        openTime: latest.openTime,
        ns: latest.ns,
        nl: latest.nl,
        delta: latest.delta,
        peak90,
        text: peakCaption({ ns: latest.ns, peak90, rollingOver }),
        rollingOver,
      } : null,
    };
  }
  return {
    symbol: SYMBOL,
    venue: VENUE,
    available: true,
    caption: "Binance BTCUSDT perp. The price candles on this chart stay Binance spot.",
    method: POSITION_METHOD,
    funding: { current, settled },
    intervals,
  };
}

async function pacedJson(url, options) {
  if (options.pace) await options.pace();
  return withBackoff(() => requestJson(url, { fetchImpl: options.fetchImpl || fetch, timeoutMs: 20000, service: "Binance" }));
}

const ZIP_TIMEOUT_MS = 30000;

// Vision zip downloads stay established when the CDN sends nothing. Node fetch
// does not abort that wait, so this request destroys its own socket.
function httpsBytes(url, timeoutMs, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let wall;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(wall);
      if (error) reject(error);
      else resolve(value);
    };
    let request;
    wall = setTimeout(() => {
      request?.destroy();
      finish(Object.assign(new Error("Binance timeout"), { name: "TimeoutError" }));
    }, timeoutMs);
    request = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (location && status >= 300 && status < 400 && redirectsLeft > 0) {
        res.resume();
        clearTimeout(wall);
        let next;
        try {
          next = new URL(location, url);
        } catch (error) {
          finish(error);
          return;
        }
        if (next.protocol !== "https:") {
          finish(new Error("Unexpected redirect"));
          return;
        }
        httpsBytes(next.href, timeoutMs, redirectsLeft - 1).then(
          (value) => finish(null, value),
          (error) => finish(error),
        );
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const headerValue = res.headers["retry-after"];
        finish(null, {
          ok: status >= 200 && status < 300,
          status,
          retryAfter: Array.isArray(headerValue) ? headerValue[0] : headerValue,
          body: Buffer.concat(chunks),
        });
      });
      res.on("error", (error) => finish(error));
    });
    request.on("error", (error) => finish(error));
  });
}

async function pacedBytes(url, options) {
  if (options.pace) await options.pace();
  return withBackoff(async () => {
    let response;
    try {
      response = options.fetchImpl
        ? await options.fetchImpl(url, { signal: AbortSignal.timeout(ZIP_TIMEOUT_MS) })
        : await httpsBytes(url, ZIP_TIMEOUT_MS);
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new HttpError("Binance timeout", 503);
      }
      throw error;
    }
    if (!response.ok) {
      const header = response.retryAfter ?? response.headers?.get?.("retry-after");
      const seconds = Number(header);
      throw new HttpError(`Binance ${response.status}`, response.status, Number.isFinite(seconds) ? seconds * 1000 : undefined);
    }
    if (Buffer.isBuffer(response.body)) return response.body;
    return Buffer.from(await response.arrayBuffer());
  });
}

export async function refreshFunding(db, options = {}) {
  const now = options.now ?? Date.now();
  const base = fapiBase(options.env);
  const premium = parsePremiumIndex(await pacedJson(`${base}/fapi/v1/premiumIndex?symbol=${SYMBOL}`, options));
  if (premium) saveFundingLive(db, premium, now);
  const latest = db.prepare(`
    SELECT MAX(funding_time) AS fundingTime FROM funding_rates WHERE symbol = ? AND venue = ?
  `).get(SYMBOL, VENUE);
  const start = latest?.fundingTime ? Number(latest.fundingTime) + 1 : now - 40 * DAY;
  const history = parseFundingPrints(await pacedJson(
    `${base}/fapi/v1/fundingRate?symbol=${SYMBOL}&limit=1000&startTime=${start}`,
    options,
  ));
  const fresh = history.filter((row) => row.fundingTime >= start);
  upsertFundingRates(db, fresh);
  return { fetched: fresh.length, from: start };
}

async function fetchKlines(interval, start, end, options) {
  const base = fapiBase(options.env);
  const rows = [];
  let cursor = start;
  for (let page = 0; page < 8; page += 1) {
    const batch = await pacedJson(
      `${base}/fapi/v1/klines?symbol=${SYMBOL}&interval=${interval}&limit=1500&startTime=${cursor}&endTime=${end}`,
      options,
    );
    const parsed = (Array.isArray(batch) ? batch : []).map(parseFuturesKline).filter(Boolean);
    if (!parsed.length) break;
    rows.push(...parsed);
    const last = parsed[parsed.length - 1].openTime;
    if (parsed.length < 1500 || last >= end) break;
    cursor = last + intervalMs(interval);
  }
  return rows;
}

async function fetchOi(interval, start, end, options) {
  const base = fapiBase(options.env);
  const period = interval === "1d" ? "1d" : "4h";
  const rows = [];
  let cursor = start;
  for (let page = 0; page < 8; page += 1) {
    const batch = parseOiHist(await pacedJson(
      `${base}/futures/data/openInterestHist?symbol=${SYMBOL}&period=${period}&limit=500&startTime=${cursor}&endTime=${end}`,
      options,
    ));
    if (!batch.length) break;
    rows.push(...batch);
    const last = batch[batch.length - 1].time;
    if (batch.length < 500 || last >= end) break;
    cursor = last + intervalMs(interval);
  }
  return rows;
}

export async function refreshPositionInterval(db, interval, options = {}) {
  const now = options.now ?? Date.now();
  const closed = latestClosedOpen(interval, now);
  const covered = db.prepare(`
    SELECT 1 AS ok FROM net_positioning
    WHERE symbol = ? AND venue = ? AND interval = ? AND open_time = ?
  `).get(SYMBOL, VENUE, interval, closed);
  if (!options.force && covered) return { interval, skipped: true, fetched: 0 };
  const size = intervalMs(interval);
  const known = db.prepare(`
    SELECT MAX(open_time) AS openTime FROM net_positioning WHERE symbol = ? AND venue = ? AND interval = ?
  `).get(SYMBOL, VENUE, interval);
  const earliest = now - LIVE_POSITION_WINDOW_MS;
  const start = Math.max(earliest, options.force || !known?.openTime ? earliest : Number(known.openTime));
  const from = Math.max(earliest, start - size);
  const klines = await fetchKlines(interval, from, now, options);
  const oi = await fetchOi(interval, from, now, options);
  upsertFuturesKlines(db, interval, klines);
  upsertOpenInterest(db, oi);
  const computed = recomputeNetPosition(db, interval, now);
  return { interval, skipped: false, fetched: klines.length, oi: oi.length, computed };
}

export async function refreshBtcReadouts(db, options = {}) {
  const pace = options.pace || createPacer(options.gapMs ?? 250);
  const shared = { ...options, pace };
  const funding = await refreshFunding(db, shared);
  const positioning = [];
  for (const interval of ["4h", "1d"]) {
    positioning.push(await refreshPositionInterval(db, interval, shared));
  }
  return { funding, positioning };
}

export async function backfillFunding(db, options = {}) {
  const from = options.from ?? FUNDING_START;
  const to = options.to ?? Date.now();
  const base = fapiBase(options.env);
  let start = from;
  let fetched = 0;
  for (let page = 0; page < 50; page += 1) {
    const prints = parseFundingPrints(await pacedJson(
      `${base}/fapi/v1/fundingRate?symbol=${SYMBOL}&limit=1000&startTime=${start}&endTime=${to}`,
      options,
    ));
    if (!prints.length) break;
    upsertFundingRates(db, prints);
    fetched += prints.length;
    const last = prints[prints.length - 1].fundingTime;
    if (prints.length < 1000 || !(last + 1 > start)) break;
    start = last + 1;
  }
  return { fetched, from, to };
}

function ymd(time) {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return { year, month, day, stamp: `${year}-${month}-${day}` };
}

function eachDay(from, to) {
  const days = [];
  let cursor = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate());
  const end = Date.UTC(new Date(to).getUTCFullYear(), new Date(to).getUTCMonth(), new Date(to).getUTCDate());
  while (cursor <= end) {
    days.push(cursor);
    cursor += DAY;
  }
  return days;
}

function eachMonth(from, to) {
  const months = [];
  let year = new Date(from).getUTCFullYear();
  let month = new Date(from).getUTCMonth();
  const endYear = new Date(to).getUTCFullYear();
  const endMonth = new Date(to).getUTCMonth();
  while (year < endYear || (year === endYear && month < endMonth)) {
    months.push({ year, month: String(month + 1).padStart(2, "0") });
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

async function pullZip(url, options) {
  try {
    const bytes = await pacedBytes(url, options);
    return unzipFirst(bytes).body.toString("utf8");
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function backfillNetPosition(db, options = {}) {
  const from = options.from ?? FUNDING_START;
  const to = options.to ?? Date.now();
  const vision = visionBase(options.env);
  let files = 0;
  for (const interval of ["4h", "1d"]) {
    for (const month of eachMonth(from, to)) {
      const name = `BTCUSDT-${interval}-${month.year}-${month.month}.zip`;
      const text = await pullZip(`${vision}/data/futures/um/monthly/klines/BTCUSDT/${interval}/${name}`, options);
      if (!text) continue;
      upsertFuturesKlines(db, interval, parseKlineCsv(text));
      files += 1;
    }
    const monthStart = Date.UTC(new Date(to).getUTCFullYear(), new Date(to).getUTCMonth(), 1);
    for (const day of eachDay(Math.max(from, monthStart), to)) {
      const stamp = ymd(day).stamp;
      const name = `BTCUSDT-${interval}-${stamp}.zip`;
      const text = await pullZip(`${vision}/data/futures/um/daily/klines/BTCUSDT/${interval}/${name}`, options);
      if (!text) continue;
      upsertFuturesKlines(db, interval, parseKlineCsv(text));
      files += 1;
    }
  }
  for (const day of eachDay(from, to)) {
    const stamp = ymd(day).stamp;
    const text = await pullZip(`${vision}/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-${stamp}.zip`, options);
    if (!text) continue;
    upsertOpenInterest(db, parseMetricsCsv(text));
    files += 1;
  }
  const now = options.now ?? Date.now();
  const computed = {
    "4h": recomputeNetPosition(db, "4h", now),
    "1d": recomputeNetPosition(db, "1d", now),
  };
  return { files, computed, from, to };
}
