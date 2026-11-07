import { pairLabel } from "./coins.js";
import { signalAppearance, signalStrength } from "./theme.js";

export const OVERVIEW_LOOKBACK = { "4h": 6, "1d": 3 };

export function signalAgeLabel(family, side, barsAgo) {
  const look = signalAppearance(family, side);
  const name = look.short;
  const age = barsAgo <= 0 ? "this bar" : barsAgo === 1 ? "1 bar ago" : `${barsAgo} bars ago`;
  return `${name} · ${age}`;
}

function windowSignals(signals, opens, timeframe) {
  const limit = OVERVIEW_LOOKBACK[timeframe] || 6;
  const window = new Set((opens || []).slice(-limit));
  const latest = (opens || []).length - 1;
  return (signals || [])
    .filter((signal) => signal.timeframe === timeframe && signal.dismissedAt == null && window.has(signal.barOpenTime))
    .map((signal) => {
      const barsAgo = latest - opens.indexOf(signal.barOpenTime);
      return {
        id: signal.id,
        side: signal.side,
        family: signal.family,
        timeframe,
        barOpenTime: signal.barOpenTime,
        barsAgo,
        label: signalAgeLabel(signal.family, signal.side, barsAgo),
      };
    })
    .sort((left, right) => signalStrength(right.family) - signalStrength(left.family) || right.barOpenTime - left.barOpenTime);
}

function rowRank(row) {
  const marks = [...row.signals4h, ...row.signals1d];
  return {
    strength: marks.reduce((max, signal) => Math.max(max, signalStrength(signal.family)), 0),
    recent: marks.reduce((max, signal) => Math.max(max, signal.barOpenTime || 0), 0),
  };
}

export function compareOverviewRows(left, right) {
  const a = rowRank(left);
  const b = rowRank(right);
  return b.strength - a.strength || b.recent - a.recent || left.id.localeCompare(right.id);
}

export function applyOverviewFilter(rows, side = "") {
  const filtered = rows.map((row) => ({
    ...row,
    signals4h: (row.signals4h || []).filter((signal) => !side || signal.side === side),
    signals1d: (row.signals1d || []).filter((signal) => !side || signal.side === side),
  }));
  const shown = side
    ? filtered.filter((row) => row.error || row.pending || row.signals4h.length || row.signals1d.length)
    : filtered;
  return shown.slice().sort(compareOverviewRows);
}

export function failedOverviewRow(coin, error) {
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    pair: pairLabel(coin.pair || coin.symbol),
    displayDecimals: coin.displayDecimals ?? 2,
    lastPrice: null,
    changePercent: null,
    provider: null,
    providerLabel: null,
    unavailable: false,
    pending: false,
    error: error?.message || "Could not load this coin",
    signals4h: [],
    signals1d: [],
  };
}

export async function collectOverview(coins, loadOne) {
  const rows = await Promise.all(coins.map(async (coin) => {
    try {
      const row = await loadOne(coin);
      if (!row) return failedOverviewRow(coin, new Error("Could not load this coin"));
      return { ...row, error: row.error || "", pending: false };
    } catch (error) {
      return failedOverviewRow(coin, error);
    }
  }));
  return applyOverviewFilter(rows, "");
}

export function buildOverviewRows(coins, context, side = "") {
  const rows = coins.map((coin) => {
    const meta = context.meta?.[coin.symbol] || {};
    const opens = context.opens?.[coin.symbol] || {};
    const signals = context.signals?.[coin.symbol] || [];
    if (context.errors?.[coin.symbol]) {
      return failedOverviewRow(coin, new Error(context.errors[coin.symbol]));
    }
    return {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      pair: pairLabel(coin.pair || coin.symbol),
      displayDecimals: meta.displayDecimals ?? coin.displayDecimals ?? 2,
      lastPrice: meta.lastPrice ?? null,
      changePercent: meta.changePercent ?? null,
      provider: meta.provider || null,
      providerLabel: meta.providerLabel || null,
      unavailable: Boolean(meta.unavailable),
      pending: false,
      error: "",
      signals4h: windowSignals(signals, opens["4h"] || [], "4h"),
      signals1d: windowSignals(signals, opens["1d"] || [], "1d"),
    };
  });
  return applyOverviewFilter(rows, side);
}
