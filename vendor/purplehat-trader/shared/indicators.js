export function bollinger(closes, period = 20, stdDev = 2) {
  return closes.map((_, index) => {
    if (index < period - 1) return { middle: null, upper: null, lower: null };
    const window = closes.slice(index - period + 1, index + 1).map(Number);
    const middle = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * stdDev;
    return { middle, upper: middle + deviation, lower: middle - deviation };
  });
}

function rsiValue(avgGain, avgLoss) {
  if (avgLoss === 0) return 100;
  const relative = avgGain / avgLoss;
  return 100 - 100 / (1 + relative);
}

export function sma(values, period = 14) {
  const length = Number(period);
  return values.map((_, index) => {
    if (!Number.isInteger(length) || length < 1 || index < length - 1) return null;
    const window = values.slice(index - length + 1, index + 1);
    if (window.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
    return window.reduce((sum, value) => sum + Number(value), 0) / length;
  });
}

export function rsi(closes, period = 14) {
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
  result[period] = rsiValue(avgGain, avgLoss);
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = Number(closes[index]) - Number(closes[index - 1]);
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    result[index] = rsiValue(avgGain, avgLoss);
  }
  return result;
}

export function closedCandles(candles, now = Date.now()) {
  return candles.filter((candle) => candle.closeTime < now);
}

export function withIndicators(candles, now = Date.now(), settings) {
  const closed = closedCandles(candles, now);
  const closes = closed.map((candle) => candle.close);
  const bands = bollinger(closes, settings?.bbPeriod ?? 20, settings?.bbStd ?? 2);
  const momentum = rsi(closes, settings?.rsiPeriod ?? 14);
  const average = sma(momentum, settings?.rsiSmaPeriod ?? 14);
  const byOpen = new Map(closed.map((candle, index) => [candle.openTime, {
    band: bands[index],
    rsi: momentum[index],
    rsiSma: average[index],
  }]));
  return candles.map((candle) => {
    const ready = byOpen.get(candle.openTime);
    return {
      ...candle,
      band: ready ? ready.band : null,
      rsi: ready ? ready.rsi : null,
      rsiSma: ready ? ready.rsiSma : null,
    };
  });
}

export function chartTime(openTime) {
  return Math.floor(Number(openTime) / 1000);
}

// Whitespace keeps the warm-up bars, so each study point stays under its candle.
export function alignedStudyPoints(rows, read) {
  return rows.map((row) => {
    const time = chartTime(row.openTime);
    const raw = read(row);
    if (raw == null || !Number.isFinite(Number(raw))) return { time };
    return { time, value: Number(raw) };
  });
}
