import { COINS } from "../../shared/coins.js";
import { DATA_CORRECTION_VERSION } from "../../shared/candleIntegrity.js";
import { missingAfter } from "../../shared/klineMerge.js";
import { createPacer, fetchStats, recordBatch } from "./backoff.js";
import { applyCandleCorrection } from "./candleCorrection.js";
import { clearCandleCorrections, countCandles, latestRefresh, markRefresh, queueCandleCorrections, readCandles, readTicker, readVenue, saveCandles, saveTicker, saveVenue } from "./db.js";
import { monthlyOpensFor } from "./monthlyOpens.js";
import { createBinanceProvider, createHyperliquidProvider, resolveCoinVenue, resolveHypeVenue } from "./providers.js";
import { refreshBtcReadouts } from "./futuresMetrics.js";
import { readOutcomeSamples, syncMarketTrades } from "./playbook-store.js";
import { refreshVenueFunding } from "./venueFunding.js";
import { getSettings } from "./settings-store.js";

const INTERVALS = ["4h", "1d"];
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const VENUE_TTL = 6 * 60 * 60 * 1000;
const TICKER_TTL = 10 * 60 * 1000;
const FETCH_CONCURRENCY = 4;
const inflight = new Map();
const intervalJobs = new Map();
const batches = new Map();
let sharedMarket = null;
let staleRecovery = null;

const watchedSymbols = () => COINS.map((coin) => coin.symbol);

export function installStaleRecovery(hook) {
  staleRecovery = typeof hook === "function" ? hook : null;
}

export function kickStaleRecovery(db) {
  if (!staleRecovery) return null;
  const pending = staleRecovery(db);
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
  return pending || null;
}

export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export function latestExpectedClosedOpen(interval, now) {
  const size = interval === "1d" ? DAY : FOUR_HOURS;
  return Math.floor(now / size) * size - size;
}

function cacheCovers(db, symbol, interval, now) {
  const closed = readCandles(db, symbol, interval).filter((row) => row.closeTime < now);
  const last = closed.at(-1);
  if (!last || last.openTime < latestExpectedClosedOpen(interval, now)) return false;
  if (last.finalized == null) return true;
  return Number(last.finalized) === 1;
}

function marketDeps(options) {
  const isolated = options.binance || options.hyperliquid || options.fetchImpl || options.binanceBase || options.hyperliquidEndpoint || options.pace;
  if (!isolated) {
    if (!sharedMarket) {
      const pace = createPacer(250);
      sharedMarket = {
        pace,
        binance: createBinanceProvider({ pace }),
        hyperliquid: createHyperliquidProvider({ pace }),
      };
    }
    return sharedMarket;
  }
  const pace = options.pace || createPacer(options.gapMs ?? 250);
  return {
    pace,
    binance: options.binance || createBinanceProvider({ fetchImpl: options.fetchImpl, pace, base: options.binanceBase }),
    hyperliquid: options.hyperliquid || createHyperliquidProvider({ fetchImpl: options.fetchImpl, pace, endpoint: options.hyperliquidEndpoint }),
  };
}

export function productionMarket(options = {}) {
  return marketDeps(options);
}

function klineQuery(interval, last, now, force) {
  const coldLimit = interval === "30m" ? 1000 : 500;
  const lastOpen = last?.openTime ?? null;
  if (lastOpen == null) return { limit: coldLimit };
  const missing = missingAfter(lastOpen, interval, now, coldLimit);
  const unfinalized = Number(last?.finalized) === 0;
  const count = missing.length + (unfinalized ? 1 : 0);
  const startTime = unfinalized ? lastOpen : missing[0];
  if (count > 5) return { limit: coldLimit, startTime };
  if (count > 0) return { limit: Math.max(2, count), startTime };
  if (force) return { limit: 2, startTime: lastOpen };
  return null;
}

function depsFrom(options) {
  if (options.binance && options.hyperliquid) return options;
  return { ...options, ...marketDeps(options) };
}

