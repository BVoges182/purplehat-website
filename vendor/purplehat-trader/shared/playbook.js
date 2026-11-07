import { bollinger, chartTime, closedCandles, rsi } from "./indicators.js";
import { envDefaults } from "./settings.js";
import { divergencePairs } from "./signals.js";

// Long prices stay on the original formula. Shorts mirror it. Both directions
// share one open position per coin and timeframe, on 4H and on Daily.
export const PLAYBOOK_1 = {
  id: "bull-div-conservative-long",
  name: "Bull Div — Conservative Long",
  version: 1,
  direction: "long",
  timeframe: "4h",
  enabledTimeframes: ["4h", "1d"],
  trigger: "Bull div chain point locks on a closed candle",
  entry: "That candle's close",
  exit: "TP1 middle band 33%, TP2 upper band 67%, stop sized for the selected R:R, break-even after TP1",
  tp1Fraction: 0.33,
  tp2Fraction: 0.67,
  rewardRisk: 2,
  breakEvenFactor: 1.001,
  bandPeriod: 20,
  bandStd: 2,
};

export const PLAYBOOK_SHORT = {
  id: "bear-div-conservative-short",
  name: "Bear Div — Conservative Short",
  version: 1,
  direction: "short",
  timeframe: "4h",
  enabledTimeframes: ["4h", "1d"],
  trigger: "Bear div chain point locks on a closed candle",
  entry: "That candle's close",
  exit: "TP1 middle band 33%, TP2 lower band 67%, stop sized for the selected R:R, break-even after TP1",
  tp1Fraction: 0.33,
  tp2Fraction: 0.67,
  rewardRisk: 2,
  breakEvenFactor: 1.001,
  bandPeriod: 20,
  bandStd: 2,
};

export const PLAYBOOKS = [PLAYBOOK_1, PLAYBOOK_SHORT];

export const SETUP_EXTEND_BARS = 20;

export const SETUP_COLORS = {
  entry: "#6a2fd6",
  target: "#166534",
  stop: "#991B1B",
  greenFill: "rgba(22, 101, 52, 0.15)",
  redFill: "rgba(153, 27, 27, 0.15)",
  text: "#241536",
};

const OUTCOME_LABEL = {
  stopped: "Stopped out",
  "tp1-be": "TP1 then BE stop",
  "tp1-tp2": "TP1 then TP2",
  open: "Open",
};

const OUTCOME_TAG = {
  stopped: "Stopped",
  "tp1-be": "BE",
  "tp1-tp2": "TP2 ✓",
};

export function listPlaybooks() {
  return PLAYBOOKS.map((playbook) => ({ ...playbook }));
}

export function playbookById(id) {
  return PLAYBOOKS.find((playbook) => playbook.id === id) || null;
}

