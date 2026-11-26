import { COINS } from "../../shared/coins.js";
import {
  FUNDING_VENUES,
  parseBinanceFundingHistory,
  parseBinanceFundingInfo,
  parseBinancePremiumIndex,
  parseBybitFundingHistory,
  parseBybitInstruments,
  parseBybitTickers,
  parseOkxFundingHistory,
  parseOkxFundingQuote,
  venueSymbols,
} from "../../shared/venueFunding.js";
import { HttpError, createPacer } from "./backoff.js";

const BLOCKED = new Set([403, 418, 451]);
const HISTORY_WINDOW_MS = 40 * 24 * 60 * 60 * 1000;

const LIVE_UPSERT = `
  INSERT INTO venue_funding_live (symbol, venue, status, rate, interval_hours, next_funding_time, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(symbol, venue) DO UPDATE SET
    status = excluded.status,
    rate = excluded.rate,
    interval_hours = excluded.interval_hours,
    next_funding_time = excluded.next_funding_time,
    fetched_at = excluded.fetched_at
`;

const RATE_UPSERT = `
  INSERT INTO venue_funding_rates (symbol, venue, funding_time, rate, interval_hours)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(symbol, venue, funding_time) DO UPDATE SET
    rate = excluded.rate,
    interval_hours = excluded.interval_hours
`;

export async function venueFetch(url, { fetchImpl = fetch, service = "Funding", sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const once = async () => {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const header = response.headers?.get?.("retry-after");
      const seconds = Number(header);
      const error = new HttpError(`${service} ${response.status}`, response.status, Number.isFinite(seconds) ? seconds * 1000 : undefined);
      if (BLOCKED.has(response.status)) error.blocked = true;
      throw error;
    }
    return response.json();
  };
  try {
    return await once();
  } catch (error) {
    if (error?.blocked || BLOCKED.has(error?.status) || error?.status !== 429) throw error;
    await sleep(Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 800);
    return once();
  }
}

function quoteView(row, blocked) {
  if (blocked?.status === "unavailable") {
    return { status: "unavailable", rate: null, intervalHours: null, nextFundingTime: null, httpStatus: blocked.httpStatus ?? null };
  }
  if (!row) return { status: "unknown", rate: null, intervalHours: null, nextFundingTime: null };
  const rate = row.rate == null || row.rate === "" ? null : Number(row.rate);
  return {
    status: row.status || "unknown",
    rate: Number.isFinite(rate) ? rate : null,
    intervalHours: row.intervalHours == null ? null : Number(row.intervalHours),
    nextFundingTime: row.nextFundingTime == null ? null : Number(row.nextFundingTime),
  };
}

export function readFundingBoard(db, symbol) {
  const blocked = new Map();
  for (const row of db.prepare("SELECT venue, status, http_status AS httpStatus FROM funding_venue_status").all()) {
    blocked.set(row.venue, row);
  }
  const live = new Map();
  for (const row of db.prepare(`
    SELECT venue, status, rate, interval_hours AS intervalHours, next_funding_time AS nextFundingTime
    FROM venue_funding_live WHERE symbol = ?
  `).all(symbol)) {
    live.set(row.venue, row);
  }
  const history = { binance: [], okx: [], bybit: [] };
  for (const row of db.prepare(`
    SELECT venue, funding_time AS time, rate, interval_hours AS intervalHours
    FROM venue_funding_rates WHERE symbol = ? ORDER BY funding_time
  `).all(symbol)) {
    if (!history[row.venue]) continue;
    history[row.venue].push({
      time: Number(row.time),
      rate: Number(row.rate),
      intervalHours: row.intervalHours == null ? null : Number(row.intervalHours),
    });
  }
  const venues = {};
  for (const venue of FUNDING_VENUES) venues[venue] = quoteView(live.get(venue), blocked.get(venue));
  return { venues, history };
}

export function buildSymbolReadouts(db, symbol) {
  const board = readFundingBoard(db, symbol);
  const binance = board.venues.binance;
  return {
    symbol,
    available: true,
    funding: {
      settled: board.history.binance.map((row) => ({ time: row.time, rate: row.rate })),
      current: binance.status === "listed" && binance.rate != null
        ? { rate: binance.rate, nextFundingTime: binance.nextFundingTime }
        : null,
    },
    venues: board.venues,
    venueHistory: board.history,
  };
}

export function attachOverviewFunding(db, rows) {
  return (rows || []).map((row) => {
    const board = readFundingBoard(db, row.symbol);
    return {
      ...row,
      fundingBinance: board.venues.binance,
      fundingOkx: board.venues.okx,
      fundingBybit: board.venues.bybit,
    };
  });
}

