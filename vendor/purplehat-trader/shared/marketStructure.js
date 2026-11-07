import { decimalsFromTickSize } from "./coins.js";

// The old rolling lookback is not the live rule. Swings use the counts below.
export const STRUCTURE_LOOKBACK = null;
export const STRUCTURE_SOURCE_RULE = "close-swing-no-lookahead";
export const MS_ENTRY_RULE = "close-confirmed-retest";
export const MS_STOP_RULE = "opposite-boundary-one-tick";
export const MS_TARGET_RULE = "nearest-prior-confirmed-swing-close";
export const MS_SWING_LEFT = 2;
export const MS_SWING_RIGHT = 2;
export const MS_RETEST_WINDOWS = { "4h": 6, "1d": 3 };
export const CLOSE_EXIT_LABEL = "Close-based simulated exits; not exchange stop execution";
export const FRESH_RANGE_LABEL = "Waiting for fresh confirmed high + low";
export const MISSING_TARGET_LABEL = "Retest confirmed — no qualifying prior target";
export const MISSING_TICK_LABEL = "Instrument tick metadata is missing";

export function msDefaults(timeframe) {
  const tf = timeframe === "1d" ? "1d" : "4h";
  return { left: MS_SWING_LEFT, right: MS_SWING_RIGHT, retestWindow: MS_RETEST_WINDOWS[tf] };
}

// Historical 4H illustration only. It is not a current level and it has no source timestamp.
export const HISTORICAL_STRUCTURE_EXAMPLE = {
  timeframe: "4h",
  high: 76907.1,
  low: 75538.04,
  note: "Historical 4H example only. Not a current level, and it has no source timestamp.",
};

export const SIGNAL_FAMILIES = [
  { id: "bullish-divergence", label: "Bullish divergence" },
  { id: "bearish-divergence", label: "Bearish divergence" },
  { id: "market-structure", label: "Market structure breaks" },
];

function requireLookback(lookback) {
  const count = Number(lookback);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Market structure lookback must be a positive integer. Automatic detection is not configured.");
  }
  return count;
}

function asCandle(row) {
  if (row != null && typeof row === "object") {
    return { close: Number(row.close), openTime: Number.isFinite(Number(row.openTime)) ? Number(row.openTime) : null };
  }
  return { close: Number(row), openTime: null };
}

// The extreme close keeps the earliest candle that established it. Wicks are ignored.
export function structureRange(candles, lookback) {
  const count = requireLookback(lookback);
  const window = (candles || []).slice(-count).map(asCandle).filter((row) => Number.isFinite(row.close));
  if (window.length < count) return null;
  let high = -Infinity;
  let low = Infinity;
  let highSourceTime = null;
  let lowSourceTime = null;
  for (const row of window) {
    if (row.close > high) {
      high = row.close;
      highSourceTime = row.openTime;
    }
    if (row.close < low) {
      low = row.close;
      lowSourceTime = row.openTime;
    }
  }
  return { high, low, highSourceTime, lowSourceTime, lookback: count };
}

export function shadeStart(bounds) {
  const highAt = Number(bounds?.highSourceTime);
  const lowAt = Number(bounds?.lowSourceTime);
  if (!Number.isFinite(highAt) || !Number.isFinite(lowAt)) return null;
  return Math.max(highAt, lowAt);
}

export function structureRays(bounds) {
  if (!bounds || !Number.isFinite(Number(bounds.high)) || !Number.isFinite(Number(bounds.low))) return null;
  return {
    high: Number(bounds.high),
    low: Number(bounds.low),
    highFrom: Number.isFinite(Number(bounds.highSourceTime)) ? Number(bounds.highSourceTime) : null,
    lowFrom: Number.isFinite(Number(bounds.lowSourceTime)) ? Number(bounds.lowSourceTime) : null,
    shadeFrom: shadeStart(bounds),
  };
}

function rememberCandles(candles, candle, lookback) {
  const next = (candles || []).map(asCandle).filter((row) => Number.isFinite(row.close));
  const incoming = asCandle(candle);
  if (Number.isFinite(incoming.close)) next.push(incoming);
  return next.slice(-lookback);
}

function copyRange(range) {
  if (!range) return null;
  return {
    high: range.high,
    low: range.low,
    highSourceTime: range.highSourceTime ?? null,
    lowSourceTime: range.lowSourceTime ?? null,
    highConfirmTime: range.highConfirmTime ?? null,
    lowConfirmTime: range.lowConfirmTime ?? null,
  };
}

