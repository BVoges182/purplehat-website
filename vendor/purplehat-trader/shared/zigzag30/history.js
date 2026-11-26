import { formatR, rMultiple } from "./engine.js";

const THIRTY_MIN = 30 * 60 * 1000;

export function tradesFromBook(book) {
  const closes = new Map();
  for (const event of book?.log || []) {
    if (event?.kind === "close" && event.tradeId) closes.set(event.tradeId, event);
  }
  const rows = [];
  for (const trade of [...(book?.closed || []), ...(book?.open || [])]) {
    if (!trade?.id) continue;
    const close = closes.get(trade.id);
    rows.push({
      id: trade.id,
      coinId: trade.coinId,
      side: trade.side,
      stackN: trade.stackN,
      entry: trade.entry,
      stop: trade.stop,
      initialStop: trade.initialStop,
      entryTime: trade.entryTime,
      openTime: trade.openTime,
      remaining: trade.remaining,
      bankedR: trade.bankedR,
      partials: trade.partials || [],
      closed: Boolean(trade.closed) || Boolean(close),
      totalR: close?.totalR ?? null,
      reason: close?.reason ?? null,
      closePrice: close?.price ?? null,
      closeTime: close?.time ?? null,
    });
  }
  return rows;
}

export function sameTrade(left, right) {
  if (!left || !right) return false;
  const fields = ["side", "entry", "stop", "reason"];
  for (const field of fields) {
    if (left[field] !== right[field]) return false;
  }
  const leftR = left.totalR == null ? null : Math.round(Number(left.totalR) * 10000) / 10000;
  const rightR = right.totalR == null ? null : Math.round(Number(right.totalR) * 10000) / 10000;
  if (leftR !== rightR) return false;
  return (left.partials || []).length === (right.partials || []).length;
}

export function mergeStored(existing, incoming, source) {
  if (!existing) return { action: "insert", overlap: false, differed: false, source, trade: { ...incoming, source } };
  const storedSource = existing.source || source;
  const overlap = existing.source != null && existing.source !== source;
  const differed = overlap && !sameTrade(existing, incoming);
  if (source === "backfill" && existing.source === "live") {
    return { action: "keep-live", overlap: true, differed, source: "live", trade: existing };
  }
  if (storedSource === source && sameTrade(existing, incoming)) {
    return { action: "same", overlap, differed, source: storedSource, trade: { ...existing, source: storedSource } };
  }
  return { action: "replace", overlap, differed, source, trade: { ...incoming, source } };
}

function eventTime(partial) {
  return Number(partial.time || (Number(partial.openTime) + THIRTY_MIN));
}

export function eventsForTrade(trade) {
  const events = [{
    kind: trade.stackN > 1 ? "add" : "entry",
    tradeId: trade.id,
    side: trade.side,
    stackN: trade.stackN,
    time: trade.entryTime,
    price: trade.entry,
    stop: trade.stop,
  }];
  for (const partial of trade.partials || []) {
    events.push({
      kind: "partial",
      tradeId: trade.id,
      side: trade.side,
      n: partial.n,
      time: eventTime(partial),
      price: partial.price,
      r: partial.r,
    });
  }
  if (trade.closed) {
    events.push({
      kind: "close",
      tradeId: trade.id,
      side: trade.side,
      time: trade.closeTime,
      price: trade.closePrice,
      totalR: trade.totalR,
      reason: trade.reason,
    });
  }
  return events.sort((left, right) => (left.time || 0) - (right.time || 0));
}

export function groupEvents(events) {
  const groups = new Map();
  for (const event of events || []) {
    if (!event?.tradeId || event.kind === "skip") continue;
    if (!groups.has(event.tradeId)) groups.set(event.tradeId, []);
    groups.get(event.tradeId).push(event);
  }
  const rows = [];
  for (const [id, list] of groups) {
    const ordered = list.slice().sort((left, right) => (left.time || 0) - (right.time || 0));
    const entry = ordered.find((event) => event.kind === "entry" || event.kind === "add");
    const close = [...ordered].reverse().find((event) => event.kind === "close");
    rows.push({
      id,
      side: entry?.side || ordered[0]?.side || null,
      stackN: entry?.stackN || 1,
      entryTime: entry?.time || ordered[0]?.time || 0,
      entry: entry?.price ?? null,
      stop: entry?.stop ?? null,
      closed: Boolean(close),
      totalR: close?.totalR ?? null,
      reason: close?.reason ?? null,
      partialCount: ordered.filter((event) => event.kind === "partial").length,
      events: ordered,
    });
  }
  return rows.sort((left, right) => (right.entryTime || 0) - (left.entryTime || 0));
}

export function groupTriggerHistory(trades, lastClose = null) {
  return (trades || []).map((trade) => {
    const open = !trade.closed;
    const nowR = open && lastClose != null
      ? Number(trade.bankedR || 0) + Number(trade.remaining || 0) * rMultiple(trade.side, trade.entry, trade.initialStop || trade.stop, lastClose)
      : null;
    return {
      id: trade.id,
      side: trade.side,
      stackN: trade.stackN || 1,
      entryTime: trade.entryTime,
      entry: trade.entry,
      stop: trade.stop,
      closed: !open,
      totalR: trade.totalR,
      totalRText: trade.totalR == null ? "—" : formatR(trade.totalR, 1),
      nowR,
      nowRText: nowR == null ? "" : formatR(nowR, 2),
      reason: trade.reason || "",
      partialCount: (trade.partials || []).length,
      source: trade.source || "",
      events: eventsForTrade(trade),
    };
  }).sort((left, right) => (right.entryTime || 0) - (left.entryTime || 0));
}