function saveLive(db, row) {
  db.prepare(LIVE_UPSERT).run(
    row.symbol,
    row.venue,
    row.status,
    row.rate == null ? null : String(row.rate),
    row.intervalHours == null ? null : Number(row.intervalHours),
    row.nextFundingTime == null ? null : Number(row.nextFundingTime),
    row.fetchedAt,
  );
}

function savePrints(db, symbol, venue, prints, intervalHours) {
  if (!prints.length) return;
  const statement = db.prepare(RATE_UPSERT);
  db.exec("BEGIN");
  try {
    for (const print of prints) {
      statement.run(symbol, venue, print.fundingTime, String(print.rate), intervalHours == null ? null : Number(intervalHours));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function markVenue(db, venue, status, httpStatus, now) {
  db.prepare(`
    INSERT INTO funding_venue_status (venue, status, http_status, checked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(venue) DO UPDATE SET
      status = excluded.status,
      http_status = excluded.http_status,
      checked_at = excluded.checked_at
  `).run(venue, status, httpStatus == null ? null : Number(httpStatus), now);
}

function clearVenueBlock(db, venue) {
  db.prepare("DELETE FROM funding_venue_status WHERE venue = ?").run(venue);
}

function latestPrint(db, symbol, venue) {
  const row = db.prepare(`
    SELECT MAX(funding_time) AS fundingTime FROM venue_funding_rates WHERE symbol = ? AND venue = ?
  `).get(symbol, venue);
  return row?.fundingTime ? Number(row.fundingTime) : null;
}

async function paced(url, options, service) {
  if (options.pace) await options.pace();
  return venueFetch(url, {
    fetchImpl: options.fetchImpl || fetch,
    service,
    sleep: options.sleep,
  });
}

function blockedResult(venue, error) {
  return { venue, unavailable: true, httpStatus: error?.status ?? null, error: error?.message || "unavailable" };
}

async function refreshBinance(db, coins, options) {
  const now = options.now;
  const base = options.binanceBase || "https://fapi.binance.com";
  let premiums;
  let intervals;
  try {
    premiums = parseBinancePremiumIndex(await paced(`${base}/fapi/v1/premiumIndex`, options, "Binance"));
    intervals = parseBinanceFundingInfo(await paced(`${base}/fapi/v1/fundingInfo`, options, "Binance"));
    clearVenueBlock(db, "binance");
  } catch (error) {
    if (error?.blocked || BLOCKED.has(error?.status)) {
      markVenue(db, "binance", "unavailable", error.status, now);
      return blockedResult("binance", error);
    }
    return { venue: "binance", error: error.message, httpStatus: error.status || null };
  }
  for (const coin of coins) {
    const mapped = venueSymbols(coin.symbol).binance;
    const quote = premiums.get(mapped);
    if (!quote) {
      saveLive(db, { symbol: coin.symbol, venue: "binance", status: "not-listed", rate: null, intervalHours: null, nextFundingTime: null, fetchedAt: now });
      continue;
    }
    const intervalHours = intervals.get(mapped) || 8;
    saveLive(db, {
      symbol: coin.symbol,
      venue: "binance",
      status: "listed",
      rate: quote.rate,
      intervalHours,
      nextFundingTime: quote.nextFundingTime,
      fetchedAt: now,
    });
    const start = (latestPrint(db, coin.symbol, "binance") || (now - HISTORY_WINDOW_MS)) + 1;
    try {
      const history = parseBinanceFundingHistory(await paced(
        `${base}/fapi/v1/fundingRate?symbol=${mapped}&limit=1000&startTime=${start}`,
        options,
        "Binance",
      ));
      savePrints(db, coin.symbol, "binance", history.filter((row) => row.fundingTime >= start), intervalHours);
    } catch (error) {
      if (error?.blocked || BLOCKED.has(error?.status)) {
        markVenue(db, "binance", "unavailable", error.status, now);
        return blockedResult("binance", error);
      }
    }
  }
  return { venue: "binance", ok: true };
}

async function refreshOkx(db, coins, options) {
  const now = options.now;
  const base = options.okxBase || "https://www.okx.com";
  let sawBlocked = null;
  for (const coin of coins) {
    const mapped = venueSymbols(coin.symbol).okx;
    let quote;
    try {
      quote = parseOkxFundingQuote(await paced(`${base}/api/v5/public/funding-rate?instId=${mapped}`, options, "OKX"));
    } catch (error) {
      if (error?.blocked || BLOCKED.has(error?.status)) {
        sawBlocked = error;
        break;
      }
      continue;
    }
    if (!quote.listed) {
      saveLive(db, { symbol: coin.symbol, venue: "okx", status: "not-listed", rate: null, intervalHours: null, nextFundingTime: null, fetchedAt: now });
      continue;
    }
    saveLive(db, {
      symbol: coin.symbol,
      venue: "okx",
      status: "listed",
      rate: quote.rate,
      intervalHours: quote.intervalHours,
      nextFundingTime: quote.nextFundingTime,
      fetchedAt: now,
    });
    const start = (latestPrint(db, coin.symbol, "okx") || (now - HISTORY_WINDOW_MS)) + 1;
    try {
      const prints = [];
      let after = "";
      for (let page = 0; page < 4; page += 1) {
        const url = `${base}/api/v5/public/funding-rate-history?instId=${mapped}&limit=100${after ? `&after=${after}` : ""}`;
        const batch = parseOkxFundingHistory(await paced(url, options, "OKX"));
        if (!batch.length) break;
        prints.push(...batch);
        const oldest = Math.min(...batch.map((row) => row.fundingTime));
        if (oldest <= start || batch.length < 100) break;
        after = String(oldest);
      }
      savePrints(db, coin.symbol, "okx", prints.filter((row) => row.fundingTime >= start), quote.intervalHours);
    } catch (error) {
      if (error?.blocked || BLOCKED.has(error?.status)) {
        sawBlocked = error;
        break;
      }
    }
  }
  if (sawBlocked) {
    markVenue(db, "okx", "unavailable", sawBlocked.status, now);
    return blockedResult("okx", sawBlocked);
  }
  clearVenueBlock(db, "okx");
  return { venue: "okx", ok: true };
}

async function refreshBybit(db, coins, options) {
  const now = options.now;
  const base = options.bybitBase || "https://api.bybit.com";
  let tickers;
  const intervals = new Map();
  try {
    tickers = parseBybitTickers(await paced(`${base}/v5/market/tickers?category=linear`, options, "Bybit"));
    let cursor = "";
    for (let page = 0; page < 4; page += 1) {
      const url = `${base}/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const parsed = parseBybitInstruments(await paced(url, options, "Bybit"));
      for (const [symbol, hours] of parsed.map) intervals.set(symbol, hours);
      if (!parsed.cursor || parsed.cursor === cursor) break;
      cursor = parsed.cursor;
    }
    clearVenueBlock(db, "bybit");
  } catch (error) {
    if (error?.blocked || BLOCKED.has(error?.status)) {
      markVenue(db, "bybit", "unavailable", error.status, now);
      return blockedResult("bybit", error);
    }
    return { venue: "bybit", error: error.message, httpStatus: error.status || null };
  }
  for (const coin of coins) {
    const mapped = venueSymbols(coin.symbol).bybit;
    const quote = tickers.get(mapped);
    if (!quote) {
      saveLive(db, { symbol: coin.symbol, venue: "bybit", status: "not-listed", rate: null, intervalHours: null, nextFundingTime: null, fetchedAt: now });
      continue;
    }
    const intervalHours = intervals.get(mapped) || 8;
    saveLive(db, {
      symbol: coin.symbol,
      venue: "bybit",
      status: "listed",
      rate: quote.rate,
      intervalHours,
      nextFundingTime: quote.nextFundingTime,
      fetchedAt: now,
    });
    const start = (latestPrint(db, coin.symbol, "bybit") || (now - HISTORY_WINDOW_MS)) + 1;
    try {
      const prints = [];
      let end = now;
      for (let page = 0; page < 5; page += 1) {
        const batch = parseBybitFundingHistory(await paced(
          `${base}/v5/market/funding/history?category=linear&symbol=${mapped}&startTime=${start}&endTime=${end}&limit=200`,
          options,
          "Bybit",
        ));
        if (!batch.length) break;
        prints.push(...batch);
        const oldest = Math.min(...batch.map((row) => row.fundingTime));
        if (oldest <= start || batch.length < 200) break;
        end = oldest - 1;
      }
      savePrints(db, coin.symbol, "bybit", prints.filter((row) => row.fundingTime >= start), intervalHours);
    } catch (error) {
      if (error?.blocked || BLOCKED.has(error?.status)) {
        markVenue(db, "bybit", "unavailable", error.status, now);
        return blockedResult("bybit", error);
      }
    }
  }
  return { venue: "bybit", ok: true };
}

export async function refreshVenueFunding(db, coins = COINS, options = {}) {
  const now = options.now ?? Date.now();
  const force = options.force === true;
  const pace = options.pace || createPacer(options.gapMs ?? 250);
  const shared = { ...options, now, pace };
  const results = {};
  const runners = { binance: refreshBinance, okx: refreshOkx, bybit: refreshBybit };
  for (const venue of FUNDING_VENUES) {
    const status = db.prepare("SELECT status FROM funding_venue_status WHERE venue = ?").get(venue);
    if (!force && status?.status === "unavailable") {
      results[venue] = { venue, skipped: true, unavailable: true };
      continue;
    }
    results[venue] = await runners[venue](db, coins, shared);
  }
  return results;
}