// The close is tested against the boundaries already in force.
// Only a strict close breaks them. Wicks and equal closes do not.
// The next range is calculated after that test and does not erase the event.
export function stepStructure(state, candle, lookback) {
  const count = requireLookback(lookback);
  const close = Number(candle?.close);
  const prior = state?.range || null;
  let event = null;
  if (prior && Number.isFinite(close)) {
    if (close > prior.high) {
      event = {
        kind: "break-high",
        bias: "Looking for longs",
        close,
        at: candle?.openTime ?? null,
        range: copyRange(prior),
      };
    } else if (close < prior.low) {
      event = {
        kind: "break-low",
        bias: "Looking for shorts",
        close,
        at: candle?.openTime ?? null,
        range: copyRange(prior),
      };
    }
  }
  const closes = rememberCandles(state?.closes, candle, count);
  let range = prior;
  if (!prior || event) range = structureRange(closes, count) || prior;
  return {
    range,
    closes,
    bias: event ? event.bias : (state?.bias ?? null),
    events: [...(state?.events || []), ...(event ? [event] : [])],
  };
}

export function walkStructure(candles, lookback) {
  let state = { range: null, closes: [], bias: null, events: [] };
  for (const candle of candles || []) state = stepStructure(state, candle, lookback);
  return state;
}

export function presentBreak(event) {
  if (!event) return null;
  const bullish = event.kind === "break-high";
  const close = Number(event.close);
  return {
    title: bullish ? "Bullish MS break" : "Bearish MS break",
    bias: event.bias,
    watching: "Watching for retest",
    confirmingOpenTime: event.at ?? null,
    close: Number.isFinite(close) ? close : null,
    breached: copyRange(event.range),
    targetStatus: "unconfirmed",
    target: null,
    scenario: null,
  };
}

