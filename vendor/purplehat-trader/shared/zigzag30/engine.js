// 30-minute zigzag engine. Version 2026-11-25-C-immediate-stackD3.
// Display-only. It does not notify, and it does not touch 4H or Daily trades.

export const ENGINE_VERSION = "2026-11-25-C-immediate-stackD3";

const THIRTY_MIN = 30 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const SAST_OFFSET = 2 * 60 * 60 * 1000;

export function populationStdev(values) {
  const window = values.map(Number);
  if (!window.length) return 0;
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
  return Math.sqrt(variance);
}

export function bollingerWindow(closes, period = 20, mult = 2) {
  return closes.map((_, index) => {
    if (index < period - 1) return null;
    const window = closes.slice(index - period + 1, index + 1).map(Number);
    const middle = window.reduce((sum, value) => sum + value, 0) / period;
    const deviation = populationStdev(window) * mult;
    return { middle, upper: middle + deviation, lower: middle - deviation };
  });
}

function rsiFromAverages(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function wilderRsi(closes, period = 14) {
  const result = closes.map(() => null);
  if (closes.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = Number(closes[index]) - Number(closes[index - 1]);
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  result[period] = rsiFromAverages(avgGain, avgLoss);
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = Number(closes[index]) - Number(closes[index - 1]);
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    result[index] = rsiFromAverages(avgGain, avgLoss);
  }
  return result;
}

export function sma(values, period = 14) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
    return window.reduce((sum, value) => sum + Number(value), 0) / period;
  });
}

export function candleColour(candle) {
  return Number(candle.close) >= Number(candle.open) ? "green" : "red";
}

