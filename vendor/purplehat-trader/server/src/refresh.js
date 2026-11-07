import { COINS } from "../../shared/coins.js";
import { DATA_CORRECTION_VERSION } from "../../shared/candleIntegrity.js";
import { createPacer } from "./backoff.js";
import { applyCandleCorrection } from "./candleCorrection.js";
import { clearCandleCorrections, countCandles, latestRefresh, markRefresh, queueCandleCorrections, readCandles, readTicker, readVenue, saveCandles, saveTicker, saveVenue } from "./db.js";
import { createBinanceProvider, createHyperliquidProvider, resolveCoinVenue, resolveHypeVenue } from "./providers.js";
import { syncMarketTrades } from "./playbook-store.js";
import { getSettings } from "./settings-store.js";

const INTERVALS = ["4h", "1d"];
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const VENUE_TTL = 6 * 60 * 60 * 1000;
const TICKER_TTL = 10 * 60 * 1000;
const FETCH_CONCURRENCY = 4;
const inflight = new Map();

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
  const pace = options.pace || createPacer(options.gapMs ?? 250);
  return {
    pace,
    binance: options.binance || createBinanceProvider({ fetchImpl: options.fetchImpl, pace, base: options.binanceBase }),
    hyperliquid: options.hyperliquid || createHyperliquidProvider({ fetchImpl: options.fetchImpl, pace, endpoint: options.hyperliquidEndpoint }),
  };
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
    const listed = await deps.binance.exchangeInfo();
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

async function pullCandles(deps, venue, coin, interval) {
  if (venue.provider === "hyperliquid") return deps.hyperliquid.candles(venue.market, interval);
  return deps.binance.candles(coin.symbol, interval);
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
      let rows = await pullCandles(deps, chosen, coin, interval);
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
          const rows = await pullCandles(deps, next, coin, interval);
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
    if (options.force || !fresh) {
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
  const listed = typeof deps.binance?.exchangeInfo === "function" ? await deps.binance.exchangeInfo() : new Map();
  return mapLimit(coins, options.concurrency ?? FETCH_CONCURRENCY, async (coin) => {
    const venue = await resolveCoinVenue(coin, listed, deps.hyperliquid);
    saveVenue(db, coin.symbol, venue, now);
    return { id: coin.id, symbol: coin.symbol, ...venue };
  });
}

export async function refreshAll(db, coins = COINS, options = {}) {
  const shared = depsFrom(options);
  return mapLimit(coins, options.concurrency ?? FETCH_CONCURRENCY, async (coin) => {
    try {
      return { symbol: coin.symbol, id: coin.id, intervals: await refreshCoin(db, coin, { ...options, ...shared }) };
    } catch (error) {
      return { symbol: coin.symbol, id: coin.id, error: error.message, intervals: [] };
    }
  });
}

function priceFromSeries(series) {
  const close = series["4h"].at(-1)?.close || series["1d"].at(-1)?.close;
  return close ? { lastPrice: String(close), changePercent: undefined } : null;
}

export async function loadCoin(db, coin, options = {}) {
  const now = options.now ?? Date.now();
  const ready = INTERVALS.every((interval) => countCandles(db, coin.symbol, interval) > 0);
  const stale = INTERVALS.some((interval) => !cacheCovers(db, coin.symbol, interval, now));
  let source = "cache";
  let error = "";
  if (options.force || !ready || stale) {
    const counts = await refreshCoin(db, coin, { ...options, now });
    source = counts.some((item) => item.fetched > 0) ? "live" : "cache";
    const failed = counts.filter((item) => item.error && item.interval !== "ticker");
    if (failed.length === INTERVALS.length) error = failed.map((item) => `${item.interval}: ${item.error}`).join("; ");
  }
  const series = {
    "4h": readCandles(db, coin.symbol, "4h"),
    "1d": readCandles(db, coin.symbol, "1d"),
  };
  const storedTicker = readTicker(db, coin.symbol);
  const settings = getSettings(db);
  let venue = readVenue(db, coin.symbol) || (coin.id === "HYPE"
    ? null
    : { provider: "binance", market: coin.pair || coin.symbol, label: "Binance", kind: "spot", decimals: coin.displayDecimals });
  if (venue?.provider === "binance" && venue.tickSize == null) {
    try {
      const deps = depsFrom(options);
      if (typeof deps.binance?.exchangeInfo === "function") {
        venue = await venueFor(deps, db, coin, { ...options, now, force: true });
      }
    } catch {
      // Keep the cached venue. The model reports a missing tick instead of inventing one.
    }
  }
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
  };
}
