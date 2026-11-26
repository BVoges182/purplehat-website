import { playbookById } from "./playbook.js";
import { formatSast } from "./time.js";

export const COIN_SAMPLE_FLOOR = 10;

function percent(count, total) {
  return total ? count / total : 0;
}

export function isAmbiguousFill(trade) {
  if (!trade) return false;
  if (trade.ambiguous === true || trade.fillAmbiguous === true || trade.ambiguousFill === true) return true;
  const status = trade.dataStatus || "";
  return status === "ambiguous" || status === "flagged-ambiguous";
}

export function isSupersededFill(trade) {
  return trade?.dataStatus === "superseded-data-corrected";
}

export function summariseOutcomes(rows) {
  const buckets = { tp2: 0, tp1Be: 0, stopped: 0, other: 0 };
  const otherTypes = [];
  const excluded = { open: 0, waiting: 0, ambiguous: 0, superseded: 0 };
  let since = null;
  for (const row of rows || []) {
    if (isSupersededFill(row)) {
      excluded.superseded += 1;
      continue;
    }
    if (isAmbiguousFill(row)) {
      excluded.ambiguous += 1;
      continue;
    }
    if (row?.outcome === "open") {
      excluded.open += 1;
      continue;
    }
    if (row?.outcome === "waiting") {
      excluded.waiting += 1;
      continue;
    }
    if (row?.outcome === "tp1-tp2") buckets.tp2 += 1;
    else if (row?.outcome === "tp1-be") buckets.tp1Be += 1;
    else if (row?.outcome === "stopped") buckets.stopped += 1;
    else {
      buckets.other += 1;
      const label = row?.outcome || "unknown";
      if (!otherTypes.includes(label)) otherTypes.push(label);
    }
    const time = Number(row?.signalOpenTime ?? row?.entryOpenTime);
    if (Number.isFinite(time) && (since == null || time < since)) since = time;
  }
  const n = buckets.tp2 + buckets.tp1Be + buckets.stopped + buckets.other;
  const tp1 = buckets.tp2 + buckets.tp1Be;
  return {
    n,
    buckets,
    tp1,
    tp2: buckets.tp2,
    stopped: buckets.stopped,
    tp1Share: percent(tp1, n),
    tp2Share: percent(buckets.tp2, n),
    stoppedShare: percent(buckets.stopped, n),
    tp1BeShare: percent(buckets.tp1Be, n),
    excluded,
    excludedCount: excluded.open + excluded.waiting + excluded.ambiguous + excluded.superseded,
    otherTypes,
    since,
    sinceLabel: since == null ? "—" : formatSast(since),
    smallSample: n < COIN_SAMPLE_FLOOR,
  };
}

function sameSetup(sample, query) {
  return sample
    && sample.timeframe === query.timeframe
    && sample.direction === query.direction
    && sample.setupType === query.setupType;
}

// Coin stats use this coin only. All coins uses the same timeframe, direction
// and setup on every coin, including this one, when this coin has fewer than
// COIN_SAMPLE_FLOOR completed trades.
export function tradeOutcomeStats(trades, query) {
  const matched = (trades || []).filter((sample) => sameSetup(sample, query));
  const coin = summariseOutcomes(matched.filter((sample) => sample.coinId === query.coinId));
  return {
    coin,
    allCoins: coin.n < COIN_SAMPLE_FLOOR ? summariseOutcomes(matched) : null,
  };
}

export function timeframeLabel(timeframe) {
  if (timeframe === "1d") return "Daily";
  if (timeframe === "4h") return "4H";
  return String(timeframe || "");
}

export function setupHeading(query) {
  if (!query) return "";
  if (query.setupType === "bull-div-conservative-long") return "Bull div long";
  if (query.setupType === "bear-div-conservative-short") return "Bear div short";
  const name = query.setupName || query.setupType || "Setup";
  const direction = query.direction === "short" ? "short" : "long";
  return `${name} ${direction}`;
}

export function outcomeHeading(query) {
  return `Historical outcomes · ${setupHeading(query)} · ${timeframeLabel(query.timeframe)}`;
}

export function percentLabel(count, total) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

export function signalOddsLine(samples, query) {
  const stats = tradeOutcomeStats(samples, query);
  const usingAll = stats.coin.n < COIN_SAMPLE_FLOOR;
  const chosen = usingAll ? stats.allCoins : stats.coin;
  if (!chosen || chosen.n === 0) return { kind: "empty", text: "No history yet", allCoins: false, parts: [], n: 0 };
  return {
    kind: "odds",
    allCoins: usingAll,
    n: chosen.n,
    parts: [
      { label: "TP2", text: percentLabel(chosen.buckets.tp2, chosen.n), color: "#178a4a" },
      { label: "TP1", text: percentLabel(chosen.tp1, chosen.n), color: "#F5C518" },
      { label: "Stopped", text: percentLabel(chosen.buckets.stopped, chosen.n), color: "#991B1B" },
    ],
  };
}

function usable(trade) {
  return !!(trade && trade.outcome && trade.outcome !== "waiting");
}

export function oddsSubject({ pinned = false, selected = null, openTrade = null, history = [] } = {}) {
  if (!pinned) return null;
  if (usable(selected)) return selected;
  if (usable(openTrade)) return openTrade;
  return (history || []).find((trade) => usable(trade) && trade.outcome !== "open") || null;
}

export function oddsQuery(trade, coinId) {
  if (!usable(trade)) return null;
  const book = playbookById(trade.playbookId);
  const setupType = trade.playbookId || book?.id || "";
  if (!setupType) return null;
  const direction = trade.direction === "short" || book?.direction === "short" ? "short" : "long";
  return {
    coinId: trade.coinId || coinId || "",
    timeframe: trade.timeframe,
    direction,
    setupType,
    setupName: trade.playbookName || book?.name || setupType,
  };
}
