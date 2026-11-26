import { formatPrice, pricePrecision } from "../coins.js";
import { chartTime } from "../indicators.js";
import { formatSast } from "../time.js";
import {
  armedText,
  contextBias,
  countLast24h,
  formatR,
  formatSastClock,
  formatWhen,
  leanLabel,
  rMultiple,
  runEngine,
} from "./engine.js";

const THIRTY_MIN = 30 * 60 * 1000;

function decimalsFor(coin, venue) {
  return pricePrecision(coin.displayDecimals, venue?.tickSize);
}

function reasonText(reason) {
  if (reason === "stop") return "stopped";
  if (reason === "breakeven") return "breakeven";
  if (reason === "mid+RSI") return "mid+RSI exit";
  return reason || "";
}

function chipText(event) {
  const side = event.side === "long" ? "long" : "short";
  if (event.kind === "add") return `Add #${event.stackN} ${side}`;
  if (event.kind === "partial") return `Partial #${event.n} ${side}`;
  if (event.kind === "close") return `Close ${side}`;
  return `Entry ${side}`;
}

function triggerText(event) {
  const side = event.side === "long" ? "LONG" : "SHORT";
  if (event.kind === "add") return `ADD #${event.stackN} ${side}`;
  if (event.kind === "partial") return `PARTIAL #${event.n} ${side}`;
  if (event.kind === "close") return `CLOSE ${side}`;
  return `ENTRY ${side}`;
}

function eventDetail(event, decimals) {
  if (event.kind === "entry" || event.kind === "add") {
    return `@ ${formatPrice(event.price, decimals)} · SL ${formatPrice(event.stop, decimals)}`;
  }
  if (event.kind === "partial") {
    return `30% at band · ${formatPrice(event.price, decimals)} · ${formatR(event.r, 1)}`;
  }
  if (event.kind === "close") {
    return `${reasonText(event.reason)} · ${formatR(event.totalR, 1)}`;
  }
  return event.reason || "";
}

function resultFor(event, openIds) {
  if (!event) return { text: "—", reason: "" };
  if (event.kind === "close") {
    return { text: formatR(event.totalR, 1), reason: reasonText(event.reason) };
  }
  if ((event.kind === "entry" || event.kind === "add") && openIds.has(event.tradeId)) {
    return { text: "open", reason: "" };
  }
  if (event.kind === "partial") return { text: formatR(event.r, 1), reason: "" };
  return { text: formatR(event.totalR ?? event.r, 1), reason: "" };
}

function markerShape(event) {
  if (event.kind === "partial") return "partial";
  if (event.kind === "close") return "close";
  return event.side === "long" ? "entry-long" : "entry-short";
}

function seriesPoint(row) {
  return {
    time: chartTime(row.openTime),
    openTime: Number(row.openTime),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    mid: row.band?.middle ?? null,
    upper: row.band?.upper ?? null,
    lower: row.band?.lower ?? null,
    rsi: row.rsi ?? null,
    rsiMa: row.rsiMa ?? null,
  };
}

function openView(trade, lastClose, decimals, stackCount) {
  const nowR = rMultiple(trade.side, trade.entry, trade.initialStop, lastClose);
  const marked = trade.bankedR + trade.remaining * nowR;
  return {
    id: trade.id,
    side: trade.side,
    stackN: trade.stackN,
    stackCount,
    remaining: trade.remaining,
    remainingText: `${Math.round(trade.remaining * 100)}%`,
    nowR: marked,
    nowRText: formatR(marked, 2),
    entry: trade.entry,
    stop: trade.stop,
    entryText: formatPrice(trade.entry, decimals),
    stopText: formatPrice(trade.stop, decimals),
    entryTime: trade.entryTime,
    label: trade.label,
  };
}