// An illustrative price is drawn only when the caller marks it illustrative.
// Nothing in the live chart supplies that price.
export function scenarioPath(event, illustrativeTarget) {
  if (!event?.range || !illustrativeTarget || illustrativeTarget.illustrative !== true) return null;
  const price = Number(illustrativeTarget.price);
  const fromPrice = event.kind === "break-high" ? Number(event.range.high) : Number(event.range.low);
  if (!Number.isFinite(price) || !Number.isFinite(fromPrice)) return null;
  return {
    label: "Illustrative scenario, not forecast",
    note: "Not a forecast. A retest is not required, and this is not an entry or a prediction.",
    fromPrice,
    toPrice: price,
    illustrative: true,
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteTick(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : fallback;
}

function shiftTick(price, tick, direction) {
  const places = Math.min(12, decimalsFromTickSize(String(tick)));
  return Number((price + direction * tick).toFixed(places));
}

function normalizeCandles(candles) {
  const byTime = new Map();
  let missingClose = 0;
  for (const raw of candles || []) {
    if (raw == null || typeof raw !== "object") {
      missingClose += 1;
      continue;
    }
    const openTime = Number(raw.openTime);
    const close = Number(raw.close);
    if (!Number.isFinite(openTime)) continue;
    if (!Number.isFinite(close)) {
      missingClose += 1;
      continue;
    }
    const closeTime = Number(raw.closeTime);
    byTime.set(openTime, {
      openTime,
      closeTime: Number.isFinite(closeTime) ? closeTime : openTime,
      close,
      high: Number(raw.high),
      low: Number(raw.low),
    });
  }
  return {
    rows: [...byTime.values()].sort((left, right) => left.openTime - right.openTime),
    missingClose,
  };
}

function confirmSwings(rows, index, left, right) {
  const sourceIndex = index - right;
  if (sourceIndex < left) return [];
  const price = rows[sourceIndex].close;
  let high = true;
  let low = true;
  for (let step = 1; step <= left; step += 1) {
    const prior = rows[sourceIndex - step].close;
    if (!(price >= prior)) high = false;
    if (!(price <= prior)) low = false;
  }
  for (let step = 1; step <= right; step += 1) {
    const next = rows[sourceIndex + step].close;
    if (!(price > next)) high = false;
    if (!(price < next)) low = false;
  }
  const swing = {
    price,
    sourceIndex,
    sourceTime: rows[sourceIndex].closeTime,
    sourceOpenTime: rows[sourceIndex].openTime,
    confirmIndex: index,
    confirmTime: rows[index].closeTime,
    confirmOpenTime: rows[index].openTime,
  };
  if (high) return [{ ...swing, kind: "high" }];
  if (low) return [{ ...swing, kind: "low" }];
  return [];
}

function canArm(high, low, close) {
  if (!high || !low) return false;
  if (high.sourceIndex === low.sourceIndex) return false;
  if (!(high.price > low.price)) return false;
  return close >= low.price && close <= high.price;
}

function nearestTarget(swings, side, entry, breakIndex) {
  const kind = side === "long" ? "high" : "low";
  const eligible = swings.filter((swing) => swing.kind === kind && swing.confirmIndex < breakIndex);
  const picked = side === "long"
    ? eligible.filter((swing) => swing.price > entry).sort((a, b) => a.price - b.price || b.confirmIndex - a.confirmIndex)
    : eligible.filter((swing) => swing.price < entry).sort((a, b) => b.price - a.price || b.confirmIndex - a.confirmIndex);
  return picked[0] || null;
}

function crossExit(trade, candle) {
  if (trade.exit || !(trade.entryIndex < candle.index)) return trade;
  const close = candle.close;
  let reason = null;
  if (trade.side === "long") {
    if (close <= trade.stop) reason = "stop";
    else if (close >= trade.target) reason = "target";
  } else if (close >= trade.stop) reason = "stop";
  else if (close <= trade.target) reason = "target";
  if (!reason) return trade;
  return {
    ...trade,
    status: "closed",
    exit: {
      price: close,
      reason,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      label: CLOSE_EXIT_LABEL,
      assumedLevelFill: false,
    },
  };
}

function tryEnter(setup, candle, swings, tickSize, trades) {
  const event = setup.event;
  if (trades.some((trade) => trade.breakId === event.id)) return;
  const bullish = event.kind === "break-high";
  const entry = candle.close;
  if (!(tickSize > 0)) {
    event.outcome = "missing-tick";
    return;
  }
  const stop = bullish
    ? shiftTick(event.range.low, tickSize, -1)
    : shiftTick(event.range.high, tickSize, 1);
  const targetSwing = nearestTarget(swings, bullish ? "long" : "short", entry, event.breakIndex);
  if (!targetSwing) {
    event.outcome = "missing-target";
    return;
  }
  const target = targetSwing.price;
  const ordered = bullish ? stop < entry && entry < target : target < entry && entry < stop;
  if (!ordered) {
    event.outcome = "invalid-geometry";
    return;
  }
  const risk = Math.abs(entry - stop);
  trades.push({
    id: `${event.id}:trade`,
    breakId: event.id,
    side: bullish ? "long" : "short",
    entry,
    stop,
    target,
    entryTime: candle.closeTime,
    entryOpenTime: candle.openTime,
    entryIndex: candle.index,
    rewardRisk: risk > 0 ? Math.abs(target - entry) / risk : null,
    targetProvenance: {
      kind: targetSwing.kind,
      price: targetSwing.price,
      sourceTime: targetSwing.sourceTime,
      confirmTime: targetSwing.confirmTime,
      sourceOpenTime: targetSwing.sourceOpenTime,
      rule: MS_TARGET_RULE,
    },
    stopProvenance: bullish ? "frozen low minus one tick" : "frozen high plus one tick",
    entryProvenance: "reclaim close",
    tickSize,
    exit: null,
    status: "active",
  });
  event.outcome = "filled";
}

function applyRetest(setup, candle, swings, tickSize, trades) {
  const event = setup.event;
  const bullish = event.kind === "break-high";
  const high = event.range.high;
  const low = event.range.low;
  const close = candle.close;
  if (bullish) {
    if (close < low) {
      event.outcome = "cancelled";
      return;
    }
    if (!setup.touched) {
      if (close <= high) {
        setup.touched = true;
        event.touchOpenTime = candle.openTime;
      }
      return;
    }
    if (close > high) tryEnter(setup, candle, swings, tickSize, trades);
    return;
  }
  if (close > high) {
    event.outcome = "cancelled";
    return;
  }
  if (!setup.touched) {
    if (close >= low) {
      setup.touched = true;
      event.touchOpenTime = candle.openTime;
    }
    return;
  }
  if (close < low) tryEnter(setup, candle, swings, tickSize, trades);
}

function recordBreak(bucket, armed, candle, timeframe, side) {
  const kind = side === "high" ? "break-high" : "break-low";
  const id = `${timeframe}:${candle.openTime}:${armed.high.sourceTime}:${armed.low.sourceTime}:${kind}`;
  if (bucket.events.some((event) => event.id === id)) return;
  const event = {
    id,
    kind,
    bias: side === "high" ? "Looking for longs" : "Looking for shorts",
    close: candle.close,
    at: candle.openTime,
    closeTime: candle.closeTime,
    breakIndex: candle.index,
    outcome: "watching",
    range: {
      high: armed.high.price,
      low: armed.low.price,
      highSourceTime: armed.high.sourceTime,
      lowSourceTime: armed.low.sourceTime,
      highConfirmTime: armed.high.confirmTime,
      lowConfirmTime: armed.low.confirmTime,
      highSourceOpenTime: armed.high.sourceOpenTime,
      lowSourceOpenTime: armed.low.sourceOpenTime,
    },
  };
  bucket.events.push(event);
  bucket.setups.push({ event, touched: false, window: bucket.retestWindow });
}

function chooseStatus({ rows, left, right, events, armed, setups, trades }) {
  const openTrade = trades.some((trade) => trade.status === "active");
  const latest = events.at(-1) || null;
  const watching = setups.some((setup) => setup.event.outcome === "watching");
  const enough = rows.length >= left + right + 1;
  if (!rows.length || (!enough && events.length === 0)) return "insufficient-history";
  if (openTrade) return "trade-active";
  if (watching) return "watching-retest";
  if (latest?.outcome === "missing-target") return "missing-target";
  if (latest?.outcome === "missing-tick") return "missing-tick";
  if (latest?.outcome === "invalid-geometry") return "invalid-geometry";
  if (armed) return "range-armed";
  if (latest?.outcome === "cancelled") return "cancelled";
  if (latest?.outcome === "expired") return "expired";
  if (latest?.outcome === "filled") return "trade-closed";
  return "collecting";
}

function buildSummary(state) {
  const name = state.timeframe === "1d" ? "Daily" : "4H";
  const latest = state.events.at(-1) || null;
  const fresh = Boolean(latest) && !state.armed;
  const enough = state.rows.length >= state.left + state.right + 1;
  const highBit = state.latestHigh ? "high confirmed" : "high not yet";
  const lowBit = state.latestLow ? "low confirmed" : "low not yet";
  const progressText = enough && !state.armed
    ? (fresh ? `${FRESH_RANGE_LABEL}. ${highBit}. ${lowBit}.` : `Collecting swings. ${highBit}. ${lowBit}.`)
    : "";
  const lines = [];
  if (state.status === "insufficient-history") {
    lines.push(state.rows.length
      ? `${name} · Insufficient closed history: ${state.rows.length} closed candle${state.rows.length === 1 ? "" : "s"}. A ${state.left}-left and ${state.right}-right swing needs ${state.left + state.right + 1} closed candles.`
      : `${name} · No closed candles are loaded for this timeframe.`);
  } else if (state.status === "missing-target") lines.push(`${name} · ${MISSING_TARGET_LABEL}`);
  else if (state.status === "missing-tick") lines.push(`${name} · ${MISSING_TICK_LABEL}`);
  else if (state.status === "invalid-geometry") lines.push(`${name} · Retest confirmed — stop, entry, and target are not in order`);
  else if (state.status === "trade-active") lines.push(`${name} · Modeled trade active`);
  else if (state.status === "trade-closed") lines.push(`${name} · Modeled trade closed`);
  else if (state.status === "watching-retest") lines.push(`${name} · Watching for retest`);
  else if (state.status === "expired") lines.push(`${name} · Retest window expired`);
  else if (state.status === "cancelled") lines.push(`${name} · Retest cancelled`);
  else if (state.status === "range-armed") lines.push(`${name} · Range armed`);
  else lines.push(fresh ? `${name} · ${FRESH_RANGE_LABEL}` : `${name} · Collecting swings`);
  if (progressText && (fresh || state.status === "collecting" || state.status === "trade-active" || state.status === "watching-retest" || state.status === "expired" || state.status === "cancelled" || state.status === "missing-target" || state.status === "missing-tick")) {
    lines.push(progressText);
  }
  if (latest) {
    const side = latest.kind === "break-high" ? "high" : "low";
    const price = side === "high" ? latest.range.high : latest.range.low;
    const title = latest.kind === "break-high" ? "Bullish MS break" : "Bearish MS break";
    lines.push(`${title} · ${latest.bias}. Breached ${side} ${price}.`);
  }
  if (state.armed && state.status !== "range-armed") {
    lines.push(`Range armed. High ${state.armed.high.price}. Low ${state.armed.low.price}.`);
  }
  const trade = state.trade;
  if (trade) {
    const rr = Number.isFinite(trade.rewardRisk) ? ` RR ${trade.rewardRisk.toFixed(2)} (informational).` : "";
    const sideName = trade.side === "long" ? "Long" : "Short";
    const earlier = latest && trade.breakId !== latest.id ? " This modeled trade is from an earlier break." : "";
    if (trade.status === "active") lines.push(`${sideName} entry ${trade.entry}. Stop ${trade.stop}. Target ${trade.target}.${rr}${earlier}`);
    else lines.push(`${sideName} modeled exit ${trade.exit.price} on the closed candle. Entry ${trade.entry}. Stop ${trade.stop}. Target ${trade.target}.${rr}${earlier}`);
    lines.push(CLOSE_EXIT_LABEL);
  }
  if (state.missingClose) {
    const count = state.missingClose;
    lines.push(`${count} candle${count === 1 ? " is" : "s are"} missing a close and ${count === 1 ? "was" : "were"} left out of the replay.`);
  }
  return { lines, progressText };
}

// Replay closed candles from oldest to newest. An armed range stays frozen until a later close breaks it.
export function walkMarketStructure(candles, options = {}) {
  const timeframe = options.timeframe === "1d" ? "1d" : "4h";
  const defaults = msDefaults(timeframe);
  const left = positiveInt(options.left, defaults.left);
  const right = positiveInt(options.right, defaults.right);
  const retestWindow = positiveInt(options.retestWindow, defaults.retestWindow);
  const tickSize = finiteTick(options.tickSize);
  const { rows, missingClose } = normalizeCandles(candles);
  const swings = [];
  const events = [];
  const setups = [];
  let trades = [];
  let latestHigh = null;
  let latestLow = null;
  let armed = null;
  let lastBreakIndex = -1;
  const bucket = { events, setups, retestWindow };

  for (let index = 0; index < rows.length; index += 1) {
    const candle = { ...rows[index], index };
    const born = confirmSwings(rows, index, left, right);
    for (const swing of born) swings.push(swing);
    trades = trades.map((trade) => crossExit(trade, candle));
    if (armed && index > armed.atIndex) {
      if (candle.close > armed.high.price) {
        recordBreak(bucket, armed, candle, timeframe, "high");
        armed = null;
        latestHigh = null;
        latestLow = null;
        lastBreakIndex = index;
      } else if (candle.close < armed.low.price) {
        recordBreak(bucket, armed, candle, timeframe, "low");
        armed = null;
        latestHigh = null;
        latestLow = null;
        lastBreakIndex = index;
      }
    }
    for (const swing of born) {
      if (swing.sourceIndex <= lastBreakIndex) continue;
      if (swing.kind === "high") latestHigh = swing;
      else latestLow = swing;
    }
    for (const setup of setups) {
      if (setup.event.outcome !== "watching") continue;
      if (index <= setup.event.breakIndex) continue;
      const offset = index - setup.event.breakIndex;
      if (offset > setup.window) {
        setup.event.outcome = "expired";
        continue;
      }
      applyRetest(setup, candle, swings, tickSize, trades);
      if (setup.event.outcome === "watching" && offset === setup.window) setup.event.outcome = "expired";
    }
    if (!armed && canArm(latestHigh, latestLow, candle.close)) {
      armed = { high: latestHigh, low: latestLow, atIndex: index };
    }
  }

  const bounds = armed ? {
    high: armed.high.price,
    low: armed.low.price,
    highSourceTime: armed.high.sourceTime,
    lowSourceTime: armed.low.sourceTime,
    highConfirmTime: armed.high.confirmTime,
    lowConfirmTime: armed.low.confirmTime,
    provenance: "configured",
  } : null;
  const trade = trades.find((item) => item.status === "active") || trades.at(-1) || null;
  const status = chooseStatus({ rows, left, right, events, armed, setups, trades });
  const summary = buildSummary({
    timeframe, status, rows, left, right, armed, latestHigh, latestLow, events, trade, missingClose,
  });
  const missing = [];
  if (missingClose) missing.push(summary.lines.at(-1));
  if (status === "insufficient-history") missing.push(summary.lines[0]);
  if (status === "missing-tick") missing.push(MISSING_TICK_LABEL);
  if (status === "missing-target") missing.push(MISSING_TARGET_LABEL);
  return {
    timeframe,
    left,
    right,
    retestWindow,
    tickSize,
    status,
    summary: summary.lines,
    progressText: summary.progressText,
    missing,
    bounds,
    swings,
    events,
    trades,
    trade,
    armed: Boolean(armed),
  };
}

function configuredOption(input, key, fallback) {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

function tradeValue(value) {
  if (!value || typeof value !== "object") return null;
  const price = finiteNumber(value.price);
  if (price == null) return null;
  const sourceTime = finiteNumber(value.sourceTime);
  if (value.provenance === "manual" || value.manual === true) {
    return { price, provenance: "Manual", sourceTime };
  }
  if (value.provenance === "configured") {
    return { price, provenance: "configured", sourceTime };
  }
  return null;
}

function manualBounds(manual) {
  if (!manual || typeof manual !== "object") return { bounds: null, missing: [] };
  const high = finiteNumber(manual.high);
  const low = finiteNumber(manual.low);
  const highSourceTime = finiteNumber(manual.highSourceTime);
  const lowSourceTime = finiteNumber(manual.lowSourceTime);
  const missing = [];
  if (high != null && highSourceTime == null) missing.push("manual high source timestamp");
  if (low != null && lowSourceTime == null) missing.push("manual low source timestamp");
  if (high == null || low == null || highSourceTime == null || lowSourceTime == null) {
    return { bounds: null, missing };
  }
  return {
    bounds: { high, low, highSourceTime, lowSourceTime, provenance: "Manual" },
    missing,
  };
}

function levelFromTrade(trade, role) {
  if (!trade) return null;
  if (role === "entry") return { price: trade.entry, provenance: trade.entryProvenance, sourceTime: trade.entryTime };
  if (role === "stop") return { price: trade.stop, provenance: trade.stopProvenance, sourceTime: trade.entryTime };
  return {
    price: trade.target,
    provenance: `prior confirmed swing ${trade.targetProvenance?.kind || "close"}`,
    sourceTime: trade.targetProvenance?.sourceTime ?? null,
    confirmTime: trade.targetProvenance?.confirmTime ?? null,
  };
}

// Proposed starting rules. Recorded trade rows passed in are returned unchanged.
export function structureDisplay(input = {}) {
  const timeframe = input.timeframe === "1d" ? "1d" : "4h";
  const defaults = msDefaults(timeframe);
  const settings = {
    left: positiveInt(configuredOption(input, "left", defaults.left), defaults.left),
    right: positiveInt(configuredOption(input, "right", defaults.right), defaults.right),
    retestWindow: positiveInt(configuredOption(input, "retestWindow", defaults.retestWindow), defaults.retestWindow),
  };
  const walked = walkMarketStructure(input.candles || [], { ...settings, timeframe, tickSize: input.tickSize });
  let bounds = walked.bounds;
  let provenance = bounds ? "configured" : null;
  const missing = [...walked.missing];
  if (!bounds) {
    const manual = manualBounds(input.manual);
    for (const item of manual.missing) {
      if (!missing.includes(item)) missing.push(item);
    }
    if (manual.bounds) {
      bounds = manual.bounds;
      provenance = "Manual";
    }
  }
  const trade = walked.trade;
  const last = walked.events.at(-1) || null;
  return {
    timeframe,
    settings,
    usingDefaults: settings.left === defaults.left && settings.right === defaults.right && settings.retestWindow === defaults.retestWindow,
    status: walked.status,
    summary: walked.summary,
    progressText: walked.progressText,
    missing,
    bounds,
    provenance,
    break: presentBreak(last),
    scenario: scenarioPath(last, input.illustrativeTarget),
    entry: tradeValue(input.entry) || levelFromTrade(trade, "entry"),
    stop: tradeValue(input.stop) || levelFromTrade(trade, "stop"),
    target: tradeValue(input.target) || levelFromTrade(trade, "target"),
    trade,
    trades: walked.trades,
    events: walked.events,
    swings: walked.swings,
    tickSize: walked.tickSize,
    tickStatus: walked.tickSize ? "ready" : "missing",
    rules: {
      source: STRUCTURE_SOURCE_RULE,
      entry: MS_ENTRY_RULE,
      stop: MS_STOP_RULE,
      target: MS_TARGET_RULE,
    },
    recordedTrades: Object.prototype.hasOwnProperty.call(input, "recordedTrades") ? input.recordedTrades : null,
  };
}

function markerNote(model) {
  if (model.trade) return CLOSE_EXIT_LABEL;
  if (model.status === "missing-target") return MISSING_TARGET_LABEL;
  if (model.status === "missing-tick") return MISSING_TICK_LABEL;
  if (model.status === "expired") return "Retest window expired";
  if (model.status === "cancelled") return "Retest cancelled";
  if (model.status === "invalid-geometry") return "Retest confirmed — stop, entry, and target are not in order";
  return "Watching for retest is not an executed entry.";
}

export function structureOverlaySpec(model) {
  if (!model?.visible) {
    return { show: false, rays: [], labels: [], marker: null, scenario: null, notice: null, shadeFrom: null, shade: null };
  }
  const notice = null;
  const rays = [];
  const active = structureRays(model.bounds);
  if (active) {
    const manual = model.provenance === "Manual" ? " · Manual" : "";
    if (active.highFrom != null) rays.push({ role: "high", price: active.high, from: active.highFrom, label: `MS high${manual}` });
    if (active.lowFrom != null) rays.push({ role: "low", price: active.low, from: active.lowFrom, label: `MS low${manual}` });
  }
  const breached = model.break?.breached;
  if (breached && finiteNumber(breached.high) != null && finiteNumber(breached.low) != null) {
    const highFrom = finiteNumber(breached.highSourceTime);
    const lowFrom = finiteNumber(breached.lowSourceTime);
    const sameHigh = active && breached.high === active.high && highFrom === active.highFrom;
    const sameLow = active && breached.low === active.low && lowFrom === active.lowFrom;
    if (!sameHigh && highFrom != null) rays.push({ role: "breached-high", price: Number(breached.high), from: highFrom, label: "Breached high" });
    if (!sameLow && lowFrom != null) rays.push({ role: "breached-low", price: Number(breached.low), from: lowFrom, label: "Breached low" });
  }
  const labels = [];
  for (const [role, title] of [["entry", "Entry"], ["target", "Target"], ["stop", "Stop"]]) {
    const value = model[role];
    if (!value || finiteNumber(value.price) == null) continue;
    labels.push({ role, price: Number(value.price), text: `${title} · ${value.provenance || "configured"}` });
  }
  const marker = model.break?.title
    ? {
      time: model.break.confirmingOpenTime ?? null,
      price: finiteNumber(model.break.close),
      title: model.break.title,
      direction: model.break.bias || "",
      note: markerNote(model),
    }
    : null;
  const scenario = model.scenario?.illustrative && finiteNumber(model.scenario.toPrice) != null
    ? {
      fromPrice: finiteNumber(model.scenario.fromPrice),
      toPrice: Number(model.scenario.toPrice),
      label: model.scenario.label,
    }
    : null;
  const shadeBounds = model.bounds || model.break?.breached || null;
  const shadeFrom = shadeStart(shadeBounds);
  const shade = shadeBounds && shadeFrom != null && finiteNumber(shadeBounds.high) != null && finiteNumber(shadeBounds.low) != null
    ? { from: shadeFrom, high: Number(shadeBounds.high), low: Number(shadeBounds.low) }
    : null;
  return {
    show: true,
    rays,
    labels,
    marker,
    scenario,
    notice,
    shadeFrom,
    shade,
  };
}

export function rangeObservation(close, bounds) {
  const price = Number(close);
  const high = Number(bounds?.high);
  const low = Number(bounds?.low);
  if (!Number.isFinite(price) || !Number.isFinite(high) || !Number.isFinite(low)) return null;
  if (price < high && price > low) {
    return {
      text: "Back inside the prior range",
      note: "Observation only. This is not a failed-break rule.",
    };
  }
  return null;
}