export function formatSetupPrice(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMove(entry, price) {
  const pct = ((Number(price) - Number(entry)) / Number(entry)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function shareLabel(fraction) {
  return `${Math.round(Number(fraction) * 100)}%`;
}

export function allowedRewardRisk(value) {
  return Number(value) === 3 ? 3 : 2;
}

export function playbookLevels({
  entry,
  tp1,
  tp2,
  tp1Fraction = PLAYBOOK_1.tp1Fraction,
  tp2Fraction = PLAYBOOK_1.tp2Fraction,
  rewardRisk = PLAYBOOK_1.rewardRisk,
  breakEvenFactor = PLAYBOOK_1.breakEvenFactor,
  direction = "long",
} = {}) {
  const fill = Number(entry);
  const first = Number(tp1);
  const second = Number(tp2);
  const weightedTarget = tp1Fraction * first + tp2Fraction * second;
  if (direction === "short") {
    const stop = fill + (fill - weightedTarget) / rewardRisk;
    const places = String(breakEvenFactor).includes(".") ? String(breakEvenFactor).split(".")[1].length : 0;
    const mirrored = breakEvenFactor > 1 ? Number((2 - breakEvenFactor).toFixed(places)) : breakEvenFactor;
    return {
      entry: fill,
      tp1: first,
      tp2: second,
      tp1Fraction,
      tp2Fraction,
      rewardRisk,
      breakEvenFactor,
      weightedTarget,
      stop,
      breakEven: fill * mirrored,
      risk: stop - fill,
      direction: "short",
    };
  }
  const stop = fill - (weightedTarget - fill) / rewardRisk;
  return {
    entry: fill,
    tp1: first,
    tp2: second,
    tp1Fraction,
    tp2Fraction,
    rewardRisk,
    breakEvenFactor,
    weightedTarget,
    stop,
    breakEven: fill * breakEvenFactor,
    risk: fill - stop,
    direction: "long",
  };
}

function ratioFor(playbook, openTime) {
  if (typeof playbook?.rewardRiskFor === "function") {
    const chosen = Number(playbook.rewardRiskFor(openTime));
    if (chosen === 2 || chosen === 3) return chosen;
  }
  return allowedRewardRisk(playbook?.rewardRisk);
}

function levelsFromRow(row, band, playbook) {
  const middle = Number(band?.middle);
  const upper = Number(band?.upper);
  const lower = Number(band?.lower);
  const direction = playbook.direction === "short" ? "short" : "long";
  if (direction === "short") {
    if (!Number.isFinite(middle) || !Number.isFinite(lower)) return null;
    const levels = playbookLevels({
      entry: row.close,
      tp1: middle,
      tp2: lower,
      tp1Fraction: playbook.tp1Fraction,
      tp2Fraction: playbook.tp2Fraction,
      rewardRisk: ratioFor(playbook, row.openTime),
      breakEvenFactor: playbook.breakEvenFactor,
      direction: "short",
    });
    const ordered = levels.tp2 < levels.tp1 && levels.tp1 < levels.entry && levels.entry < levels.stop;
    if (!(levels.weightedTarget < levels.entry) || !(levels.risk > 0) || !ordered) return null;
    return levels;
  }
  if (!Number.isFinite(middle) || !Number.isFinite(upper)) return null;
  const levels = playbookLevels({
    entry: row.close,
    tp1: middle,
    tp2: upper,
    tp1Fraction: playbook.tp1Fraction,
    tp2Fraction: playbook.tp2Fraction,
    rewardRisk: ratioFor(playbook, row.openTime),
    breakEvenFactor: playbook.breakEvenFactor,
  });
  const ordered = levels.stop < levels.entry && levels.entry < levels.tp1 && levels.tp1 < levels.tp2;
  if (!(levels.weightedTarget > levels.entry) || !(levels.risk > 0) || !ordered) return null;
  return levels;
}

function rUnit(state, price) {
  const moved = Number(price);
  if (!Number.isFinite(moved)) return 0;
  if (state.direction === "short") {
    const risk = state.stop - state.entry;
    if (!(risk > 0)) return 0;
    return (state.entry - moved) / risk;
  }
  const risk = state.entry - state.stop;
  if (!(risk > 0)) return 0;
  return (moved - state.entry) / risk;
}

function realizedR(state, outcome) {
  if (outcome === "stopped") return -1;
  if (outcome === "tp1-tp2") {
    return state.tp1Fraction * rUnit(state, state.tp1) + state.tp2Fraction * rUnit(state, state.tp2);
  }
  if (outcome === "tp1-be") {
    return state.tp1Fraction * rUnit(state, state.tp1) + state.tp2Fraction * rUnit(state, state.breakEven);
  }
  return null;
}

export function unrealizedR(state, price) {
  if (!state.tp1Hit) return rUnit(state, price);
  return state.tp1Fraction * rUnit(state, state.tp1) + state.tp2Fraction * rUnit(state, price);
}

function statusFor(outcome, tp1Hit) {
  if (outcome === "waiting") return "Waiting";
  if (outcome === "open") return tp1Hit ? "TP1 hit — stop at BE" : "Open";
  if (outcome === "stopped") return "Stopped";
  if (outcome === "tp1-be") return "Stopped at BE";
  if (outcome === "tp1-tp2") return "Closed TP2";
  return "Open";
}

function finishTrade(state, outcome, candle) {
  const tp1Hit = state.tp1Hit || outcome === "tp1-tp2" || outcome === "tp1-be";
  return {
    ...state,
    tp1Hit,
    outcome,
    status: statusFor(outcome, tp1Hit),
    r: realizedR(state, outcome),
    exitOpenTime: candle?.openTime ?? null,
    closed: true,
  };
}

function advanceShort(state, candle, low, high, activeStop) {
  if (high >= activeStop) {
    return finishTrade(state, state.tp1Hit ? "tp1-be" : "stopped", candle);
  }
  if (!state.tp1Hit && low <= state.tp1) {
    if (low <= state.tp2) return finishTrade({ ...state, tp1Hit: true }, "tp1-tp2", candle);
    return { ...state, tp1Hit: true, status: "TP1 hit — stop at BE", closed: false };
  }
  if (state.tp1Hit && low <= state.tp2) return finishTrade(state, "tp1-tp2", candle);
  return { ...state, closed: false };
}

// The stop that is active at the open of the candle is checked before any target.
// Break-even replaces that stop only on candles after the one that first tags TP1.
export function advanceTrade(state, candle) {
  const low = Number(candle?.low);
  const high = Number(candle?.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { ...state, closed: false };
  const activeStop = state.tp1Hit ? state.breakEven : state.stop;
  if (state.direction === "short") return advanceShort(state, candle, low, high, activeStop);
  if (low <= activeStop) {
    return finishTrade(state, state.tp1Hit ? "tp1-be" : "stopped", candle);
  }
  if (!state.tp1Hit && high >= state.tp1) {
    if (high >= state.tp2) return finishTrade({ ...state, tp1Hit: true }, "tp1-tp2", candle);
    return { ...state, tp1Hit: true, status: "TP1 hit — stop at BE", closed: false };
  }
  if (state.tp1Hit && high >= state.tp2) return finishTrade(state, "tp1-tp2", candle);
  return { ...state, closed: false };
}

export function markToMarket(state, candle) {
  const tp1Hit = !!state.tp1Hit;
  return {
    ...state,
    tp1Hit,
    outcome: "open",
    status: statusFor("open", tp1Hit),
    r: unrealizedR(state, candle?.close),
    exitOpenTime: null,
    closed: false,
  };
}

export function walkTrade(levels, candles) {
  let state = { ...levels, tp1Hit: false, status: "Open", closed: false };
  for (let index = 0; index < candles.length; index += 1) {
    const next = advanceTrade(state, candles[index]);
    if (next.closed) return { ...next, exitIndex: index };
    state = next;
  }
  const last = candles[candles.length - 1];
  return { ...markToMarket(state, last), exitIndex: null };
}

// Version 1 freezes targets at entry. Version 2 revises unfinished targets after each close.
export const DYNAMIC_TARGET_VERSION = 2;

// A revised target is filled only on a later candle. The activating candle's high and low
// do not count. If the close has already reached the new target, that close is not a fill.
// A later candle fills it only when it opens on the near side and then trades through it.
// A candle that opens already through the target does not fill it.
export const TARGET_ACTIVATION_RULE = "Process exits against the targets already in force, then revise from that candle's close. A new target cannot fill on the candle that created it. A target that is already through the close stays unfilled until a later candle opens on the near side and trades through it.";

export function projectedRewardRisk(state) {
  const entry = Number(state?.entry);
  const stop = Number(state?.stop);
  const tp1 = Number(state?.tp1);
  const tp2 = Number(state?.tp2);
  const first = Number(state?.tp1Fraction ?? PLAYBOOK_1.tp1Fraction);
  const second = Number(state?.tp2Fraction ?? PLAYBOOK_1.tp2Fraction);
  const risk = state?.direction === "short" ? stop - entry : entry - stop;
  if (!(risk > 0) || !Number.isFinite(tp1) || !Number.isFinite(tp2)) return null;
  const reward = state?.direction === "short"
    ? first * (entry - tp1) + second * (entry - tp2)
    : first * (tp1 - entry) + second * (tp2 - entry);
  return reward / risk;
}

function bandTarget(direction, band, field) {
  if (direction === "short") return Number(field === "tp1" ? band?.middle : band?.lower);
  return Number(field === "tp1" ? band?.middle : band?.upper);
}

function priceAlreadyThrough(direction, target, close) {
  if (!Number.isFinite(target) || !Number.isFinite(close)) return false;
  if (direction === "short") return target >= close;
  return target <= close;
}

function opensOnNearSide(direction, target, open) {
  if (!Number.isFinite(target) || !Number.isFinite(open)) return false;
  if (direction === "short") return open > target;
  return open < target;
}

export function reviseOpenTargets(state, band, candle) {
  if (!state || state.closed) return state;
  const direction = state.direction === "short" ? "short" : "long";
  const close = Number(candle?.close);
  const revisions = Array.isArray(state.revisions) ? state.revisions.slice() : [];
  const next = { ...state, direction };
  const fields = next.tp1Hit ? ["tp2"] : ["tp1", "tp2"];
  for (const field of fields) {
    const price = bandTarget(direction, band, field);
    if (!Number.isFinite(price) || price === Number(next[field])) continue;
    const through = priceAlreadyThrough(direction, price, close);
    revisions.push({
      at: candle?.openTime ?? null,
      field,
      from: Number(next[field]),
      to: price,
      close: Number.isFinite(close) ? close : null,
      alreadyThrough: through,
    });
    next[field] = price;
    next[field === "tp1" ? "tp1Through" : "tp2Through"] = through;
  }
  next.revisions = revisions;
  next.dynamicSince = candle?.openTime ?? next.dynamicSince ?? null;
  next.projectedRewardRisk = projectedRewardRisk(next);
  next.playbookVersion = DYNAMIC_TARGET_VERSION;
  return next;
}

function hideReachedTarget(state, field, candle) {
  const through = field === "tp1" ? state.tp1Through : state.tp2Through;
  if (!through) return state;
  const open = Number(candle?.open);
  const target = Number(state[field]);
  if (opensOnNearSide(state.direction, target, open)) return state;
  const unreachable = state.direction === "short" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  return { ...state, [field]: unreachable };
}

export function advanceDynamic(state, candle) {
  const direction = state?.direction === "short" ? "short" : "long";
  let working = hideReachedTarget({ ...state, direction }, "tp1", candle);
  working = hideReachedTarget(working, "tp2", candle);
  const stepped = advanceTrade(working, candle);
  const tp2Filled = stepped.outcome === "tp1-tp2";
  return {
    ...stepped,
    direction,
    entry: state.entry,
    stop: state.stop,
    breakEven: state.breakEven,
    rewardRisk: state.rewardRisk,
    tp1: state.tp1,
    tp2: state.tp2,
    tp1Fraction: state.tp1Fraction,
    tp2Fraction: state.tp2Fraction,
    tp1Through: stepped.tp1Hit ? false : !!state.tp1Through,
    tp2Through: tp2Filled ? false : !!state.tp2Through,
    revisions: state.revisions || [],
    projectedRewardRisk: state.projectedRewardRisk ?? null,
    dynamicSince: state.dynamicSince ?? null,
    playbookVersion: DYNAMIC_TARGET_VERSION,
  };
}

export function walkDynamicTrade(levels, candles, bands) {
  let state = {
    ...levels,
    tp1Hit: false,
    status: "Open",
    closed: false,
    playbookVersion: DYNAMIC_TARGET_VERSION,
    revisions: [],
    tp1Through: false,
    tp2Through: false,
    projectedRewardRisk: projectedRewardRisk(levels),
    dynamicSince: null,
  };
  const series = candles || [];
  for (let index = 0; index < series.length; index += 1) {
    const stepped = advanceDynamic(state, series[index]);
    if (stepped.closed) return { ...stepped, exitIndex: index };
    state = reviseOpenTargets(stepped, bands?.[index], series[index]);
  }
  const last = series[series.length - 1];
  return { ...markToMarket(state, last), exitIndex: null };
}

function recordedExitPrice(trade) {
  if (!trade || trade.outcome === "open" || trade.outcome === "waiting") return null;
  const explicit = Number(trade.exitPrice);
  if (Number.isFinite(explicit)) return explicit;
  if (trade.outcome === "stopped") return Number(trade.stop);
  if (trade.outcome === "tp1-be") return Number(trade.breakEven);
  if (trade.outcome === "tp1-tp2") return Number(trade.tp2);
  return null;
}

function priceDrift(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - b) > 0.001;
}

export function recordedFillDrift(stored, view) {
  if (!stored || !view) return false;
  const entry = stored.entry ?? stored.payload?.entry;
  const stop = stored.stop ?? stored.payload?.stop;
  const outcome = stored.outcome || stored.payload?.outcome;
  if (priceDrift(entry, view.entry) || priceDrift(stop, view.stop)) return true;
  if (outcome !== view.outcome) return true;
  const leftExit = stored.exitOpenTime ?? stored.payload?.exitOpenTime ?? null;
  const rightExit = view.exitOpenTime ?? null;
  if ((leftExit == null) !== (rightExit == null)) return true;
  if (leftExit != null && Number(leftExit) !== Number(rightExit)) return true;
  if (outcome && outcome !== "open" && outcome !== "waiting") {
    if (priceDrift(recordedExitPrice(stored), recordedExitPrice(view))) return true;
  }
  return false;
}

export function keepStoredResult(stored, view) {
  if (!stored || !view) return false;
  if (stored.dataStatus === "superseded-data-corrected") return true;
  const storedVersion = Number(stored.playbookVersion || 1);
  const nextVersion = Number(view.playbookVersion || 1);
  const finished = stored.outcome === "stopped" || stored.outcome === "tp1-be" || stored.outcome === "tp1-tp2";
  if (stored.rewardRisk != null && view.rewardRisk != null && Number(stored.rewardRisk) !== Number(view.rewardRisk)) return true;
  if (finished && storedVersion < DYNAMIC_TARGET_VERSION && nextVersion >= DYNAMIC_TARGET_VERSION) return true;
  if (finished && stored.outcome !== view.outcome) return true;
  if (finished && recordedFillDrift(stored, view)) return true;
  return false;
}

export function resumeFrozenOpen(stored, rows) {
  const signal = Number(stored?.signalOpenTime ?? stored?.entryOpenTime);
  const series = rows || [];
  if (stored?.dynamicSince != null) {
    return {
      closed: false,
      state: { ...stored, playbookVersion: DYNAMIC_TARGET_VERSION },
      dynamicSince: Number(stored.dynamicSince),
    };
  }
  const start = series.findIndex((row) => Number(row.openTime) === signal);
  if (start < 0) {
    const last = series.at(-1);
    return {
      closed: false,
      state: {
        ...stored,
        playbookVersion: DYNAMIC_TARGET_VERSION,
        projectedRewardRisk: projectedRewardRisk(stored),
      },
      dynamicSince: last ? Number(last.openTime) : null,
    };
  }
  let state = {
    ...stored,
    signalOpenTime: signal,
    playbookVersion: 1,
    tp1Hit: false,
    closed: false,
    status: "Open",
  };
  const from = start + 1;
  for (let index = from; index < series.length; index += 1) {
    const next = advanceTrade(state, series[index]);
    if (next.closed) {
      return { closed: true, state: { ...state, ...next, exitIndex: index, playbookVersion: 1 } };
    }
    state = { ...state, ...next };
  }
  const last = series.at(-1);
  return {
    closed: false,
    state: {
      ...state,
      playbookVersion: DYNAMIC_TARGET_VERSION,
      revisions: Array.isArray(stored?.revisions) ? stored.revisions : [],
      tp1Through: false,
      tp2Through: false,
      projectedRewardRisk: projectedRewardRisk(state),
    },
    dynamicSince: last ? Number(last.openTime) : null,
  };
}

export function setupLabels(levels, { outcome = "waiting", tp1Hit = false } = {}) {
  const moved = outcome === "tp1-be" || outcome === "tp1-tp2" || (outcome === "open" && tp1Hit);
  const redStop = moved ? levels.breakEven : levels.stop;
  const status = statusFor(outcome, tp1Hit || outcome === "tp1-be" || outcome === "tp1-tp2");
  const labels = {
    entry: `Entry ${formatSetupPrice(levels.entry)} · R:R ${Number(levels.rewardRisk).toFixed(2)}`,
    tp1: `TP1 ${shareLabel(levels.tp1Fraction)} ${formatSetupPrice(levels.tp1)} (${formatMove(levels.entry, levels.tp1)})`,
    tp2: `TP2 ${shareLabel(levels.tp2Fraction)} ${formatSetupPrice(levels.tp2)} (${formatMove(levels.entry, levels.tp2)})`,
    stop: moved
      ? "Stop → BE"
      : `Stop ${formatSetupPrice(levels.stop)} (${formatMove(levels.entry, levels.stop)})`,
  };
  const tooltip = [
    `Entry ${formatSetupPrice(levels.entry)}`,
    `TP1 ${formatSetupPrice(levels.tp1)}`,
    `TP2 ${formatSetupPrice(levels.tp2)}`,
    `Avg target ${formatSetupPrice(levels.weightedTarget)}`,
    `Stop ${formatSetupPrice(levels.stop)}`,
    `R:R ${Number(levels.rewardRisk).toFixed(2)}`,
    `Status ${status}`,
  ].join("\n");
  return {
    labels,
    tooltip,
    status,
    redStop,
    opacity: outcome === "waiting" || outcome === "open" ? 1 : 0.4,
    outcomeTag: OUTCOME_TAG[outcome] || null,
  };
}

function toSetup(trade, outcome) {
  const tp1Hit = !!trade.tp1Hit;
  const view = setupLabels(trade, { outcome, tp1Hit });
  return {
    id: String(trade.signalOpenTime),
    playbookId: trade.playbookId,
    playbookVersion: trade.playbookVersion || 1,
    direction: trade.direction === "short" ? "short" : "long",
    entryOpenTime: trade.signalOpenTime,
    exitOpenTime: trade.exitOpenTime ?? null,
    entryTime: chartTime(trade.signalOpenTime),
    exitTime: trade.exitOpenTime == null ? null : chartTime(trade.exitOpenTime),
    extendBars: SETUP_EXTEND_BARS,
    entry: trade.entry,
    tp1: trade.tp1,
    tp2: trade.tp2,
    stop: trade.stop,
    breakEven: trade.breakEven,
    breakEvenFactor: trade.breakEvenFactor,
    weightedTarget: trade.weightedTarget,
    rewardRisk: trade.rewardRisk,
    tp1Fraction: trade.tp1Fraction,
    tp2Fraction: trade.tp2Fraction,
    tp1Hit,
    outcome,
    outcomeLabel: OUTCOME_LABEL[outcome] || null,
    ...view,
    zones: {
      green: { from: trade.entry, to: trade.tp2 },
      red: { from: trade.entry, to: view.redStop },
    },
    panel: {
      entry: trade.entry,
      tp1: trade.tp1,
      tp2: trade.tp2,
      stop: trade.stop,
      rr: Number(trade.rewardRisk).toFixed(2),
      status: view.status,
    },
    r: trade.r ?? null,
    durationBars: trade.durationBars ?? null,
    signalIndex: trade.signalIndex ?? null,
    fillIndex: trade.fillIndex ?? null,
    exitIndex: trade.exitIndex ?? null,
    revisions: Array.isArray(trade.revisions) ? trade.revisions : [],
    projectedRewardRisk: Number.isFinite(Number(trade.projectedRewardRisk)) ? Number(trade.projectedRewardRisk) : null,
    dynamicSince: trade.dynamicSince ?? null,
    tp1Through: !!trade.tp1Through,
    tp2Through: !!trade.tp2Through,
  };
}

function isBullLock(rows, index) {
  const rsiValue = Number(rows[index]?.rsi);
  const close = Number(rows[index]?.close);
  if (!Number.isFinite(rsiValue) || !Number.isFinite(close) || rsiValue >= 50) return false;
  let start = index;
  while (start > 0) {
    const previous = Number(rows[start - 1].rsi);
    const previousClose = Number(rows[start - 1].close);
    if (!Number.isFinite(previous) || !Number.isFinite(previousClose) || previous >= 50) break;
    start -= 1;
  }
  const slice = rows.slice(start, index + 1);
  const later = slice.length - 1;
  return divergencePairs(slice).some((pair) => pair.kind === "bull" && pair.latest && pair.later === later);
}

function isBearLock(rows, index) {
  const rsiValue = Number(rows[index]?.rsi);
  const close = Number(rows[index]?.close);
  if (!Number.isFinite(rsiValue) || !Number.isFinite(close) || rsiValue <= 50) return false;
  let start = index;
  while (start > 0) {
    const previous = Number(rows[start - 1].rsi);
    const previousClose = Number(rows[start - 1].close);
    if (!Number.isFinite(previous) || !Number.isFinite(previousClose) || previous <= 50) break;
    start -= 1;
  }
  const slice = rows.slice(start, index + 1);
  const later = slice.length - 1;
  return divergencePairs(slice).some((pair) => pair.kind === "bear" && pair.latest && pair.later === later);
}

function playbookFor(playbooks, kind) {
  if (kind === "short") return playbooks.find((item) => item.direction === "short") || null;
  return playbooks.find((item) => item.direction !== "short") || null;
}

function lockKind(rows, index, playbooks) {
  const wantLong = playbooks.some((item) => item.direction !== "short");
  const wantShort = playbooks.some((item) => item.direction === "short");
  if (wantLong && isBullLock(rows, index)) return "long";
  if (wantShort && isBearLock(rows, index)) return "short";
  return null;
}

export const INVALID_SHORT_NOTE = "No short was created because TP2, TP1, entry, and the initial stop were not in that order.";

function shortInvalidNote(band) {
  const middle = Number(band?.middle);
  const lower = Number(band?.lower);
  if (!Number.isFinite(middle) || !Number.isFinite(lower)) {
    return "No short was created because this candle has no middle or lower Bollinger band.";
  }
  return INVALID_SHORT_NOTE;
}

function versionFor(strategyVersion, legacy, openTime) {
  if (legacy.has(Number(openTime))) return 1;
  return strategyVersion >= DYNAMIC_TARGET_VERSION ? DYNAMIC_TARGET_VERSION : 1;
}

function stepPosition(position, row, band) {
  if (Number(position.playbookVersion) >= DYNAMIC_TARGET_VERSION) {
    const stepped = advanceDynamic(position, row);
    if (stepped.closed) return stepped;
    return reviseOpenTargets({ ...position, ...stepped }, band, row);
  }
  return advanceTrade(position, row);
}

function carriedHere(carry, row) {
  if (!carry) return false;
  const open = Number(row.openTime);
  return open >= Number(carry.signalOpenTime) && open <= Number(carry.dynamicSince);
}

function runBook(rows, playbooks, options = {}) {
  const books = playbooks.filter(Boolean);
  const source = Array.isArray(rows) ? rows : [];
  const periodBook = books[0] || PLAYBOOK_1;
  const computed = bollinger(source.map((row) => row.close), periodBook.bandPeriod, periodBook.bandStd);
  const strategyVersion = options.strategyVersion >= DYNAMIC_TARGET_VERSION ? DYNAMIC_TARGET_VERSION : 1;
  const legacy = new Set((options.legacyOpenTimes || []).map(Number));
  const carry = options.carry && options.carry.dynamicSince != null ? options.carry : null;
  const trades = [];
  const skipped = [];
  let pending = null;
  let position = null;

  for (let index = 0; index < source.length; index += 1) {
    const row = source[index];
    const kind = lockKind(source, index, books);
    const band = bandFor(row, computed[index]);
    if (!position && carriedHere(carry, row)) {
      position = {
        ...carry.state,
        signalOpenTime: Number(carry.signalOpenTime),
        playbookVersion: DYNAMIC_TARGET_VERSION,
        dynamicSince: Number(carry.dynamicSince),
        closed: false,
      };
      pending = null;
      if (kind && Number(row.openTime) !== Number(carry.signalOpenTime)) {
        const book = playbookFor(books, kind);
        skipped.push({
          signalOpenTime: row.openTime,
          reason: "already-open",
          blockedBy: position.signalOpenTime,
          direction: kind,
          playbookId: book?.id || null,
        });
      }
      continue;
    }
    if (position) {
      const stepped = stepPosition(position, row, band);
      if (stepped.closed) {
        trades.push(withDuration({ ...position, ...stepped, exitIndex: index }, index));
        position = null;
      } else {
        position = { ...position, ...stepped };
        if (kind) {
          const book = playbookFor(books, kind);
          skipped.push({
            signalOpenTime: row.openTime,
            reason: "already-open",
            blockedBy: position.signalOpenTime,
            direction: kind,
            playbookId: book?.id || null,
          });
        }
      }
    }
    if (position) continue;
    if (kind) {
      const book = playbookFor(books, kind);
      const levels = book ? levelsFromRow(row, band, book) : null;
      if (levels) {
        pending = {
          ...levels,
          playbookId: book.id,
          playbookVersion: versionFor(strategyVersion, legacy, row.openTime),
          direction: book.direction === "short" ? "short" : "long",
          signalIndex: index,
          signalOpenTime: row.openTime,
          tp1Hit: false,
          revisions: [],
          tp1Through: false,
          tp2Through: false,
          projectedRewardRisk: projectedRewardRisk({ ...levels, direction: book.direction === "short" ? "short" : "long" }),
        };
        continue;
      }
      if (kind === "short") {
        skipped.push({
          signalOpenTime: row.openTime,
          reason: "invalid-setup",
          direction: "short",
          playbookId: book?.id || PLAYBOOK_SHORT.id,
          note: shortInvalidNote(band),
        });
      } else {
        pending = null;
        continue;
      }
    }
    if (!pending) continue;
    const armed = { ...pending, fillIndex: index, tp1Hit: false, status: "Open" };
    const opened = Number(armed.playbookVersion) >= DYNAMIC_TARGET_VERSION
      ? stepPosition(armed, row, band)
      : advanceTrade(armed, row);
    pending = null;
    if (opened.closed) trades.push(withDuration({ ...armed, ...opened, exitIndex: index }, index));
    else position = { ...armed, ...opened };
  }

  if (position) trades.push(withDuration(markToMarket(position, source[source.length - 1]), source.length - 1));
  const setups = trades.map((trade) => toSetup(trade, trade.outcome));
  if (pending) setups.push(toSetup({ ...pending, r: null }, "waiting"));
  return { trades, setups, pending, skipped, report: summarizeTrades(trades) };
}

export function simulateMarket(rows, options = {}) {
  const selected = options.playbooks || PLAYBOOKS;
  const playbooks = selected.map((playbook) => {
    if (options.rewardRisk == null && options.rewardRiskFor == null) return playbook;
    return {
      ...playbook,
      rewardRisk: options.rewardRisk ?? playbook.rewardRisk,
      rewardRiskFor: options.rewardRiskFor
        ? (openTime) => options.rewardRiskFor(openTime, playbook.id)
        : playbook.rewardRiskFor,
    };
  });
  return runBook(rows, playbooks, options);
}

function bandFor(row, computed) {
  const middle = Number(row?.band?.middle);
  const upper = Number(row?.band?.upper);
  const lower = Number(row?.band?.lower);
  if (Number.isFinite(middle) && (Number.isFinite(upper) || Number.isFinite(lower))) {
    return {
      middle,
      upper: Number.isFinite(upper) ? upper : computed?.upper,
      lower: Number.isFinite(lower) ? lower : computed?.lower,
    };
  }
  return computed;
}

function withDuration(trade, lastIndex) {
  const end = trade.exitIndex == null ? lastIndex : trade.exitIndex;
  return { ...trade, durationBars: end - trade.signalIndex };
}

export function simulatePlaybook(rows, playbook = PLAYBOOK_1, options = {}) {
  return runBook(rows, [playbook], options);
}

function bucket(id, label, count, total) {
  return { id, label, count, share: total ? count / total : 0 };
}

export function summarizeTrades(trades) {
  const list = trades || [];
  const total = list.length;
  const count = (outcome) => list.filter((trade) => trade.outcome === outcome).length;
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  const curve = [{ trade: 0, equity: 0, r: 0 }];
  for (let index = 0; index < list.length; index += 1) {
    equity += Number(list[index].r) || 0;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    curve.push({
      trade: index + 1,
      equity,
      r: list[index].r,
      time: list[index].signalOpenTime,
    });
  }
  const durations = list.map((trade) => trade.durationBars).filter((value) => Number.isFinite(value));
  const tp1Hits = list.filter((trade) => (
    trade.outcome === "tp1-be"
    || trade.outcome === "tp1-tp2"
    || (trade.outcome === "open" && trade.tp1Hit)
  )).length;
  const tp2Hits = count("tp1-tp2");
  const averageR = total ? equity / total : 0;
  const realisedR = list
    .filter((trade) => trade.outcome !== "open")
    .reduce((sum, trade) => sum + (Number(trade.r) || 0), 0);
  return {
    trades: total,
    stoppedBeforeTp1: count("stopped"),
    tp1ThenBreakEven: count("tp1-be"),
    stillOpen: count("open"),
    realisedR,
    outcomes: {
      stopped: bucket("stopped", OUTCOME_LABEL.stopped, count("stopped"), total),
      tp1Be: bucket("tp1-be", OUTCOME_LABEL["tp1-be"], count("tp1-be"), total),
      tp1Tp2: bucket("tp1-tp2", OUTCOME_LABEL["tp1-tp2"], count("tp1-tp2"), total),
      open: bucket("open", OUTCOME_LABEL.open, count("open"), total),
    },
    tp1HitRate: total ? tp1Hits / total : 0,
    tp2HitRate: total ? tp2Hits / total : 0,
    averageR,
    totalR: equity,
    expectancy: averageR,
    maxDrawdownR,
    averageDuration: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    equity: curve,
  };
}

export function indicatorRows(candles, playbook = PLAYBOOK_1, now = Date.now(), settings) {
  const closed = closedCandles(candles || [], now);
  const rsiPeriod = Number(settings?.rsiPeriod ?? envDefaults().rsiPeriod);
  const closes = closed.map((candle) => candle.close);
  const bands = bollinger(closes, playbook.bandPeriod, playbook.bandStd);
  const momentum = rsi(closes, rsiPeriod);
  return closed.map((candle, index) => ({
    ...candle,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    rsi: momentum[index],
    band: bands[index],
  }));
}

export function setupsForCandles(candles, {
  interval = "4h",
  now = Date.now(),
  settings,
  playbook = PLAYBOOK_1,
} = {}) {
  if (!playbook.enabledTimeframes.includes(interval)) return [];
  return simulatePlaybook(indicatorRows(candles, playbook, now, settings), playbook).setups;
}

export function tradeRows(trades) {
  return (trades || []).map((trade) => ({
    date: trade.signalOpenTime,
    entry: trade.entry,
    tp1: trade.tp1,
    tp2: trade.tp2,
    stop: trade.stop,
    outcome: OUTCOME_LABEL[trade.outcome] || trade.outcome,
    outcomeId: trade.outcome,
    r: trade.r,
    status: trade.status,
    durationBars: trade.durationBars,
    direction: trade.direction === "short" ? "short" : "long",
    rewardRisk: trade.rewardRisk,
    playbookId: trade.playbookId,
    playbookVersion: trade.playbookVersion || 1,
  }));
}

function stopMoved(trade) {
  return trade.outcome === "tp1-be" || trade.outcome === "tp1-tp2" || !!trade.tp1Hit;
}

function currentStop(trade) {
  return stopMoved(trade) ? Number(trade.breakEven) : Number(trade.stop);
}

export function tradeStatus(trade) {
  if (!trade || trade.outcome === "waiting") return null;
  if (trade.outcome === "open") return stopMoved(trade) ? "TP1 hit — stop at break-even" : "Open";
  if (trade.outcome === "stopped") return "Stopped before TP1";
  if (trade.outcome === "tp1-be") return "TP1 then break-even stop";
  if (trade.outcome === "tp1-tp2") return "TP1 then TP2";
  return trade.status || trade.outcome;
}

export function tradeExits(trade) {
  if (!trade || trade.outcome === "waiting" || trade.outcome === "open") return [];
  const first = Number(trade.tp1Fraction ?? PLAYBOOK_1.tp1Fraction);
  const second = Number(trade.tp2Fraction ?? PLAYBOOK_1.tp2Fraction);
  if (trade.outcome === "stopped") return [{ label: "Stop", price: Number(trade.stop), fraction: 1 }];
  if (trade.outcome === "tp1-be") {
    return [
      { label: "TP1", price: Number(trade.tp1), fraction: first },
      { label: "BE stop", price: Number(trade.breakEven), fraction: second },
    ];
  }
  if (trade.outcome === "tp1-tp2") {
    return [
      { label: "TP1", price: Number(trade.tp1), fraction: first },
      { label: "TP2", price: Number(trade.tp2), fraction: second },
    ];
  }
  return [];
}

export function tradeDetails(trade) {
  if (!trade || trade.outcome === "waiting" || !Number.isFinite(Number(trade.entry))) return null;
  const moved = stopMoved(trade);
  return {
    entry: Number(trade.entry),
    tp1: Number(trade.tp1),
    tp2: Number(trade.tp2),
    initialStop: Number(trade.stop),
    currentStop: currentStop(trade),
    currentStopLabel: moved ? "BE stop" : "Stop",
    rr: Number(trade.rewardRisk ?? PLAYBOOK_1.rewardRisk).toFixed(2),
    projectedRr: Number(trade.playbookVersion) >= DYNAMIC_TARGET_VERSION && Number.isFinite(Number(trade.projectedRewardRisk))
      ? Number(trade.projectedRewardRisk).toFixed(2)
      : null,
    status: tradeStatus(trade),
    outcome: trade.outcome,
    r: trade.r ?? null,
    exits: tradeExits(trade),
  };
}

export function levelSpec(trade) {
  const details = tradeDetails(trade);
  if (!details) return null;
  return [
    { id: "entry", label: "Entry", price: details.entry, color: SETUP_COLORS.entry },
    { id: "tp1", label: "TP1", price: details.tp1, color: SETUP_COLORS.target },
    { id: "tp2", label: "TP2", price: details.tp2, color: SETUP_COLORS.target },
    { id: "stop", label: details.currentStopLabel, price: details.currentStop, color: SETUP_COLORS.stop },
  ];
}

export function visibleLevelTrade({ hover = null, selected = null, pinned = null } = {}) {
  return hover || selected || pinned || null;
}

export const ALREADY_OPEN_NOTE = "Another trade was already open, so this divergence did not open a trade.";

export function previewLevels(trade, ratio) {
  if (!trade || !Number.isFinite(Number(trade.entry))) return null;
  const rewardRisk = allowedRewardRisk(ratio);
  const direction = trade.direction === "short" ? "short" : "long";
  const levels = playbookLevels({
    entry: trade.entry,
    tp1: trade.tp1,
    tp2: trade.tp2,
    tp1Fraction: trade.tp1Fraction ?? PLAYBOOK_1.tp1Fraction,
    tp2Fraction: trade.tp2Fraction ?? PLAYBOOK_1.tp2Fraction,
    rewardRisk,
    breakEvenFactor: trade.breakEvenFactor ?? PLAYBOOK_1.breakEvenFactor,
    direction,
  });
  const valid = direction === "short"
    ? levels.tp2 < levels.tp1
      && levels.tp1 < levels.entry
      && levels.entry < levels.stop
      && levels.risk > 0
      && levels.weightedTarget < levels.entry
    : levels.stop < levels.entry
      && levels.entry < levels.tp1
      && levels.tp1 < levels.tp2
      && levels.risk > 0
      && levels.weightedTarget > levels.entry;
  return {
    rewardRisk,
    direction,
    entry: levels.entry,
    tp1: levels.tp1,
    tp2: levels.tp2,
    stop: levels.stop,
    risk: levels.risk,
    breakEven: levels.breakEven,
    weightedTarget: levels.weightedTarget,
    valid,
    sameAsRecorded: allowedRewardRisk(trade.rewardRisk) === rewardRisk,
  };
}

export function invalidWhatIfCopy(preview) {
  if (!preview || preview.valid) return null;
  const kind = preview.direction === "short" ? "short" : "long";
  return `What-if ${preview.rewardRisk}:1 is not a valid ${kind} for this setup`;
}

export function outcomeMark(outcome) {
  if (outcome === "stopped") return "Stopped";
  if (outcome === "tp1-be") return "TP1 then BE";
  if (outcome === "tp1-tp2") return "TP2";
  return null;
}

// Ribbon copy comes from the stored outcome. Price geometry is not a result.
export function resultRibbon(trade) {
  const outcome = trade?.outcome;
  if (outcome === "tp1-tp2") return { outcome, text: "✓ TP2 hit", tone: "profit" };
  if (outcome === "stopped") return { outcome, text: "✕ Stopped", tone: "loss" };
  if (outcome === "tp1-be") return { outcome, text: "TP1 then BE", tone: "partial" };
  return null;
}

export function compactResultLabel(trade) {
  const ribbon = resultRibbon(trade);
  if (!ribbon) return "";
  const direction = trade?.direction === "short" ? "Short" : "Long";
  const ratio = Number(trade?.rewardRisk);
  const ratioText = Number.isFinite(ratio) ? `${Number.isInteger(ratio) ? String(ratio) : String(ratio)}:1` : "";
  const mark = ribbon.outcome === "tp1-tp2" ? "✓ TP2" : ribbon.text;
  return [direction, ratioText, mark].filter(Boolean).join(" · ");
}

export function associateDivergence(marker, { open = null, history = [], skipped = [] } = {}) {
  const time = Number(marker?.barOpenTime);
  if (!Number.isFinite(time)) return { trade: null, note: null };
  const trades = [];
  if (open) trades.push(open);
  for (const trade of history || []) {
    if (trade) trades.push(trade);
  }
  const trade = trades.find((item) => Number(item.signalOpenTime ?? item.entryOpenTime) === time) || null;
  if (trade) return { trade, note: null };
  const skip = (skipped || []).find((item) => Number(item.signalOpenTime) === time);
  if (skip?.reason === "already-open") return { trade: null, note: ALREADY_OPEN_NOTE };
  if (skip?.reason === "invalid-setup") return { trade: null, note: skip.note || INVALID_SHORT_NOTE };
  return { trade: null, note: null };
}

export function divergenceSkipNote(skipped, time) {
  return associateDivergence({ barOpenTime: time }, { skipped }).note;
}

function sceneRole(trade) {
  if (!trade || trade.outcome === "waiting") return null;
  if (trade.outcome === "open") return "current";
  return "history";
}

export function levelScene({ pinned = false, hover = null, selected = null, openTrade = null, history = [] } = {}) {
  if (pinned) {
    const trades = [];
    const seen = new Set();
    const selectedId = selected?.id == null ? null : String(selected.id);
    for (const trade of history || []) {
      if (sceneRole(trade) !== "history") continue;
      const key = trade?.id == null ? "" : String(trade.id);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      trades.push({
        ...trade,
        role: "history",
        overlay: "box",
        selected: selectedId != null && key === selectedId,
      });
    }
    if (sceneRole(openTrade) === "current") trades.push({ ...openTrade, role: "current" });
    return { trades };
  }
  const trade = hover || selected || null;
  const role = sceneRole(trade);
  if (!role) return { trades: [] };
  return { trades: [{ ...trade, role }] };
}
