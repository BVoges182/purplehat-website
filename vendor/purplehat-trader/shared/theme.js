export const BOLLINGER_BANDS = {
  upper: { color: "#64748B", lineWidth: 1.5, lineStyle: "solid" },
  middle: { color: "#94A3B8", lineWidth: 1, lineStyle: "dashed" },
  lower: { color: "#64748B", lineWidth: 1.5, lineStyle: "solid" },
};

export const SIGNAL_THEME = {
  band: { color: "#EAB308", label: "#713F12", size: 1, strength: 1 },
  rsi: { color: "#EA580C", label: "#EA580C", size: 2, strength: 2 },
  bear: { color: "#991B1B", label: "#991B1B", size: 3, strength: 3 },
  bull: { color: "#166534", label: "#166534", size: 3, strength: 3 },
};

export function signalAppearance(family, side) {
  const sell = side === "SELL";
  if (family === "divergence" || family === "triple") {
    const tone = sell ? SIGNAL_THEME.bear : SIGNAL_THEME.bull;
    return {
      ...tone,
      short: sell ? "Bear div" : "Bull div",
      full: sell ? "Bearish divergence" : "Bullish divergence",
    };
  }
  if (family === "rsi") {
    return {
      ...SIGNAL_THEME.rsi,
      short: sell ? "RSI S" : "RSI B",
      full: sell ? "RSI sell" : "RSI buy",
    };
  }
  if (family === "rejection") {
    return {
      ...SIGNAL_THEME.band,
      short: sell ? "Band S" : "Band B",
      full: sell ? "Band sell (rejection)" : "Band buy (rejection)",
    };
  }
  return {
    ...SIGNAL_THEME.band,
    short: sell ? "Band S" : "Band B",
    full: sell ? "Band sell" : "Band buy",
  };
}

export function signalStrength(family) {
  return signalAppearance(family, "SELL").strength;
}

export function compareSignals(left, right) {
  return signalStrength(right.family) - signalStrength(left.family) || right.barOpenTime - left.barOpenTime;
}
