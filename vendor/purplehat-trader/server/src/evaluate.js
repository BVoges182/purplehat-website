import { newClosedOpens } from "../../shared/candleSchedule.js";
import { COINS } from "../../shared/coins.js";
import { closedCandles } from "../../shared/indicators.js";
import { generateSignals, historicalBandCloses, historicalBandRejections, historicalDivergences, historicalRsiCrosses } from "../../shared/signals.js";
import { deliverAlerts } from "./alerts.js";
import {
  getCursor,
  insertSignal,
  listFailedSignals,
  readCandles,
  setCursor,
} from "./db.js";
import { refreshAll } from "./refresh.js";
import { getSettings } from "./settings-store.js";

export function backfillBandRejections(db, options = {}) {
  const now = options.now ?? Date.now();
  const settings = options.settings ?? getSettings(db);
  const coins = options.coins ?? COINS;
  const read = options.readCandles ?? ((symbol, interval) => readCandles(db, symbol, interval));
  let stored = 0;
  for (const coin of coins) {
    for (const interval of ["4h", "1d"]) {
      const candles = read(coin.symbol, interval);
      const latest = closedCandles(candles, now).at(-1)?.openTime ?? null;
      const cursor = getCursor(db, coin.symbol, interval);
      const closes = historicalBandCloses({
        symbol: coin.symbol,
        coinId: coin.id,
        candles,
        interval,
        settings,
        now,
      });
      for (const signal of closes) {
        if (signal.barOpenTime === latest && cursor !== latest) continue;
        if (insertSignal(db, { ...signal, contextOpenTime: signal.barOpenTime })) stored += 1;
      }
      const past = historicalBandRejections({
        symbol: coin.symbol,
        coinId: coin.id,
        candles,
        interval,
        settings,
        now,
      });
      for (const signal of past) {
        if (signal.barOpenTime === latest && cursor !== latest) continue;
        if (insertSignal(db, { ...signal, contextOpenTime: signal.barOpenTime })) stored += 1;
      }
      const crosses = historicalRsiCrosses({
        symbol: coin.symbol,
        coinId: coin.id,
        candles,
        interval,
        settings,
        now,
      });
      for (const signal of crosses) {
        if (signal.barOpenTime === latest && cursor !== latest) continue;
        if (insertSignal(db, { ...signal, contextOpenTime: signal.barOpenTime })) stored += 1;
      }
      const divergences = historicalDivergences({
        symbol: coin.symbol,
        coinId: coin.id,
        candles,
        interval,
        settings,
        now,
      });
      for (const signal of divergences) {
        if (signal.confirmOpenTime === latest && cursor !== latest) continue;
        if (insertSignal(db, { ...signal, contextOpenTime: signal.barOpenTime })) stored += 1;
      }
    }
  }
  return stored;
}

const INTERVAL_MS = { "4h": 4 * 60 * 60 * 1000, "1d": 24 * 60 * 60 * 1000 };
let evaluationRun = null;

function sliceClosed(candles, closedAt) {
  return (candles || []).filter((candle) => Number(candle.closeTime) < closedAt);
}

export async function evaluateAll(db, options = {}) {
  if (evaluationRun) return evaluationRun;
  evaluationRun = evaluateAllBody(db, options).finally(() => {
    evaluationRun = null;
  });
  return evaluationRun;
}

async function evaluateAllBody(db, options = {}) {
  const now = options.now ?? Date.now();
  const settings = options.settings ?? getSettings(db);
  const coins = options.coins ?? COINS;
  const read = options.readCandles ?? ((symbol, interval) => readCandles(db, symbol, interval));
  if (options.refresh) await options.refresh({ db, now, coins });
  else await refreshAll(db, coins);

  const evaluated = [];
  const skipped = [];
  const created = [];
  for (const coin of coins) {
    const series = {
      "4h": closedCandles(read(coin.symbol, "4h"), now),
      "1d": closedCandles(read(coin.symbol, "1d"), now),
    };
    const steps = [];
    for (const interval of ["4h", "1d"]) {
      const opens = series[interval].map((candle) => candle.openTime);
      const previous = getCursor(db, coin.symbol, interval);
      for (const openTime of newClosedOpens(previous, opens)) steps.push({ interval, openTime });
    }
    steps.sort((left, right) => left.openTime - right.openTime || (left.interval === "4h" ? -1 : 1));
    if (steps.length === 0) {
      skipped.push(coin.symbol);
      continue;
    }
    for (const step of steps) {
      const closedAt = step.openTime + INTERVAL_MS[step.interval];
      const signals = generateSignals({
        symbol: coin.symbol,
        coinId: coin.id,
        candles4h: sliceClosed(series["4h"], closedAt),
        candles1d: sliceClosed(series["1d"], closedAt),
        settings,
        now,
      });
      for (const signal of signals) {
        if (signal.timeframe !== step.interval || Number(signal.barOpenTime) !== Number(step.openTime)) continue;
        const stored = { ...signal, contextOpenTime: step.openTime };
        if (insertSignal(db, stored)) created.push(stored);
      }
      setCursor(db, coin.symbol, step.interval, step.openTime, now);
    }
    evaluated.push(coin.symbol);
  }

  backfillBandRejections(db, { now, settings, coins, readCandles: read });

  const pending = [...created];
  const seen = new Set(created.map((signal) => signal.id));
  for (const signal of listFailedSignals(db)) {
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);
    pending.push(signal);
  }
  const deliveries = pending.length ? await deliverAlerts(db, pending, options) : [];
  return {
    evaluated,
    skipped,
    created: created.map((signal) => signal.id),
    deliveries,
    lastEvaluatedAt: now,
  };
}
