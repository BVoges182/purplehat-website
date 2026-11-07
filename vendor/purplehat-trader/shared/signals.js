import { bollinger, closedCandles, rsi } from "./indicators.js";
import { envDefaults } from "./settings.js";
import { signalAppearance } from "./theme.js";
import { formatSast } from "./time.js";

function trimNum(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(number);
}

function label(timeframe) {
  return timeframe === "1d" ? "Daily" : "4H";
}

export function signalId({ symbol, timeframe, side, family, barOpenTime }) {
  return `${symbol}|${timeframe}|${side}|${family}|${barOpenTime}`;
}

function analyzed(candles, settings, now) {
  const closed = closedCandles(candles || [], now);
  const closes = closed.map((candle) => candle.close);
  const bands = bollinger(closes, settings.bbPeriod, settings.bbStd);
  const momentum = rsi(closes, settings.rsiPeriod);
  return closed.map((candle, index) => ({
    ...candle,
    open: Number(candle.open),
    low: Number(candle.low),
    high: Number(candle.high),
    close: Number(candle.close),
    band: bands[index],
    rsi: momentum[index],
  }));
}

function numSetting(settings, key, fallback) {
  const value = settings?.[key];
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rejectionConfig(settings) {
  return {
    touchPercent: numSetting(settings, "bandTouchPercent", 0.1),
    sellZone: numSetting(settings, "rsiSellZone", 65),
    buyZone: numSetting(settings, "rsiBuyZone", 35),
    lookback: numSetting(settings, "rsiPivotLookback", 3),
    oversold: numSetting(settings, "rsiOversold", 30),
    overbought: numSetting(settings, "rsiOverbought", 70),
  };
}

function localRsiExtreme(rows, index, lookback, direction) {
  const value = rows[index]?.rsi;
  if (value == null || !Number.isInteger(lookback) || lookback < 1 || index < lookback) return false;
  for (let cursor = index - lookback; cursor < index; cursor += 1) {
    const other = rows[cursor]?.rsi;
    if (other == null) return false;
    if (direction === "high" ? other >= value : other <= value) return false;
  }
  return true;
}

export function bandCloseSides(row) {
  const upper = row?.band?.upper;
  const lower = row?.band?.lower;
  const close = Number(row?.close);
  if (!Number.isFinite(close) || upper == null || lower == null) return [];
  const sides = [];
  if (close >= upper) sides.push("SELL");
  if (close <= lower) sides.push("BUY");
  return sides;
}

function bandReason(side, timeframe) {
  const place = side === "SELL" ? "top" : "bottom";
  return `${side} entry: price at ${place} of ${label(timeframe)} Bollinger Band`;
}

export function rsiCrossSide(rows, index, settings = {}) {
  const value = rows[index]?.rsi;
  if (value == null) return null;
  const overbought = numSetting(settings, "rsiOverbought", 70);
  const oversold = numSetting(settings, "rsiOversold", 30);
  const previous = index > 0 ? rows[index - 1]?.rsi : null;
  const enteredOverbought = value >= overbought && !(previous != null && previous >= overbought);
  const enteredOversold = value <= oversold && !(previous != null && previous <= oversold);
  if (enteredOverbought) return "SELL";
  if (enteredOversold) return "BUY";
  return null;
}

function rsiReason(side, timeframe, settings) {
  const level = side === "SELL" ? numSetting(settings, "rsiOverbought", 70) : numSetting(settings, "rsiOversold", 30);
  const word = side === "SELL" ? "above" : "below";
  return `${side} entry: ${label(timeframe)} RSI ${word} ${trimNum(level)}`;
}

function rejectionOnBar(rows, index, settings, meta, now) {
  const row = rows[index];
  const upper = row?.band?.upper;
  const lower = row?.band?.lower;
  if (row?.rsi == null || upper == null || lower == null) return null;
  const { open, high, low, close } = row;
  if (![open, high, low, close].every(Number.isFinite)) return null;
  const config = rejectionConfig(settings);
  const tolerance = Math.abs(close) * (config.touchPercent / 100);
  const taggedUpper = high >= upper - tolerance;
  // Close back inside, or the low traded back through the band while the close
  // is still slightly above it (21 Oct 2026 18:00 SAST BTC 4H).
  const upperBackInside = close < upper || low <= upper;
  const taggedLower = low <= lower + tolerance;
  const lowerBackInside = close > lower || high >= lower;
  const sell = taggedUpper && close < open && upperBackInside
    && (row.rsi >= config.sellZone || localRsiExtreme(rows, index, config.lookback, "high"));
  const buy = taggedLower && close > open && lowerBackInside
    && (row.rsi <= config.buyZone || localRsiExtreme(rows, index, config.lookback, "low"));
  if (!sell && !buy) return null;
  const side = sell ? "SELL" : "BUY";
  const extreme = sell ? row.rsi >= config.overbought : row.rsi <= config.oversold;
  const bandName = sell ? "upper band rejection" : "lower band rejection";
  const extremeText = extreme ? " and RSI extreme" : "";
  return {
    ...makeSignal({
      symbol: meta.symbol,
      coinId: meta.coinId || null,
      timeframe: meta.timeframe,
      side,
      family: "rejection",
      reason: `${side}: ${label(meta.timeframe)} ${bandName}${extremeText}, RSI ${Math.round(row.rsi)}`,
      barOpenTime: row.openTime,
    }, now),
    weight: extreme ? 2 : 1,
  };
}

function makeSignal(fields, now) {
  return {
    ...fields,
    id: signalId(fields),
    createdAt: now,
  };
}

function formatDivergencePrice(value) {
  const number = Number(value);
  const digits = Number.isInteger(number) ? 0 : 2;
  return number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDivergenceRsi(value) {
  return Number(value).toFixed(2);
}

export function divergenceReason(side, timeframe, close, rsiEarlier, rsiLater) {
  const name = side === "SELL" ? "Bear div" : "Bull div";
  return `${side}: ${label(timeframe)} ${name} ${formatDivergencePrice(close)} (RSI ${formatDivergenceRsi(rsiEarlier)} to ${formatDivergenceRsi(rsiLater)})`;
}

export const BULL_DIV_LABEL = "Bull div";
export const TRIPLE_BULL_DIV_LABEL = "Triple bull div — strong signal";

export function bullishChainLabel(size) {
  return size >= 3 ? TRIPLE_BULL_DIV_LABEL : BULL_DIV_LABEL;
}

export const BEAR_DIV_LABEL = "Bear div";
export const TRIPLE_BEAR_DIV_LABEL = "Triple bear div — strong signal";

export function bearishChainLabel(size) {
  return size >= 3 ? TRIPLE_BEAR_DIV_LABEL : BEAR_DIV_LABEL;
}

// Bullish only. A buildup is a run of closed candles whose RSI stays below 50.
// RSI at 50 or above resets it: nothing before that candle pairs with anything after it.
// The anchor is the running lowest close. A later close that is lower, with a higher
// RSI, extends the chain. A later close that is lower without a higher RSI draws
// nothing and becomes the new anchor. A bounce in between does not break the chain.
function bullishChains(rows) {
  const chains = [];
  let buildup = [];
  const flush = () => {
    if (buildup.length) chains.push(...chainsFromBuildup(rows, buildup));
    buildup = [];
  };
  for (let index = 0; index < rows.length; index += 1) {
    const rsi = Number(rows[index].rsi);
    const close = Number(rows[index].close);
    if (!Number.isFinite(rsi) || !Number.isFinite(close) || rsi >= 50) {
      flush();
      continue;
    }
    buildup.push(index);
  }
  flush();
  return chains;
}

function chainsFromBuildup(rows, indices) {
  const chains = [];
  let points = [indices[0]];
  for (let cursor = 1; cursor < indices.length; cursor += 1) {
    const index = indices[cursor];
    const previous = points[points.length - 1];
    const close = Number(rows[index].close);
    const previousClose = Number(rows[previous].close);
    const rsi = Number(rows[index].rsi);
    const previousRsi = Number(rows[previous].rsi);
    if (close < previousClose && rsi > previousRsi) {
      points.push(index);
      continue;
    }
    if (close < previousClose) {
      if (points.length >= 2) chains.push(points);
      points = [index];
    }
  }
  if (points.length >= 2) chains.push(points);
  return chains;
}

// Bearish mirror. A buildup is a run of closed candles whose RSI stays above 50.
// RSI at 50 or below resets it. The anchor is the running highest close. A later
// close that is higher, with a lower RSI, extends the chain. A later close that is
// higher without a lower RSI draws nothing and becomes the new anchor. A dip in
// between does not break the chain.
function bearishChains(rows) {
  const chains = [];
  let buildup = [];
  const flush = () => {
    if (buildup.length) chains.push(...chainsFromBearBuildup(rows, buildup));
    buildup = [];
  };
  for (let index = 0; index < rows.length; index += 1) {
    const rsi = Number(rows[index].rsi);
    const close = Number(rows[index].close);
    if (!Number.isFinite(rsi) || !Number.isFinite(close) || rsi <= 50) {
      flush();
      continue;
    }
    buildup.push(index);
  }
  flush();
  return chains;
}

function chainsFromBearBuildup(rows, indices) {
  const chains = [];
  let points = [indices[0]];
  for (let cursor = 1; cursor < indices.length; cursor += 1) {
    const index = indices[cursor];
    const previous = points[points.length - 1];
    const close = Number(rows[index].close);
    const previousClose = Number(rows[previous].close);
    const rsi = Number(rows[index].rsi);
    const previousRsi = Number(rows[previous].rsi);
    if (close > previousClose && rsi < previousRsi) {
      points.push(index);
      continue;
    }
    if (close > previousClose) {
      if (points.length >= 2) chains.push(points);
      points = [index];
    }
  }
  if (points.length >= 2) chains.push(points);
  return chains;
}

function pairFromChain(rows, points, step, kind) {
  const earlier = points[step - 1];
  const later = points[step];
  return {
    earlier,
    later,
    kind,
    close1: Number(rows[earlier].close),
    close2: Number(rows[later].close),
    rsi1: rows[earlier].rsi,
    rsi2: rows[later].rsi,
    chainSize: points.length,
    chainPoints: points,
    latest: step === points.length - 1,
    kind,
  };
}

export function divergencePairs(rows) {
  if (!rows?.length) return [];
  const pairs = [];
  for (const points of bullishChains(rows)) {
    for (let step = 1; step < points.length; step += 1) {
      pairs.push(pairFromChain(rows, points, step, "bull"));
    }
  }
  for (const points of bearishChains(rows)) {
    for (let step = 1; step < points.length; step += 1) {
      pairs.push(pairFromChain(rows, points, step, "bear"));
    }
  }
  return pairs;
}

function pairView(rows, pair) {
  const earlier = rows[pair.earlier];
  const later = rows[pair.later];
  const side = pair.kind === "bear" ? "SELL" : "BUY";
  const pivots = [
    { openTime: earlier.openTime, close: pair.close1, rsi: pair.rsi1 },
    { openTime: later.openTime, close: pair.close2, rsi: pair.rsi2 },
  ];
  return { earlier, later, side, pivots };
}

function withScores(signals) {
  const totals = { BUY: 0, SELL: 0 };
  for (const signal of signals) totals[signal.side] += signal.weight ?? 1;
  return signals.map((signal) => {
    const { weight, ...rest } = signal;
    return { ...rest, score: totals[signal.side] };
  });
}

export function generateSignals(input) {
  if (!input?.symbol || !input.candles4h) return [];
  const settings = input.settings || envDefaults();
  const now = input.now ?? Date.now();
  const four = analyzed(input.candles4h, settings, now);
  const daily = analyzed(input.candles1d, settings, now);
  const signals = [];
  const meta = { symbol: input.symbol, coinId: input.coinId || null };
  for (const [timeframe, rows] of [["4h", four], ["1d", daily]]) {
    const latest = rows.at(-1);
    const rejection = latest
      ? rejectionOnBar(rows, rows.length - 1, settings, { ...meta, timeframe }, now)
      : null;
    if (rejection) signals.push(rejection);
    if (latest) {
      for (const side of bandCloseSides(latest)) {
        signals.push(makeSignal({
          ...meta,
          timeframe,
          side,
          family: "bb",
          reason: bandReason(side, timeframe),
          barOpenTime: latest.openTime,
        }, now));
      }
    }
    if (latest) {
      const side = rsiCrossSide(rows, rows.length - 1, settings);
      const blocked = side && rejection?.side === side;
      if (side && !blocked) {
        signals.push(makeSignal({
          ...meta,
          timeframe,
          side,
          family: "rsi",
          reason: rsiReason(side, timeframe, settings),
          barOpenTime: latest.openTime,
        }, now));
      }
    }
    const closed = divergenceRows(rows, now);
    const last = closed.length - 1;
    for (const pair of divergencePairs(closed)) {
      if (!pair.latest || pair.later !== last) continue;
      const view = pairView(closed, pair);
      signals.push(makeSignal({
        ...meta,
        timeframe,
        side: view.side,
        family: "divergence",
        reason: divergenceReason(view.side, timeframe, pair.close2, pair.rsi1, pair.rsi2),
        barOpenTime: view.later.openTime,
        pivots: chainPivots(closed, pair.chainPoints),
        weight: 1,
      }, now));
    }
  }
  return withScores(signals);
}

export function historicalBandCloses({ symbol, coinId = null, candles = [], interval = "4h", settings = envDefaults(), now = Date.now() } = {}) {
  const rows = analyzed(candles, settings, now);
  const signals = [];
  for (const row of rows) {
    for (const side of bandCloseSides(row)) {
      const signal = makeSignal({
        symbol,
        coinId,
        timeframe: interval,
        side,
        family: "bb",
        reason: bandReason(side, interval),
        barOpenTime: row.openTime,
      }, now);
      signals.push({ ...signal, score: 1 });
    }
  }
  return signals;
}

export function historicalRsiCrosses({ symbol, coinId = null, candles = [], interval = "4h", settings = envDefaults(), now = Date.now() } = {}) {
  const rows = analyzed(candles, settings, now);
  const signals = [];
  for (let index = 0; index < rows.length; index += 1) {
    const side = rsiCrossSide(rows, index, settings);
    if (!side) continue;
    const rejection = rejectionOnBar(rows, index, settings, { symbol, coinId, timeframe: interval }, now);
    if (rejection?.side === side) continue;
    const signal = makeSignal({
      symbol,
      coinId,
      timeframe: interval,
      side,
      family: "rsi",
      reason: rsiReason(side, interval, settings),
      barOpenTime: rows[index].openTime,
    }, now);
    signals.push({ ...signal, score: 1 });
  }
  return signals;
}

export function historicalBandRejections({ symbol, coinId = null, candles = [], interval = "4h", settings = envDefaults(), now = Date.now() } = {}) {
  const rows = analyzed(candles, settings, now);
  const signals = [];
  for (let index = 0; index < rows.length; index += 1) {
    const signal = rejectionOnBar(rows, index, settings, { symbol, coinId, timeframe: interval }, now);
    if (!signal) continue;
    const { weight, ...rest } = signal;
    signals.push({ ...rest, score: weight });
  }
  return signals;
}

function divergenceRows(rows, now) {
  return (rows || [])
    .filter((row) => row.closeTime == null || row.closeTime < now)
    .map((row) => ({
      ...row,
      open: Number(row.open),
      close: Number(row.close),
      low: Number(row.low),
      high: Number(row.high),
    }))
    .filter((row) => row.rsi != null && Number.isFinite(row.close));
}

function chainPivots(rows, indexes) {
  return indexes.map((index) => ({
    openTime: rows[index].openTime,
    close: Number(rows[index].close),
    rsi: rows[index].rsi,
  }));
}

function anchorReason(timeframe, row, side) {
  const name = side === "SELL" ? "Bear div" : "Bull div";
  return `${side}: ${label(timeframe)} ${name} ${formatDivergencePrice(row.close)} (RSI ${formatDivergenceRsi(row.rsi)})`;
}

function chainLabel(pair) {
  return pair.kind === "bear" ? bearishChainLabel(pair.chainSize) : bullishChainLabel(pair.chainSize);
}

function lineFromPair(pair, rows) {
  const view = pairView(rows, pair);
  return {
    kind: pair.kind,
    time1: view.earlier.openTime,
    time2: view.later.openTime,
    close1: pair.close1,
    close2: pair.close2,
    rsi1: pair.rsi1,
    rsi2: pair.rsi2,
    chainSize: pair.chainSize,
    label: pair.latest ? chainLabel(pair) : "",
    points: [
      { time: view.earlier.openTime, close: pair.close1, rsi: pair.rsi1 },
      { time: view.later.openTime, close: pair.close2, rsi: pair.rsi2 },
    ],
  };
}

export function divergenceLines(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  const usable = divergenceRows(rows, now);
  return divergencePairs(usable, settings, interval).map((pair) => lineFromPair(pair, usable));
}

export function divergencePointSignals(rows, { symbol = "", coinId = null, interval = "4h", now = Date.now() } = {}) {
  const signals = [];
  const seen = new Set();
  for (const pair of divergencePairs(rows)) {
    const pivots = chainPivots(rows, pair.chainPoints);
    const side = pair.kind === "bear" ? "SELL" : "BUY";
    for (let place = 0; place < pair.chainPoints.length; place += 1) {
      const row = rows[pair.chainPoints[place]];
      const key = `${side}|${row.openTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = place === 0 ? null : rows[pair.chainPoints[place - 1]];
      const reason = previous
        ? divergenceReason(side, interval, row.close, previous.rsi, row.rsi)
        : anchorReason(interval, row, side);
      const signal = makeSignal({
        symbol,
        coinId,
        timeframe: interval,
        side,
        family: "divergence",
        reason,
        barOpenTime: row.openTime,
        pivots,
      }, now);
      signals.push({ ...signal, score: 1, confirmOpenTime: row.openTime });
    }
  }
  return signals;
}

export function historicalDivergences({ symbol, coinId = null, candles = [], interval = "4h", settings = envDefaults(), now = Date.now() } = {}) {
  const rows = divergenceRows(analyzed(candles, settings, now), now);
  return divergencePointSignals(rows, { symbol, coinId, interval, now });
}

function chainStillActive(rows, latestIndex, kind) {
  for (let index = latestIndex + 1; index < rows.length; index += 1) {
    const rsi = Number(rows[index].rsi);
    if (!Number.isFinite(rsi)) return false;
    if (kind === "bull" ? rsi >= 50 : rsi <= 50) return false;
  }
  return true;
}

function sameDivergence(left, right) {
  return !!left && !!right && left.side === right.side && left.barOpenTime === right.barOpenTime;
}

export function divergenceBoard(rows) {
  const chains = divergencePairs(rows).filter((pair) => pair.latest).map((pair) => {
    const latestIndex = pair.later;
    const bull = pair.kind !== "bear";
    return {
      side: bull ? "BUY" : "SELL",
      kind: pair.kind,
      type: bull ? bullishChainLabel(pair.chainSize) : bearishChainLabel(pair.chainSize),
      barOpenTime: rows[latestIndex].openTime,
      close: Number(rows[latestIndex].close),
      rsiValues: pair.chainPoints.map((index) => Number(rows[index].rsi)),
      chainSize: pair.chainSize,
      score: 1,
      active: chainStillActive(rows, latestIndex, pair.kind),
    };
  });
  const byLatest = (left, right) => right.barOpenTime - left.barOpenTime;
  const active = chains.filter((chain) => chain.active).sort(byLatest)[0] || null;
  const newest = chains.slice().sort(byLatest)[0] || null;
  return {
    active,
    recent: newest && !sameDivergence(newest, active) ? newest : null,
  };
}

export function divergenceBoardForCandles({ candles = [], settings = envDefaults(), now = Date.now(), symbol = "", coinId = null, interval = "4h" } = {}) {
  const board = divergenceBoard(divergenceRows(analyzed(candles, settings, now), now));
  const stamp = (item) => (item ? { ...item, symbol, coinId, timeframe: interval } : null);
  return { active: stamp(board.active), recent: stamp(board.recent) };
}

function decorateMarker(signal, row) {
  const look = signalAppearance(signal.family, signal.side);
  const buy = signal.side === "BUY";
  const close = row ? Number(row.close) : null;
  const anchor = row ? Number(buy ? row.low : row.high) : null;
  return {
    time: Math.floor(Number(signal.barOpenTime) / 1000),
    barOpenTime: signal.barOpenTime,
    position: buy ? "belowBar" : "aboveBar",
    shape: buy ? "arrowUp" : "arrowDown",
    color: look.color,
    labelColor: look.label,
    size: look.size,
    strength: look.strength,
    text: look.short,
    fullName: look.full,
    family: signal.family,
    side: signal.side,
    close: Number.isFinite(close) ? close : null,
    rsi: row?.rsi ?? null,
    anchor: Number.isFinite(anchor) ? anchor : null,
    pivots: signal.pivots || null,
  };
}

export function layoutChartMarkers(markers) {
  const groups = new Map();
  for (const marker of markers) {
    const key = `${marker.time}|${marker.position}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(marker);
  }
  const laid = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0));
    const merged = [];
    for (const marker of sorted) {
      const last = merged.at(-1);
      if (last && last.text === marker.text && last.color === marker.color) {
        if (!last.details.includes(marker.fullName)) last.details.push(marker.fullName);
        continue;
      }
      merged.push({ ...marker, details: [marker.fullName] });
    }
    let offset = 10;
    merged.forEach((marker, stack) => {
      const size = marker.size ?? 1;
      laid.push({ ...marker, stack, offset });
      offset += 7 + size * 3 + 26;
    });
  }
  return laid.sort((left, right) => left.time - right.time || left.stack - right.stack || String(left.position).localeCompare(String(right.position)));
}

