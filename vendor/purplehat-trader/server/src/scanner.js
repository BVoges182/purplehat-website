import { COINS, pairLabel } from "../../shared/coins.js";
import { closedCandles } from "../../shared/indicators.js";
import { buildOverviewRows } from "../../shared/overview.js";
import { historicalBandCloses, historicalBandRejections, historicalDivergences, historicalRsiCrosses } from "../../shared/signals.js";
import { compareSignals } from "../../shared/theme.js";
import { formatSast } from "../../shared/time.js";
import { createPacer } from "./backoff.js";
import { querySignals, readCandles, readTicker, readVenue } from "./db.js";
import { loadCoin, mapLimit } from "./refresh.js";
import { getSettings } from "./settings-store.js";

export async function scanCoins(db, options = {}) {
  const coins = options.coins ?? COINS;
  const pace = options.pace || createPacer(options.gapMs ?? 250);
  const load = options.loadCoin || ((coin) => loadCoin(db, coin, { ...options, pace }));
  const now = options.now ?? Date.now();
  const rows = await mapLimit(coins, options.concurrency ?? 4, async (coin) => {
    let payload = null;
    let error = "";
    try {
      payload = await load(coin);
      error = payload?.error || "";
    } catch (err) {
      error = err.message;
    }
    const active = querySignals(db, { symbol: coin.symbol, view: "active", limit: 100, now });
    const ordered = active.slice().sort(compareSignals);
    const top = ordered[0];
    const lastClose = payload?.series?.["4h"]?.at(-1)?.close || payload?.series?.["1d"]?.at(-1)?.close || null;
    return {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      displayDecimals: payload?.coin?.displayDecimals ?? coin.displayDecimals,
      pair: pairLabel(coin.symbol),
      lastPrice: payload?.ticker?.lastPrice || lastClose,
      changePercent: payload?.ticker?.changePercent ?? null,
      provider: payload?.venue?.provider || null,
      providerLabel: payload?.venue?.label || null,
      market: payload?.venue?.market || null,
      activeBuy: active.filter((signal) => signal.side === "BUY").length,
      activeSell: active.filter((signal) => signal.side === "SELL").length,
      topReason: ordered.map((signal) => `${signal.reason} · ${formatSast(signal.barOpenTime)}`).join(" · "),
      topFamily: top?.family || "",
      signals: ordered.map((signal) => ({
        id: signal.id,
        side: signal.side,
        family: signal.family,
        timeframe: signal.timeframe,
        reason: signal.reason,
        barOpenTime: signal.barOpenTime,
      })),
      hasDivergence: active.some((signal) => signal.family === "divergence"),
      refreshedAt: payload?.refreshedAt || null,
      error,
      unavailable: payload?.venue?.provider === "unavailable",
    };
  });
  return rows;
}

function candleSignals(coin, candles, interval, settings, now) {
  const args = { symbol: coin.symbol, coinId: coin.id, candles, interval, settings, now };
  return [
    ...historicalBandCloses(args),
    ...historicalBandRejections(args),
    ...historicalRsiCrosses(args),
    ...historicalDivergences(args),
  ];
}

function overviewContextFor(db, coin, settings, dismissed, now) {
  const ticker = readTicker(db, coin.symbol);
  const venue = readVenue(db, coin.symbol);
  const decimals = venue?.decimals == null ? coin.displayDecimals : Number(venue.decimals);
  const signals = [];
  const opens = {};
  for (const interval of ["4h", "1d"]) {
    const candles = readCandles(db, coin.symbol, interval);
    opens[interval] = closedCandles(candles, now).map((candle) => candle.openTime);
    signals.push(...candleSignals(coin, candles, interval, settings, now));
  }
  return {
    signals: signals.filter((signal) => !dismissed.has(signal.id)),
    opens,
    meta: {
      displayDecimals: Number.isFinite(decimals) ? decimals : 2,
      lastPrice: ticker?.lastPrice || null,
      changePercent: ticker?.changePercent ?? null,
      provider: venue?.provider || null,
      providerLabel: venue?.label || null,
      unavailable: venue?.provider === "unavailable",
    },
  };
}

export function overviewCoins(db, coins = COINS, now = Date.now()) {
  const settings = getSettings(db);
  const dismissed = new Set(db.prepare("SELECT id FROM signals WHERE dismissed_at IS NOT NULL").all().map((row) => row.id));
  const context = { signals: {}, opens: {}, meta: {}, errors: {} };
  for (const coin of coins) {
    try {
      const one = overviewContextFor(db, coin, settings, dismissed, now);
      context.signals[coin.symbol] = one.signals;
      context.opens[coin.symbol] = one.opens;
      context.meta[coin.symbol] = one.meta;
    } catch (error) {
      context.errors[coin.symbol] = error.message || "Could not load this coin";
    }
  }
  return buildOverviewRows(coins, context);
}

export function filterScanner(rows, filter) {
  if (filter === "BUY") return rows.filter((row) => row.activeBuy > 0);
  if (filter === "SELL") return rows.filter((row) => row.activeSell > 0);
  if (filter === "divergence") return rows.filter((row) => row.hasDivergence);
  return rows;
}
