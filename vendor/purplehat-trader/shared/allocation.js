import { PUBLICATION_DELAY_MS, intervalSize } from "./candleSchedule.js";
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
