import { formatPrice } from "../coins.js";
import { formatSast } from "../time.js";

export function collectTriggerEvents(overview) {
  const events = [];
  const seen = new Set();
  function push(event) {
    if (!event?.tradeId || (event.kind !== "entry" && event.kind !== "add")) return;
    if (seen.has(event.tradeId)) return;
    seen.add(event.tradeId);
    events.push(event);
  }
  for (const coin of overview?.coins || []) {
    for (const event of coin.feed || []) {
      push({
        ...event,
        coinId: event.coinId || coin.id,
        decimals: coin.displayDecimals,
      });
    }
    for (const trade of coin.open || []) {
      push({
        kind: trade.stackN > 1 ? "add" : "entry",
        tradeId: trade.id,
        coinId: coin.id,
        side: trade.side,
        stackN: trade.stackN,
        price: trade.entry,
        stop: trade.stop,
        priceText: trade.entryText,
        stopText: trade.stopText,
        time: trade.entryTime,
        decimals: coin.displayDecimals,
      });
    }
  }
  return events;
}

export function planAlerts(seen, events, { seeded = false } = {}) {
  const next = new Set(seen || []);
  const alerts = [];
  for (const event of events || []) {
    if (!event?.tradeId || (event.kind !== "entry" && event.kind !== "add")) continue;
    if (next.has(event.tradeId)) continue;
    next.add(event.tradeId);
    if (seeded) alerts.push(event);
  }
  return { seeded: true, seen: [...next], alerts };
}

export function triggerToastText(event) {
  const coin = event?.coinId || "COIN";
  const decimals = event?.decimals ?? 4;
  const price = event?.priceText || (event?.price == null ? "—" : formatPrice(event.price, decimals));
  const stop = event?.stopText || (event?.stop == null ? "—" : formatPrice(event.stop, decimals));
  const label = event?.kind === "add" ? `ADD #${event.stackN || 2}` : (event?.side === "long" ? "LONG" : "SHORT");
  const when = Number.isFinite(Number(event?.time)) ? ` · ${formatSast(event.time, "stamp")}` : "";
  return `New trigger: ${coin} ${label} at ${price}, stop ${stop}${when}`;
}

export function electAlerter(claims) {
  const rows = (claims || []).filter((claim) => claim?.id);
  rows.sort((left, right) => left.at - right.at || String(left.id).localeCompare(String(right.id)));
  return rows[0]?.id || null;
}