export function presentCoin({ coin, candles, ticker, venue, now = Date.now() }) {
  const decimals = decimalsFor(coin, venue);
  const unavailable = !candles?.length || venue?.provider === "unavailable";
  if (unavailable) {
    return {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      displayDecimals: decimals,
      unavailable: true,
      message: "No 30m data",
      price: null,
      priceText: "—",
      changePercent: null,
      lean: "—",
      context: { daily: null, h4: null, today: null, score: null },
      latest: null,
      open: [],
      armedText: "none",
      footer: "No 30m data",
      mini: [],
      chart: [],
      zigzag: [],
      markers: [],
    };
  }
  const book = runEngine(candles, { coinId: coin.id, now, window: 500, startIndex: 150 });
  const rows = book.indicators || [];
  const last = rows.at(-1);
  const lastClose = Number(last?.close);
  const closeBoundary = Number(last.openTime) + THIRTY_MIN;
  const sameSide = new Map();
  for (const trade of book.open) sameSide.set(trade.side, (sameSide.get(trade.side) || 0) + 1);
  const open = book.open.map((trade) => openView(trade, lastClose, decimals, sameSide.get(trade.side) || 1));
  const openIds = new Set(book.open.map((trade) => trade.id));
  const events = (book.log || []).filter((row) => row.kind === "entry" || row.kind === "add" || row.kind === "partial" || row.kind === "close");
  const latest = events.at(-1) || null;
  const price = ticker?.lastPrice != null && ticker.lastPrice !== "" ? Number(ticker.lastPrice) : lastClose;
  const change = ticker?.changePercent != null && ticker.changePercent !== "" ? Number(ticker.changePercent) : null;
  const context = contextBias(rows);
  const lean = leanLabel(book.zigzag.state);
  const newest = open.at(-1) || null;
  const lastCloseEvent = [...events].reverse().find((row) => row.kind === "close");
  let footer = "Flat";
  if (newest) {
    footer = `${newest.side === "long" ? "Long" : "Short"} @ ${newest.entryText} · SL ${newest.stopText} · ${formatR(newest.nowR, 2)}`;
  } else {
    const lastR = lastCloseEvent ? formatR(lastCloseEvent.totalR, 1) : "—";
    const armed = (armedText(book.armed) || "none").replace(" → ", " ").replace(" · ", " ").toLowerCase();
    footer = `Flat · last ${lastR} · armed ${armed}`;
  }
  const visibleEvents = events.filter((event) => rows.some((row) => Number(row.openTime) === Number(event.openTime)));
  const labelled = visibleEvents.filter((event) => event.kind !== "partial").slice(-3);
  const labelledKeys = new Set(labelled.map((event) => `${event.kind}|${event.openTime}|${event.n || ""}`));
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    displayDecimals: decimals,
    unavailable: false,
    message: "",
    price,
    priceText: formatPrice(price, decimals),
    changePercent: Number.isFinite(change) ? change : null,
    lean,
    zigzagState: book.zigzag.state,
    context: {
      daily: context.daily,
      h4: context.h4,
      today: context.today,
      score: context.score,
    },
    latest: latest ? {
      kind: latest.kind,
      side: latest.side,
      text: triggerText(latest),
      chip: chipText(latest),
      time: latest.time,
      when: formatWhen(latest.time, closeBoundary),
      clock: formatSastClock(latest.time),
      detail: eventDetail(latest, decimals),
      result: resultFor(latest, openIds),
    } : null,
    open,
    openSummary: newest ? {
      side: newest.side === "long" ? "LONG" : "SHORT",
      text: `${newest.side === "long" ? "LONG" : "SHORT"} · ${newest.stackCount} of max 3 · ${newest.remainingText} left · now ${newest.nowRText}`,
      entryText: newest.entryText,
      stopText: newest.stopText,
    } : null,
    armedText: armedText(book.armed),
    footer,
    updatedAt: closeBoundary,
    mini: rows.slice(-48).map(seriesPoint),
    chart: rows.slice(-96).map(seriesPoint),
    history: rows.map(seriesPoint),
    zigzag: (book.zigzag.points || []).map((point) => ({
      time: chartTime(point.openTime),
      openTime: point.openTime,
      price: point.price,
      type: point.type,
    })),
    markers: visibleEvents.map((event) => ({
      time: chartTime(event.openTime),
      openTime: event.openTime,
      kind: event.kind,
      side: event.side,
      shape: markerShape(event),
      text: labelledKeys.has(`${event.kind}|${event.openTime}|${event.n || ""}`) ? chipText(event) : "",
      price: event.price,
    })),
    lines: open.map((trade) => ({ entry: trade.entry, stop: trade.stop })),
    band: last ? {
      upper: last.band?.upper ?? null,
      lower: last.band?.lower ?? null,
      middle: last.band?.middle ?? null,
      openTime: Number(last.openTime),
      closeTime: Number(last.openTime) + THIRTY_MIN,
    } : null,
    stepSize: venue?.stepSize || null,
    feed: events.map((event) => ({
      time: event.time,
      clock: formatSastClock(event.time),
      when: formatWhen(event.time, closeBoundary),
      coinId: coin.id,
      kind: event.kind,
      side: event.side,
      stackN: event.stackN || null,
      tradeId: event.tradeId || null,
      price: event.price ?? null,
      stop: event.stop ?? null,
      priceText: event.price == null ? "" : formatPrice(event.price, decimals),
      stopText: event.stop == null ? "" : formatPrice(event.stop, decimals),
      chip: chipText(event),
      detail: eventDetail(event, decimals),
    })),
    book,
  };
}

