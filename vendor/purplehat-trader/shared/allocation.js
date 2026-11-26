import { PUBLICATION_DELAY_MS, intervalSize } from "./candleSchedule.js";
import { formatPrice } from "./coins.js";
import { withIndicators } from "./indicators.js";

// Equality is not above. Missing inputs stay unavailable rather than recommending USD.
function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function decideAllocation({ close, middle, rsi } = {}) {
  const price = finite(close);
  const band = finite(middle);
  const momentum = finite(rsi);
  if (price == null || band == null || momentum == null) {
    return {
      status: "unavailable",
      label: "Allocation unavailable",
      reason: "Closed Daily close, Bollinger middle, or RSI is missing.",
      aboveBand: null,
      aboveRsi: null,
    };
  }
  const aboveBand = price > band;
  const aboveRsi = momentum > 50;
  let label = "Hold USD";
  if (aboveBand && aboveRsi) label = "Hold spot BTC";
  else if (aboveBand || aboveRsi) label = "Hold 50% BTC / 50% USD";
  return { status: "ready", label, aboveBand, aboveRsi, informational: true };
}

export function btcDailyAllocation(candles, now = Date.now(), settings) {
  const rows = withIndicators(candles || [], now, settings);
  const last = [...rows].reverse().find((row) => Number(row.closeTime) < now);
  if (!last) {
    return {
      status: "unavailable",
      label: "Allocation unavailable",
      reason: "No closed Daily candle.",
      stale: false,
      aboveBand: null,
      aboveRsi: null,
      openTime: null,
    };
  }
  const size = intervalSize("1d");
  const expectedOpen = Math.floor((now - PUBLICATION_DELAY_MS) / size) * size - size;
  const decision = decideAllocation({ close: last.close, middle: last.band?.middle, rsi: last.rsi });
  return {
    ...decision,
    close: finite(last.close),
    middle: finite(last.band?.middle),
    rsi: finite(last.rsi),
    openTime: last.openTime,
    closeTime: last.closeTime,
    stale: Number(last.openTime) < expectedOpen,
  };
}

export const ALLOCATION_RULE = "Rules: close > Daily BB(20,2) middle and RSI(14) > 50. Equality does not pass.";

export const ALLOCATION_STATES = [
  { id: "btc", title: "Hold spot BTC", detail: "100% BTC, both true." },
  { id: "split", title: "Hold 50% BTC / 50% USD", detail: "50% BTC and 50% USD, exactly one true." },
  { id: "usd", title: "Hold USD", detail: "100% USD, neither true." },
];

function sastDate(ms) {
  if (!Number.isFinite(Number(ms))) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(ms)));
}

export function allocationCardModel(result) {
  if (!result || result.status !== "ready") {
    return {
      status: "unavailable",
      title: "Allocation unavailable",
      state: null,
      subtitle: "Daily allocation · waiting for a closed candle",
      btcPercent: 0,
      usdPercent: 0,
      bandLine: "Closed Daily close, Bollinger middle, or RSI is missing.",
      rsiLine: "",
      footer: "Allocation context, not an order.",
      tone: "#6d5b86",
    };
  }
  const aboveBand = result.aboveBand === true;
  const aboveRsi = result.aboveRsi === true;
  const trueCount = Number(aboveBand) + Number(aboveRsi);
  const state = trueCount === 2 ? "btc" : trueCount === 1 ? "split" : "usd";
  const subtitle = trueCount === 2
    ? "Daily allocation · both conditions true"
    : trueCount === 1
      ? "Daily allocation · one condition true"
      : "Daily allocation · neither condition true";
  const btcPercent = state === "btc" ? 100 : state === "split" ? 50 : 0;
  const close = formatPrice(result.close, 2);
  const middle = formatPrice(result.middle, 2);
  const rsi = Number.isFinite(Number(result.rsi)) ? Number(result.rsi).toFixed(1) : "—";
  return {
    status: "ready",
    title: result.label,
    state,
    subtitle: result.stale ? `${subtitle} · stale` : subtitle,
    btcPercent,
    usdPercent: 100 - btcPercent,
    bandLine: `${aboveBand ? "✓" : "✗"} Close ${close} ${aboveBand ? ">" : "≤"} BB middle ${middle}`,
    rsiLine: `${aboveRsi ? "✓" : "✗"} RSI(14) ${rsi} ${aboveRsi ? ">" : "≤"} 50`,
    bandChip: `${aboveBand ? "✓" : "✗"} Close ${aboveBand ? ">" : "≤"} BB mid`,
    rsiChip: `${aboveRsi ? "✓" : "✗"} RSI ${rsi} ${aboveRsi ? ">" : "≤"} 50`,
    closedOn: `Last closed Daily candle: ${sastDate(result.openTime)} (SAST)`,
    bandTrue: aboveBand,
    rsiTrue: aboveRsi,
    footer: `Last closed Daily candle: ${sastDate(result.openTime)} (SAST) · allocation context, not an order`,
    tone: state === "btc" ? "#178a4a" : state === "split" ? "#b45309" : "#6a2fd6",
    close: result.close,
    middle: result.middle,
    rsi: result.rsi,
    openTime: result.openTime,
  };
}