export function sastParts(ms) {
  const shifted = new Date(Number(ms) + SAST_OFFSET);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export { formatSastClock, formatSastStamp, formatWhen } from "../time.js";

export function tradeId(closeBoundaryMs, side) {
  const part = sastParts(closeBoundaryMs);
  const month = String(part.month).padStart(2, "0");
  const day = String(part.day).padStart(2, "0");
  const hour = String(part.hour).padStart(2, "0");
  const minute = String(part.minute).padStart(2, "0");
  return `${part.year}-${month}-${day}T${hour}:${minute}-${side}`;
}

export function formatPrice(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatR(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const text = `${number >= 0 ? "+" : ""}${number.toFixed(digits)}R`;
  return text;
}

export function rMultiple(side, entry, initialStop, price) {
  const risk = side === "long" ? entry - initialStop : initialStop - entry;
  if (!(risk > 0)) return 0;
  return side === "long" ? (price - entry) / risk : (entry - price) / risk;
}

export function closedOnly(candles, now = Date.now()) {
  return (candles || []).filter((candle) => Number(candle.closeTime) < now);
}

export function detectTouch(candle, band) {
  if (!band) return null;
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const top = high >= band.upper;
  const bottom = low <= band.lower;
  if (top && bottom) {
    const toUpper = Math.abs(close - band.upper);
    const toLower = Math.abs(close - band.lower);
    if (toUpper < toLower) return { band: "top", side: "short" };
    if (toLower < toUpper) return { band: "bottom", side: "long" };
    return close >= band.middle ? { band: "top", side: "short" } : { band: "bottom", side: "long" };
  }
  if (top) return { band: "top", side: "short" };
  if (bottom) return { band: "bottom", side: "long" };
  if (low <= band.middle && band.middle <= high) return { band: "middle", side: null };
  return null;
}

export function touchSide(touch, structure, previousClose, middle) {
  if (!touch) return null;
  if (touch.band === "top") return "short";
  if (touch.band === "bottom") return "long";
  if (structure === "bull") return "long";
  if (structure === "bear") return "short";
  return Number(previousClose) > Number(middle) ? "long" : "short";
}

function pivotHighAt(candles, pivot, depth) {
  if (pivot < depth) return false;
  const confirm = pivot + depth;
  if (confirm >= candles.length) return false;
  const high = Number(candles[pivot].high);
  for (let index = pivot + 1; index <= confirm; index += 1) {
    if (Number(candles[index].high) > high) return false;
  }
  for (let index = pivot - depth; index < pivot; index += 1) {
    if (Number(candles[index].high) >= high) return false;
  }
  return true;
}

function pivotLowAt(candles, pivot, depth) {
  if (pivot < depth) return false;
  const confirm = pivot + depth;
  if (confirm >= candles.length) return false;
  const low = Number(candles[pivot].low);
  for (let index = pivot + 1; index <= confirm; index += 1) {
    if (Number(candles[index].low) < low) return false;
  }
  for (let index = pivot - depth; index < pivot; index += 1) {
    if (Number(candles[index].low) <= low) return false;
  }
  return true;
}

function blankZigzag() {
  return {
    points: [],
    state: null,
    lastHigh: null,
    lastLow: null,
    lastFlip: null,
  };
}

function applyPivot(zigzag, pivot) {
  const last = zigzag.points.at(-1) || null;
  if (!last) {
    zigzag.points.push(pivot);
    if (pivot.type === "high") zigzag.lastHigh = pivot.price;
    else zigzag.lastLow = pivot.price;
    return;
  }
  if (last.type === pivot.type) {
    const more = pivot.type === "high" ? pivot.price > last.price : pivot.price < last.price;
    if (!more) return;
    last.price = pivot.price;
    last.index = pivot.index;
    last.openTime = pivot.openTime;
    if (pivot.type === "high") {
      zigzag.lastHigh = pivot.price;
      zigzag.state = "bull";
      zigzag.lastFlip = { time: pivot.openTime, close: pivot.price, reason: "higher high" };
    } else {
      zigzag.lastLow = pivot.price;
      zigzag.state = "bear";
      zigzag.lastFlip = { time: pivot.openTime, close: pivot.price, reason: "lower low" };
    }
    return;
  }
  const distance = Math.abs(pivot.price - last.price) / Math.abs(last.price);
  if (distance < 0.02) return;
  const previousHigh = zigzag.lastHigh;
  const previousLow = zigzag.lastLow;
  zigzag.points.push(pivot);
  if (pivot.type === "high") {
    zigzag.lastHigh = pivot.price;
    if (previousHigh == null || pivot.price > previousHigh) {
      zigzag.state = "bull";
      zigzag.lastFlip = { time: pivot.openTime, close: pivot.price, reason: "higher high" };
    }
  } else {
    zigzag.lastLow = pivot.price;
    if (previousLow == null || pivot.price < previousLow) {
      zigzag.state = "bear";
      zigzag.lastFlip = { time: pivot.openTime, close: pivot.price, reason: "lower low" };
    }
  }
}

function flipOnClose(zigzag, candle) {
  const close = Number(candle.close);
  if (zigzag.lastLow != null && close < zigzag.lastLow) {
    zigzag.state = "bear";
    zigzag.lastFlip = { time: Number(candle.openTime) + THIRTY_MIN, close, reason: "close below zigzag low" };
    return;
  }
  if (zigzag.lastHigh != null && close > zigzag.lastHigh) {
    zigzag.state = "bull";
    zigzag.lastFlip = { time: Number(candle.openTime) + THIRTY_MIN, close, reason: "close above zigzag high" };
  }
}

function updateStructure(zigzag, candles, index, depth) {
  const pivotIndex = index - depth;
  if (pivotIndex < depth) return;
  const candle = candles[pivotIndex];
  if (pivotHighAt(candles, pivotIndex, depth)) {
    applyPivot(zigzag, {
      type: "high",
      price: Number(candle.high),
      index: pivotIndex,
      openTime: Number(candle.openTime),
    });
  }
  if (pivotLowAt(candles, pivotIndex, depth)) {
    applyPivot(zigzag, {
      type: "low",
      price: Number(candle.low),
      index: pivotIndex,
      openTime: Number(candle.openTime),
    });
  }
  flipOnClose(zigzag, candles[index]);
}

function inProfit(trade, price) {
  return trade.side === "long" ? price > trade.entry : price < trade.entry;
}

function neededColour(side) {
  return side === "long" ? "green" : "red";
}

function bandLabel(band) {
  if (band === "top") return "Top";
  if (band === "bottom") return "Bottom";
  return "Middle";
}

export function armedText(setup) {
  if (!setup) return "none";
  const colour = neededColour(setup.side);
  return `${bandLabel(setup.band)} → ${setup.side} · ${setup.count}/2 ${colour}`;
}

function eventLabel(coinId, side, kind, stackN) {
  const name = String(coinId || "COIN").toUpperCase();
  const dir = side === "long" ? "LONG" : "SHORT";
  if (kind === "add") return `${name} 30m ${dir} ADD #${stackN}`;
  if (kind === "partial") return `${name} 30m ${dir} PARTIAL #${stackN}`;
  if (kind === "close") return `${name} 30m ${dir} CLOSE`;
  return `${name} 30m ${dir}`;
}

function makeTrade(coinId, side, band, entry, upper, lower, openTime, stackN) {
  const stop = side === "long"
    ? entry - (upper - entry) / 2
    : entry + (entry - lower) / 2;
  const closeBoundary = openTime + THIRTY_MIN;
  return {
    id: tradeId(closeBoundary, side),
    coinId,
    side,
    band,
    entry,
    stop,
    initialStop: stop,
    stackN,
    remaining: 1,
    bankedR: 0,
    partials: [],
    openTime,
    entryTime: closeBoundary,
    label: eventLabel(coinId, side, stackN > 1 ? "add" : "entry", stackN),
  };
}

function skipReasons(side, structure, entry, band, stop) {
  const reasons = [];
  const aligned = (side === "long" && structure === "bull") || (side === "short" && structure === "bear");
  if (!aligned) reasons.push("against zigzag structure");
  const room = side === "long" ? entry < band.upper : entry > band.lower;
  if (!room) reasons.push("no room");
  const distance = Math.abs(entry - stop) / Math.abs(entry);
  if (!(distance >= 0.005)) reasons.push("stop too tight");
  return reasons;
}

function stackBlock(openTrades, side, price) {
  const same = openTrades.filter((trade) => trade.side === side);
  if (!same.length) return null;
  if (same.length >= 3) return "stack: max 3";
  if (!same.every((trade) => inProfit(trade, price))) return "stack: first trade not in profit";
  return null;
}

function manageTrade(trade, candle, band, rsi, rsiMa) {
  const events = [];
  const low = Number(candle.low);
  const high = Number(candle.high);
  const close = Number(candle.close);
  const openTime = Number(candle.openTime);
  const stopped = trade.side === "long" ? low <= trade.stop : high >= trade.stop;
  if (stopped) {
    const exitPrice = trade.stop;
    const totalR = trade.bankedR + trade.remaining * rMultiple(trade.side, trade.entry, trade.initialStop, exitPrice);
    const breakeven = trade.stop === trade.entry;
    events.push({
      kind: "close",
      reason: breakeven ? "breakeven" : "stop",
      price: exitPrice,
      totalR,
      partialCount: trade.partials.length,
      openTime,
      time: openTime + THIRTY_MIN,
      heldMs: openTime + THIRTY_MIN - trade.entryTime,
      side: trade.side,
      label: eventLabel(trade.coinId, trade.side, "close"),
      tradeId: trade.id,
    });
    return { trade: null, events };
  }
  const opposite = trade.side === "long" ? high >= band.upper : low <= band.lower;
  if (opposite) {
    const bandPrice = trade.side === "long" ? band.upper : band.lower;
    const size = trade.remaining * 0.3;
    const partialR = rMultiple(trade.side, trade.entry, trade.initialStop, bandPrice);
    trade.bankedR += size * partialR;
    trade.remaining *= 0.7;
    const partialN = trade.partials.length + 1;
    trade.partials.push({ n: partialN, openTime, price: bandPrice, r: partialR, size });
    events.push({
      kind: "partial",
      reason: `PARTIAL #${partialN}`,
      n: partialN,
      price: bandPrice,
      r: partialR,
      size,
      openTime,
      time: openTime + THIRTY_MIN,
      side: trade.side,
      label: eventLabel(trade.coinId, trade.side, "partial", partialN),
      tradeId: trade.id,
      remaining: trade.remaining,
    });
  }
  const restReady = trade.partials.length >= 1 && rsi != null && rsiMa != null;
  const rest = restReady && (
    trade.side === "long"
      ? close < band.middle && rsi < rsiMa
      : close > band.middle && rsi > rsiMa
  );
  if (rest) {
    const totalR = trade.bankedR + trade.remaining * rMultiple(trade.side, trade.entry, trade.initialStop, close);
    events.push({
      kind: "close",
      reason: "mid+RSI",
      price: close,
      totalR,
      partialCount: trade.partials.length,
      openTime,
      time: openTime + THIRTY_MIN,
      heldMs: openTime + THIRTY_MIN - trade.entryTime,
      side: trade.side,
      label: eventLabel(trade.coinId, trade.side, "close"),
      tradeId: trade.id,
    });
    return { trade: null, events };
  }
  return { trade, events };
}

function freshBook(coinId) {
  return {
    coinId,
    zigzag: blankZigzag(),
    armed: null,
    open: [],
    closed: [],
    log: [],
    lastProcessedOpenTime: null,
  };
}

function pushLog(book, row) {
  book.log.push(row);
}

function tryEntry(book, candle, band, side, touchBand) {
  const entry = Number(candle.close);
  const openTime = Number(candle.openTime);
  const same = book.open.filter((trade) => trade.side === side);
  const draft = makeTrade(book.coinId, side, touchBand, entry, band.upper, band.lower, openTime, same.length + 1);
  const reasons = skipReasons(side, book.zigzag.state, entry, band, draft.stop);
  if (reasons.length) {
    pushLog(book, {
      kind: "skip",
      reason: reasons[0],
      reasons,
      side,
      openTime,
      time: openTime + THIRTY_MIN,
      price: entry,
      label: eventLabel(book.coinId, side, "entry"),
    });
    return;
  }
  const blocked = stackBlock(book.open, side, entry);
  if (blocked) {
    pushLog(book, {
      kind: "skip",
      reason: blocked,
      side,
      openTime,
      time: openTime + THIRTY_MIN,
      price: entry,
      label: eventLabel(book.coinId, side, "entry"),
    });
    return;
  }
  if (same.length) {
    for (const trade of same) trade.stop = trade.entry;
  }
  book.open.push(draft);
  pushLog(book, {
    kind: same.length ? "add" : "entry",
    side,
    openTime,
    time: openTime + THIRTY_MIN,
    price: entry,
    stop: draft.stop,
    stackN: draft.stackN,
    tradeId: draft.id,
    band: touchBand,
    label: draft.label,
  });
}

function onBar(book, candle, band, rsi, rsiMa, structureOnly) {
  if (!band) return;
  const colour = candleColour(candle);
  if (!structureOnly && book.armed) {
    if (colour === neededColour(book.armed.side)) book.armed.count += 1;
    else book.armed.count = 0;
    if (book.armed.count >= 2) {
      const armed = book.armed;
      book.armed = null;
      tryEntry(book, candle, band, armed.side, armed.band);
    }
  }
  const touch = detectTouch(candle, band);
  if (!touch) return;
  const previousClose = book.previousClose;
  const side = touchSide(touch, book.zigzag.state, previousClose, band.middle);
  if (!structureOnly) {
    if (!book.armed) {
      book.armed = { band: touch.band, side, count: 0 };
    } else if (book.armed.band !== touch.band) {
      book.armed = { band: touch.band, side, count: 0 };
    }
  }
}

export function attachIndicators(candles) {
  const closes = candles.map((candle) => Number(candle.close));
  const bands = bollingerWindow(closes);
  const rsi = wilderRsi(closes);
  const rsiMa = sma(rsi, 14);
  return candles.map((candle, index) => ({
    ...candle,
    band: bands[index],
    rsi: rsi[index],
    rsiMa: rsiMa[index],
  }));
}

export function createBook(coinId = "COIN", structure = null) {
  const book = freshBook(coinId);
  book.zigzag.state = structure;
  return book;
}

// One closed bar of trade management and setup logic. Zigzag pivots are left as they are.
export function stepTrading(book, candle, band, rsi = null, rsiMa = null) {
  if (!band) return book;
  const survivors = [];
  for (const trade of book.open) {
    if (trade.openTime === Number(candle.openTime)) {
      survivors.push(trade);
      continue;
    }
    const managed = manageTrade(trade, candle, band, rsi, rsiMa);
    for (const event of managed.events) pushLog(book, event);
    if (managed.trade) survivors.push(managed.trade);
    else book.closed.push({ ...trade, closed: true });
  }
  book.open = survivors;
  onBar(book, candle, band, rsi, rsiMa, false);
  book.previousClose = Number(candle.close);
  book.lastProcessedOpenTime = Number(candle.openTime);
  return book;
}

export function replay(candles, options = {}) {
  const depth = options.depth ?? 10;
  const startIndex = options.startIndex ?? 150;
  const coinId = options.coinId ?? "COIN";
  const rows = candles.map((candle) => ({ ...candle }));
  const book = freshBook(coinId);
  for (let index = 0; index < rows.length; index += 1) {
    updateStructure(book.zigzag, rows, index, depth);
    const enriched = options.indicators?.[index];
    const band = enriched ? enriched.band : null;
    const rsi = enriched ? enriched.rsi : null;
    const rsiMa = enriched ? enriched.rsiMa : null;
    const trading = index >= startIndex;
    if (trading && band) {
      const survivors = [];
      for (const trade of book.open) {
        if (trade.openTime === Number(rows[index].openTime)) {
          survivors.push(trade);
          continue;
        }
        const managed = manageTrade(trade, rows[index], band, rsi, rsiMa);
        for (const event of managed.events) pushLog(book, event);
        if (managed.trade) survivors.push(managed.trade);
        else book.closed.push({ ...trade, closed: true });
      }
      book.open = survivors;
      onBar(book, rows[index], band, rsi, rsiMa, false);
    }
    book.previousClose = Number(rows[index].close);
    book.lastProcessedOpenTime = Number(rows[index].openTime);
  }
  return book;
}

export function runEngine(candles, options = {}) {
  const now = options.now ?? Date.now();
  const closed = options.assumeClosed ? candles : closedOnly(candles, now);
  const window = options.window == null ? closed : closed.slice(-options.window);
  const indicators = attachIndicators(window);
  const book = replay(window, { ...options, indicators });
  book.indicators = indicators;
  book.context = contextBias(window);
  book.version = ENGINE_VERSION;
  return book;
}

function aggregate(candles) {
  if (!candles.length) return null;
  return {
    open: Number(candles[0].open),
    high: Math.max(...candles.map((candle) => Number(candle.high))),
    low: Math.min(...candles.map((candle) => Number(candle.low))),
    close: Number(candles.at(-1).close),
    openTime: Number(candles[0].openTime),
  };
}

export function contextBias(candles) {
  const last = candles.at(-1);
  if (!last) return { daily: null, today: null, h4: null, score: null, lean: null };
  const lastOpen = Number(last.openTime);
  const todayOpen = Math.floor(lastOpen / DAY) * DAY;
  const yesterday = aggregate(candles.filter((candle) => {
    const open = Number(candle.openTime);
    return open >= todayOpen - DAY && open < todayOpen;
  }));
  const todayCandles = candles.filter((candle) => Number(candle.openTime) >= todayOpen);
  const todayBar = aggregate(todayCandles);
  let today = null;
  let todayScore = 0;
  if (yesterday && todayBar) {
    if (todayBar.close > yesterday.high) {
      today = "Above";
      todayScore = 2;
    } else if (todayBar.close < yesterday.low) {
      today = "Below";
      todayScore = -2;
    } else {
      today = "Inside";
      todayScore = todayBar.open >= yesterday.close ? 1 : -1;
    }
  }
  const blockOpen = Math.floor(lastOpen / FOUR_HOURS) * FOUR_HOURS;
  const lastClose = lastOpen + THIRTY_MIN;
  const closedBlock = lastClose >= blockOpen + FOUR_HOURS ? blockOpen : blockOpen - FOUR_HOURS;
  const h4bar = aggregate(candles.filter((candle) => {
    const open = Number(candle.openTime);
    return open >= closedBlock && open < closedBlock + FOUR_HOURS;
  }));
  const daily = yesterday ? (yesterday.close >= yesterday.open ? "Bull" : "Bear") : null;
  const h4 = h4bar ? (h4bar.close >= h4bar.open ? "Bull" : "Bear") : null;
  const dailyScore = daily === "Bull" ? 1 : daily === "Bear" ? -1 : 0;
  const h4Score = h4 === "Bull" ? 1 : h4 === "Bear" ? -1 : 0;
  return {
    daily,
    today,
    h4,
    score: daily || today || h4 ? dailyScore + todayScore + h4Score : null,
    yesterday,
  };
}

export function leanLabel(state) {
  if (state === "bull") return "Bullish";
  if (state === "bear") return "Bearish";
  return "—";
}

export function latestTrigger(book) {
  const row = [...(book.log || [])].reverse().find((item) => item.kind === "entry" || item.kind === "add" || item.kind === "partial" || item.kind === "close");
  return row || null;
}

export function countLast24h(log, asOfMs) {
  const start = asOfMs - DAY;
  const rows = (log || []).filter((row) => row.time > start && row.time <= asOfMs);
  return {
    entries: rows.filter((row) => row.kind === "entry" || row.kind === "add").length,
    partials: rows.filter((row) => row.kind === "partial").length,
    closes: rows.filter((row) => row.kind === "close").length,
  };
}