export function presentOverview(rows, now = Date.now()) {
  const ready = rows.filter((row) => !row.unavailable && row.updatedAt);
  const updatedAt = ready.reduce((max, row) => Math.max(max, row.updatedAt || 0), 0) || null;
  const feed = rows
    .flatMap((row) => row.feed || [])
    .filter((event) => updatedAt && event.time > updatedAt - 24 * 60 * 60 * 1000 && event.time <= updatedAt)
    .sort((left, right) => right.time - left.time);
  const counts = countLast24h(feed.map((event) => ({ ...event, time: event.time })), updatedAt || now);
  const openTrades = rows.reduce((sum, row) => sum + (row.open?.length || 0), 0);
  const ordered = rows.slice().sort((left, right) => {
    const leftOpen = left.open?.length ? 1 : 0;
    const rightOpen = right.open?.length ? 1 : 0;
    if (leftOpen !== rightOpen) return rightOpen - leftOpen;
    return (right.latest?.time || 0) - (left.latest?.time || 0);
  });
  return {
    title: "30 Minute Zigzag",
    updatedAt,
    nextUpdateAt: updatedAt ? updatedAt + THIRTY_MIN : null,
    stamp: stampText(updatedAt),
    coinCount: rows.length,
    openTrades,
    last24h: { entries: counts.entries, partials: counts.partials, closes: counts.closes },
    feed,
    coins: ordered.map(overviewCoin),
  };
}

export function overviewCoin(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    displayDecimals: row.displayDecimals,
    unavailable: row.unavailable,
    message: row.message,
    price: row.price,
    priceText: row.priceText,
    changePercent: row.changePercent,
    lean: row.lean,
    zigzagState: row.zigzagState,
    context: row.context,
    latest: row.latest,
    open: row.open,
    openSummary: row.openSummary,
    armedText: row.armedText,
    footer: row.footer,
    updatedAt: row.updatedAt,
    mini: row.mini,
    markers: (row.markers || []).filter((marker) => (row.mini || []).some((point) => point.openTime === marker.openTime)),
    lines: row.lines,
  };
}

export function detailCoin(row) {
  const { book, feed, ...rest } = row;
  return rest;
}

export function stampText(updatedAt) {
  if (!updatedAt) return "No 30m close processed yet";
  const clock = formatSast(updatedAt, "clock");
  const date = formatSast(updatedAt, "date");
  const next = formatSast(updatedAt + THIRTY_MIN, "clock");
  return `Last updated 30m close ${clock} SAST · ${date} · next update ${next} SAST`;
}
