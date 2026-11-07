import { COINS } from "../../shared/coins.js";
import { DATA_CORRECTION_VERSION } from "../../shared/candleIntegrity.js";
import {
  historicalBandCloses,
  historicalBandRejections,
  historicalDivergences,
  historicalRsiCrosses,
} from "../../shared/signals.js";
import { clearCandleCorrections, insertSignal, pendingCandleCorrections, readCandles } from "./db.js";
import { syncMarketTrades } from "./playbook-store.js";
import { getSettings } from "./settings-store.js";

const RECOMPUTED_FAMILIES = new Set(["bb", "rsi", "divergence", "rejection"]);

export function reconcileSignals(db, { symbol, coinId, timeframe, candles, settings, now, correctedOpens }) {
  const opens = [...correctedOpens].map(Number).filter((time) => Number.isFinite(time));
  if (!opens.length) return { superseded: [], rebuilt: [] };
  const earliest = Math.min(...opens);
  const input = { symbol, coinId, candles, interval: timeframe, settings, now };
  const produced = [
    ...historicalBandCloses(input),
    ...historicalBandRejections(input),
    ...historicalRsiCrosses(input),
    ...historicalDivergences(input),
  ];
  const producedIds = new Set(produced.map((signal) => signal.id));
  const stored = db.prepare(`
    SELECT id, family, bar_open_time AS barOpenTime, data_status AS dataStatus
    FROM signals WHERE symbol = ? AND timeframe = ?
  `).all(symbol, timeframe);
  const known = new Set(stored.map((row) => row.id));
  const superseded = [];
  const rebuilt = [];
  for (const row of stored) {
    if (row.dataStatus === "superseded-data-corrected") continue;
    if (!RECOMPUTED_FAMILIES.has(row.family)) continue;
    if (Number(row.barOpenTime) < earliest) continue;
    if (producedIds.has(row.id)) continue;
    db.prepare("UPDATE signals SET data_status = ?, data_correction = ? WHERE id = ?")
      .run("superseded-data-corrected", DATA_CORRECTION_VERSION, row.id);
    superseded.push(row.id);
  }
  for (const signal of produced) {
    if (Number(signal.barOpenTime) < earliest) continue;
    if (known.has(signal.id)) continue;
    if (insertSignal(db, {
      ...signal,
      dataStatus: "data-corrected",
      dataCorrection: DATA_CORRECTION_VERSION,
      contextOpenTime: signal.barOpenTime,
    })) rebuilt.push(signal.id);
  }
  return { superseded, rebuilt };
}

export function applyCandleCorrection(db, coin, interval, correctedOpens, now = Date.now()) {
  const opens = [...new Set((correctedOpens || []).map(Number))].filter((time) => Number.isFinite(time));
  if (!opens.length) return { superseded: [], rebuilt: [] };
  const settings = getSettings(db);
  const candles = readCandles(db, coin.symbol, interval);
  const signals = reconcileSignals(db, {
    symbol: coin.symbol,
    coinId: coin.id,
    timeframe: interval,
    candles,
    settings,
    now,
    correctedOpens: opens,
  });
  syncMarketTrades(db, {
    symbol: coin.symbol,
    coinId: coin.id,
    timeframe: interval,
    candles,
    settings,
    now,
    correctionVersion: DATA_CORRECTION_VERSION,
    correctedOpens: opens,
  });
  return signals;
}

export function applyPendingCorrections(db, now = Date.now()) {
  const groups = pendingCandleCorrections(db, DATA_CORRECTION_VERSION);
  for (const group of groups) {
    const coin = COINS.find((item) => item.symbol === group.symbol) || { symbol: group.symbol, id: group.symbol };
    applyCandleCorrection(db, coin, group.interval, group.opens, now);
    clearCandleCorrections(db, DATA_CORRECTION_VERSION, group.symbol, group.interval, group.opens);
  }
  return groups.length;
}