function finiteTick(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function coinView(coin, venue) {
  const decimals = venue?.decimals == null ? coin.displayDecimals : Number(venue.decimals);
  return {
    ...coin,
    displayDecimals: Number.isFinite(decimals) ? decimals : coin.displayDecimals,
    tickSize: finiteTick(venue?.tickSize),
  };
}

async function venueFor(deps, db, coin, options) {
  const now = options.now ?? Date.now();
  const saved = readVenue(db, coin.symbol);
  if (saved && !options.force && now - saved.checkedAt < VENUE_TTL) return saved;
  if (typeof deps.binance?.exchangeInfo === "function") {
    const listed = await deps.binance.exchangeInfo(watchedSymbols());
    const venue = await resolveCoinVenue(coin, listed, deps.hyperliquid);
    saveVenue(db, coin.symbol, venue, now);
    return venue;
  }
  if (coin.source !== "auto" && coin.id !== "HYPE") {
    return { provider: "binance", market: coin.pair || coin.symbol, label: "Binance", kind: "spot", decimals: coin.displayDecimals };
  }
  const venue = await resolveHypeVenue(deps);
  saveVenue(db, coin.symbol, venue, now);
  return venue;
}

async function alternateVenue(deps, venue) {
  if (venue.provider === "hyperliquid") {
    return { provider: "binance", market: "HYPEUSDT", label: "Binance", kind: "spot" };
  }
  const resolved = await deps.hyperliquid.resolveMarket("HYPE");
  return { provider: "hyperliquid", market: resolved.market, label: "Hyperliquid", kind: resolved.kind };
}

async function pullCandles(deps, venue, coin, interval, db, now, force) {
  const key = `${coin.symbol}|${interval}`;
  const pending = intervalJobs.get(key);
  if (pending) return pending;
  const job = pullCandlesBody(deps, venue, coin, interval, db, now, force).finally(() => intervalJobs.delete(key));
  intervalJobs.set(key, job);
  return job;
}

async function pullCandlesBody(deps, venue, coin, interval, db, now, force) {
  if (venue.provider === "hyperliquid") return deps.hyperliquid.candles(venue.market, interval);
  const stored = readCandles(db, coin.symbol, interval).filter((row) => Number(row.closeTime) < now);
  const query = klineQuery(interval, stored.at(-1), now, force);
  if (!query) return [];
  const extra = query.startTime == null ? undefined : { startTime: query.startTime };
  return deps.binance.candles(coin.symbol, interval, query.limit, extra);
}

async function pullTicker(deps, venue, coin) {
  if (venue.provider === "hyperliquid") return deps.hyperliquid.ticker(venue.market);
  return deps.binance.ticker(coin.symbol);
}

async function refreshCoinBody(db, coin, options) {
  const deps = depsFrom(options);
  const now = options.now ?? Date.now();
  const counts = [];
  let venue = null;
  let usedFallback = false;

  async function ensureVenue() {
    if (!venue) venue = await venueFor(deps, db, coin, { ...options, now });
    return venue;
  }

  for (const interval of INTERVALS) {
    if (!options.force && cacheCovers(db, coin.symbol, interval, now)) {
      counts.push({ interval, skipped: true, fetched: 0 });
      continue;
    }
    try {
      const chosen = await ensureVenue();
      if (chosen.provider === "unavailable") {
        counts.push({ interval, error: "unavailable", fetched: 0 });
        continue;
      }
      let rows = await pullCandles(deps, chosen, coin, interval, db, now, options.force === true);
      if (coin.id === "HYPE" && rows.length === 0) throw new Error("HYPE returned no candles");
      const saved = saveCandles(db, coin.symbol, interval, rows, now);
      markRefresh(db, coin.symbol, interval, now);
      if (saved.corrected.length) {
        queueCandleCorrections(db, DATA_CORRECTION_VERSION, coin.symbol, interval, saved.corrected, now);
        applyCandleCorrection(db, coin, interval, saved.corrected, now);
        clearCandleCorrections(db, DATA_CORRECTION_VERSION, coin.symbol, interval, saved.corrected);
      }
      counts.push({ interval, ...saved, fetched: rows.length, provider: chosen.provider });
    } catch (error) {
      if (coin.id === "HYPE" && !usedFallback) {
        usedFallback = true;
        try {
          const next = await alternateVenue(deps, venue || { provider: "binance" });
          venue = next;
          saveVenue(db, coin.symbol, next, now);
          const rows = await pullCandles(deps, next, coin, interval, db, now, options.force === true);
          if (rows.length === 0) throw new Error("HYPE returned no candles");
          const saved = saveCandles(db, coin.symbol, interval, rows, now);
          markRefresh(db, coin.symbol, interval, now);
          if (saved.corrected.length) {
            queueCandleCorrections(db, DATA_CORRECTION_VERSION, coin.symbol, interval, saved.corrected, now);
            applyCandleCorrection(db, coin, interval, saved.corrected, now);
            clearCandleCorrections(db, DATA_CORRECTION_VERSION, coin.symbol, interval, saved.corrected);
          }
          counts.push({ interval, ...saved, fetched: rows.length, provider: next.provider });
          continue;
        } catch (fallbackError) {
          counts.push({ interval, error: fallbackError.message, fetched: 0 });
          continue;
        }
      }
      counts.push({ interval, error: error.message, fetched: 0 });
    }
  }

  try {
    const ticker = readTicker(db, coin.symbol);
    const fresh = ticker && now - ticker.refreshedAt < TICKER_TTL;
    if (!options.skipTicker && (options.force || !fresh)) {
      const chosen = await ensureVenue();
      if (chosen.provider === "unavailable") {
        counts.push({ interval: "ticker", error: "unavailable" });
      } else {
        const quote = await pullTicker(deps, chosen, coin);
        if (quote?.lastPrice) saveTicker(db, coin.symbol, quote, now);
      }
    }
  } catch (error) {
    counts.push({ interval: "ticker", error: error.message });
  }

  if ((coin.id === "BTC" || coin.symbol === "BTCUSDT") && options.readouts !== false) {
    try {
      const readouts = await refreshBtcReadouts(db, { ...deps, now, force: options.force === true, fetchImpl: options.fetchImpl, env: options.env });
      counts.push({ interval: "readouts", fetched: readouts.funding.fetched, positioning: readouts.positioning });
    } catch (error) {
      counts.push({ interval: "readouts", error: error.message, fetched: 0 });
    }
  }
  return counts;
}

export async function refreshCoin(db, coin, options = {}) {
  const key = `${coin.symbol}:${options.force ? "force" : "cache"}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = refreshCoinBody(db, coin, options).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

export async function resolveVenues(db, coins = COINS, options = {}) {
  const deps = depsFrom(options);
  const now = options.now ?? Date.now();
  const listed = typeof deps.binance?.exchangeInfo === "function" ? await deps.binance.exchangeInfo(watchedSymbols()) : new Map();
  return mapLimit(coins, options.concurrency ?? FETCH_CONCURRENCY, async (coin) => {
    const venue = await resolveCoinVenue(coin, listed, deps.hyperliquid);
    saveVenue(db, coin.symbol, venue, now);
    return { id: coin.id, symbol: coin.symbol, ...venue };
  });
}

export async function refreshTickerBatch(db, coins, deps, options = {}) {
  const now = options.now ?? Date.now();
  const due = [];
  for (const coin of coins) {
    const ticker = readTicker(db, coin.symbol);
    if (!options.force && ticker && now - ticker.refreshedAt < TICKER_TTL) continue;
    const venue = readVenue(db, coin.symbol);
    if (venue?.provider === "unavailable") continue;
    if (venue?.provider === "hyperliquid") {
      try {
        const quote = await deps.hyperliquid.ticker(venue.market);
        if (quote?.lastPrice) saveTicker(db, coin.symbol, quote, now);
      } catch {
        // The candle batch still stands. The next close tries the ticker again.
      }
      continue;
    }
    due.push(coin);
  }
  if (!due.length || typeof deps.binance?.tickers !== "function") return { fetched: 0 };
  const rows = await deps.binance.tickers(due.map((coin) => coin.symbol));
  for (const row of rows) {
    if (row?.symbol && row.lastPrice) saveTicker(db, row.symbol, row, now);
  }
  return { fetched: rows.length ? 1 : 0 };
}

async function refreshMonthly(db, coins, options) {
  if (options.monthly !== true) return;
  for (const coin of coins) {
    try {
      await monthlyOpensFor(db, coin, options);
    } catch {
      // Monthly lines stay on the last cached opens.
    }
  }
}

export async function refreshAll(db, coins = COINS, options = {}) {
  const key = options.batchKey || (options.binance ? null : "live");
  if (key && batches.has(key)) return batches.get(key);
  const job = refreshAllBody(db, coins, options).finally(() => {
    if (key) batches.delete(key);
  });
  if (key) batches.set(key, job);
  return job;
}

async function refreshAllBody(db, coins, options) {
  const started = Date.now();
  const before = fetchStats().calls;
  const shared = depsFrom(options);
  const batchTickers = typeof shared.binance?.tickers === "function";
  if (options.funding === true) {
    try {
      await refreshVenueFunding(db, coins, { ...options, force: options.force === true });
    } catch {
      // A venue failure is stored on that venue. Candle refresh still runs.
    }
  }
  const rows = await mapLimit(coins, options.concurrency ?? FETCH_CONCURRENCY, async (coin) => {
    try {
      return { symbol: coin.symbol, id: coin.id, intervals: await refreshCoin(db, coin, { ...options, ...shared, skipTicker: batchTickers }) };
    } catch (error) {
      return { symbol: coin.symbol, id: coin.id, error: error.message, intervals: [] };
    }
  });
  if (batchTickers) {
    try {
      await refreshTickerBatch(db, coins, shared, options);
    } catch {
      // Prices stay on the last ticker. The next batch tries again.
    }
  }
  await refreshMonthly(db, coins, { ...options, ...shared });
  const after = fetchStats();
  recordBatch({
    name: "4h",
    calls: after.calls - before,
    weight: after.maxWeight,
    ms: Date.now() - started,
  });
  return rows;
}

function priceFromSeries(series) {
  const close = series["4h"].at(-1)?.close || series["1d"].at(-1)?.close;
  return close ? { lastPrice: String(close), changePercent: undefined } : null;
}

export async function loadCoin(db, coin, options = {}) {
  const now = options.now ?? Date.now();
  const ready = INTERVALS.every((interval) => countCandles(db, coin.symbol, interval) > 0);
  const stale = !ready || INTERVALS.some((interval) => !cacheCovers(db, coin.symbol, interval, now));
  const source = stale ? "stale" : "cache";
  const error = "";
  if (stale && options.recover !== false) kickStaleRecovery(db);
  const series = {
    "4h": readCandles(db, coin.symbol, "4h"),
    "1d": readCandles(db, coin.symbol, "1d"),
  };
  const storedTicker = readTicker(db, coin.symbol);
  const settings = getSettings(db);
  let venue = readVenue(db, coin.symbol) || (coin.id === "HYPE"
    ? null
    : { provider: "binance", market: coin.pair || coin.symbol, label: "Binance", kind: "spot", decimals: coin.displayDecimals });
  const playbookTrades = {
    "4h": syncMarketTrades(db, {
      symbol: coin.symbol,
      coinId: coin.id,
      timeframe: "4h",
      candles: series["4h"],
      settings,
      now,
    }),
    "1d": syncMarketTrades(db, {
      symbol: coin.symbol,
      coinId: coin.id,
      timeframe: "1d",
      candles: series["1d"],
      settings,
      now,
    }),
  };
  return {
    coin: coinView(coin, venue),
    source,
    error,
    settings,
    refreshedAt: latestRefresh(db, coin.symbol),
    ticker: storedTicker || priceFromSeries(series),
    venue,
    series,
    playbookTrades,
    outcomeSamples: readOutcomeSamples(db),
  };
}