function tooltipPrice(value) {
  if (value == null || !Number.isFinite(Number(value))) return "n/a";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function markerTooltip(marker, timeframe = "4h") {
  const names = (marker.details || [marker.fullName]).join("\n");
  if (Array.isArray(marker.pivots) && marker.pivots.length) {
    const lines = marker.pivots.map((pivot) => (
      `${formatSast(pivot.openTime)} · Close ${tooltipPrice(pivot.close)} · RSI ${Number(pivot.rsi).toFixed(2)}`
    ));
    return `${names}\n${lines.join("\n")}`;
  }
  const rsi = marker.rsi == null || !Number.isFinite(Number(marker.rsi)) ? "n/a" : Number(marker.rsi).toFixed(2);
  return `${names}\n${label(timeframe)} · ${formatSast(marker.barOpenTime)}\nClose ${tooltipPrice(marker.close)} · RSI ${rsi}`;
}

export function divergenceMarkers(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const usable = divergenceRows(rows, now);
  const byTime = new Map();
  for (const pair of divergencePairs(usable, settings, interval)) {
    const pivots = chainPivots(usable, pair.chainPoints);
    const side = pair.kind === "bear" ? "SELL" : "BUY";
    for (let place = 0; place < pair.chainPoints.length; place += 1) {
      const row = usable[pair.chainPoints[place]];
      const isLatest = place === pair.chainPoints.length - 1;
      const text = isLatest ? chainLabel(pair) : "";
      const key = `${side}|${row.openTime}`;
      const existing = byTime.get(key);
      if (existing?.text) continue;
      const marker = decorateMarker({
        side,
        family: "divergence",
        barOpenTime: row.openTime,
        pivots,
      }, row);
      marker.text = text;
      if (text === TRIPLE_BULL_DIV_LABEL || text === TRIPLE_BEAR_DIV_LABEL) marker.fullName = text;
      byTime.set(key, marker);
    }
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

export function rejectionMarkers(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  const analyzedRows = analyzed(rows, settings, now);
  const byTime = new Map(analyzedRows.map((row) => [row.openTime, row]));
  return historicalBandRejections({ candles: rows, interval, settings, now }).map((signal) => (
    decorateMarker(signal, byTime.get(signal.barOpenTime))
  )).sort((left, right) => left.time - right.time);
}

export function bandCloseMarkers(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  const analyzedRows = analyzed(rows, settings, now);
  const byTime = new Map(analyzedRows.map((row) => [row.openTime, row]));
  return historicalBandCloses({ candles: rows, interval, settings, now }).map((signal) => (
    decorateMarker(signal, byTime.get(signal.barOpenTime))
  )).sort((left, right) => left.time - right.time);
}

export function rsiMarkers(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  const analyzedRows = analyzed(rows, settings, now);
  const byTime = new Map(analyzedRows.map((row) => [row.openTime, row]));
  return historicalRsiCrosses({ candles: rows, interval, settings, now }).map((signal) => (
    decorateMarker(signal, byTime.get(signal.barOpenTime))
  )).sort((left, right) => left.time - right.time);
}

export function priceMarkers(rows, settings = envDefaults(), interval = "4h", now = Date.now()) {
  return layoutChartMarkers([
    ...bandCloseMarkers(rows, settings, interval, now),
    ...rejectionMarkers(rows, settings, interval, now),
    ...rsiMarkers(rows, settings, interval, now),
    ...divergenceMarkers(rows, settings, interval, now),
  ]);
}

export { SIGNAL_FAMILIES } from "./marketStructure.js";

export function formatAlert(signal) {
  const coin = signal.coinId || String(signal.symbol || "").replace(/USDT$/, "");
  const timeframe = signal.timeframe === "1d" ? "1D" : "4H";
  return [
    `Purple Hat Trading · ${signal.side} ${coin} ${timeframe}`,
    signal.reason,
    `Bar: ${formatSast(signal.barOpenTime)} · score ${signal.score}`,
  ].join("\n");
}
