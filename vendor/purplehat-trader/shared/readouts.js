// Funding and net-position readouts for the BTC chart.
// Price candles stay Binance spot. These studies use the BTCUSDT perpetual.
// Net shorts are an OI-change plus taker-flow estimate. They are not MMT's series.
// |dOI| is not capped by the bar's aggressive volume.
// A net-short peak is a confluence marker. It is not a BUY or a SELL.

export const READOUT_SYMBOL = "BTCUSDT";
export const READOUT_VENUE = "binancef";
export const POSITION_METHOD = "oi-change-taker-flow-v1";
export const FUNDING_INTERVALS_PER_DAY = 3;
export const FUNDING_DAYS = 365;
export const PEAK_REASON = "Net-short peak (confluence, not a signal)";

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * DAY;

export function intervalMs(interval) {
  return interval === "1d" ? DAY : FOUR_HOURS;
}

export function latestClosedOpen(interval, now) {
  const size = intervalMs(interval);
  return Math.floor(now / size) * size - size;
}

export function annualisedFunding(rate) {
  return Number(rate) * FUNDING_INTERVALS_PER_DAY * FUNDING_DAYS;
}

export function formatFundingRate(rate) {
  const percent = Number(rate) * 100;
  if (!Number.isFinite(percent)) return "—";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(4)}%`;
}

export function formatAnnualised(rate) {
  const percent = annualisedFunding(rate) * 100;
  if (!Number.isFinite(percent)) return "—";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export function formatSastClock(ms) {
  const text = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Number(ms)));
  return `${text} SAST`;
}

export function fundingCountdown(nextFundingTime, now) {
  const target = Number(nextFundingTime);
  const clock = Number.isFinite(target) ? formatSastClock(target) : "";
  const remain = Number.isFinite(target) ? Math.max(0, target - Number(now)) : 0;
  const totalMinutes = Math.floor(remain / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { remainMs: remain, label, clock, text: clock ? `Next in ${label} · ${clock}` : "Next funding time unavailable" };
}

export function dailyFundingSums(prints) {
  const buckets = new Map();
  for (const row of prints || []) {
    const time = Number(row.time ?? row.fundingTime);
    const rate = Number(row.rate);
    if (!Number.isFinite(time) || !Number.isFinite(rate)) continue;
    const stamp = new Date(time);
    const day = Date.UTC(stamp.getUTCFullYear(), stamp.getUTCMonth(), stamp.getUTCDate());
    const bucket = buckets.get(day) || { time: day, sum: 0, count: 0 };
    bucket.sum += rate;
    bucket.count += 1;
    buckets.set(day, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

function fundingColor(percent, hollow) {
  const positive = percent >= 0;
  if (hollow) return positive ? "rgba(23,138,74,0.35)" : "rgba(209,43,94,0.35)";
  return positive ? "#178a4a" : "#d12b5e";
}

function candleOpenFor(rows, time, size) {
  const target = Number(time);
  for (const row of rows || []) {
    const open = Number(row.openTime);
    if (target >= open && target < open + size) return open;
  }
  return null;
}

// One point per price candle so the funding pane shares the price chart's logical time scale.
// Daily bars are the sum of the UTC day's 8-hour prints. The unsettled print is a dimmed bar.
export function fundingPlot(rows, settled, current, interval) {
  const size = interval === "1d" ? 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  const byOpen = new Map();
  if (interval === "1d") {
    for (const bucket of dailyFundingSums(settled)) {
      const open = candleOpenFor(rows, bucket.time, size);
      if (open != null) byOpen.set(open, { sum: bucket.sum, hollow: false });
    }
    if (current && Number.isFinite(Number(current.rate))) {
      const open = candleOpenFor(rows, current.nextFundingTime, size);
      if (open != null) {
        const existing = byOpen.get(open) || { sum: 0, hollow: false };
        existing.sum += Number(current.rate);
        existing.hollow = true;
        byOpen.set(open, existing);
      }
    }
  } else {
    for (const row of settled || []) {
      const open = candleOpenFor(rows, row.time ?? row.fundingTime, size);
      const rate = Number(row.rate);
      if (open == null || !Number.isFinite(rate) || byOpen.has(open)) continue;
      byOpen.set(open, { sum: rate, hollow: false });
    }
    if (current && Number.isFinite(Number(current.rate)) && !byOpen.has(candleOpenFor(rows, current.nextFundingTime, size))) {
      const open = candleOpenFor(rows, current.nextFundingTime, size);
      if (open != null) byOpen.set(open, { sum: Number(current.rate), hollow: true });
    }
  }
  return (rows || []).map((row) => {
    const time = Math.floor(Number(row.openTime) / 1000);
    const hit = byOpen.get(Number(row.openTime));
    if (!hit) return { time };
    const value = hit.sum * 100;
    return { time, value, color: fundingColor(value, hit.hollow) };
  });
}

const THIRTY_DAYS = 30 * DAY;

// Inclusive of the sample at `time` and exclusive of anything 30 days or older.
export function rollingFundingAverage(samples, windowMs = THIRTY_DAYS) {
  const rows = (samples || [])
    .map((row) => ({ time: Number(row.time), rate: Number(row.rate) }))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.rate))
    .sort((left, right) => left.time - right.time);
  let start = 0;
  let sum = 0;
  return rows.map((row, index) => {
    sum += row.rate;
    const cutoff = row.time - windowMs;
    while (start <= index && rows[start].time <= cutoff) {
      sum -= rows[start].rate;
      start += 1;
    }
    const count = index - start + 1;
    return { time: row.time, rate: count > 0 ? sum / count : null, count };
  });
}

function fundingSamples(settled, interval) {
  if (interval === "1d") {
    return dailyFundingSums(settled).map((bucket) => ({ time: bucket.time, rate: bucket.sum }));
  }
  return (settled || []).map((row) => ({ time: Number(row.time ?? row.fundingTime), rate: Number(row.rate) }));
}

// Latest settled 30-day average. Daily uses the daily sums. The unsettled print is left out.
export function fundingAverageRate(settled, interval) {
  const last = rollingFundingAverage(fundingSamples(settled, interval)).at(-1);
  return last && Number.isFinite(last.rate) ? last.rate : null;
}

// Percent points on the price candles, so the average line shares the funding chart's time scale.
export function fundingAveragePlot(rows, settled, interval) {
  const size = interval === "1d" ? DAY : FOUR_HOURS;
  const byOpen = new Map();
  for (const point of rollingFundingAverage(fundingSamples(settled, interval))) {
    const open = candleOpenFor(rows, point.time, size);
    if (open != null && Number.isFinite(point.rate)) byOpen.set(open, point.rate * 100);
  }
  return (rows || []).map((row) => {
    const time = Math.floor(Number(row.openTime) / 1000);
    const value = byOpen.get(Number(row.openTime));
    return value == null ? { time } : { time, value };
  });
}

export function netShortPlot(rows, points) {
  const byOpen = new Map((points || []).map((point) => [Number(point.openTime), point]));
  const ns = [];
  const peak = [];
  const nl = [];
  for (const row of rows || []) {
    const time = Math.floor(Number(row.openTime) / 1000);
    const point = byOpen.get(Number(row.openTime));
    const value = Number(point?.ns);
    if (!point || !Number.isFinite(value)) {
      ns.push({ time });
      peak.push({ time });
      nl.push({ time });
      continue;
    }
    ns.push({ time, value });
    const long = Number(point.nl);
    nl.push(Number.isFinite(long) ? { time, value: long } : { time });
    const high = Number(point.rollingHigh);
    peak.push(Number.isFinite(high) ? { time, value: high } : { time });
  }
  return { ns, peak, nl };
}

export function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(abs >= 100 ? 0 : 1)}`;
}

// dOI is coin open interest at the bar close minus open interest at the bar open.
// Buy-dominated means taker buy volume is strictly greater than taker sell volume.
// An equal split, a zero dOI, or zero volume writes both deltas as 0.
export function classifyPositionBar({ oiOpen, oiClose, volume, takerBuy }) {
  const open = Number(oiOpen);
  const close = Number(oiClose);
  const vol = Number(volume);
  const buy = Number(takerBuy);
  const dOi = close - open;
  const sell = vol - buy;
  const flat = !Number.isFinite(dOi) || Math.abs(dOi) < 1e-8 || !Number.isFinite(vol) || vol === 0;
  let dNl = 0;
  let dNs = 0;
  if (!flat) {
    const buyDominated = buy > sell;
    const sellDominated = sell > buy;
    if (dOi > 0 && sellDominated) dNs = dOi;
    else if (dOi > 0 && buyDominated) dNl = dOi;
    else if (dOi < 0 && buyDominated) dNs = dOi;
    else if (dOi < 0 && sellDominated) dNl = dOi;
  }
  return {
    dOi: flat ? 0 : dOi,
    takerBuy: Number.isFinite(buy) ? buy : 0,
    takerSell: Number.isFinite(sell) ? sell : 0,
    dNl,
    dNs,
  };
}

// Fixed-start cumulative. The first stored bar is the zero point before its own delta is added,
// then every bar adds its delta. Callers that want the running total after each bar use this.
export function withCumulative(bars) {
  let ns = 0;
  let nl = 0;
  return (bars || []).map((bar) => {
    ns += Number(bar.dNs) || 0;
    nl += Number(bar.dNl) || 0;
    return { ...bar, ns, nl, delta: ns - nl };
  });
}

// Visible-range cumulative restarts at 0 on the left bar. Later visible bars add their own deltas.
export function visibleCumulative(bars, startIndex = 0) {
  const start = Math.max(0, Number(startIndex) || 0);
  let ns = 0;
  let nl = 0;
  return (bars || []).map((bar, index) => {
    if (index < start) return { ...bar, ns: null, nl: null, delta: null };
    if (index > start) {
      ns += Number(bar.dNs) || 0;
      nl += Number(bar.dNl) || 0;
    }
    return { ...bar, ns, nl, delta: ns - nl };
  });
}

export function rollingPriorMax(values, lookback) {
  const width = Math.max(1, Number(lookback) || 1);
  return (values || []).map((value, index) => {
    const from = Math.max(0, index - width);
    if (from === index) return null;
    let max = null;
    for (let cursor = from; cursor < index; cursor += 1) {
      const item = Number(values[cursor]);
      if (!Number.isFinite(item)) continue;
      if (max == null || item > max) max = item;
    }
    return max;
  });
}

// A pivot high uses the same idea as market-structure swings: greater than or equal to the
// left bars, and strictly greater than the right bars. The flag still waits for bar t+1.
// Nothing is emitted until that next bar exists, so the rule has no lookahead.
export function netShortPeaks(points, { left = 3, right = 3, near = 0.95, lookback = 60 } = {}) {
  const rows = points || [];
  const flags = [];
  const pivotLeft = Math.max(1, Number(left) || 1);
  const pivotRight = Math.max(1, Number(right) || 1);
  const nearRatio = Number(near);
  const window = Math.max(1, Number(lookback) || 1);
  for (let index = 0; index < rows.length; index += 1) {
    if (index + 1 >= rows.length) continue;
    if (index - pivotLeft < 0 || index + pivotRight >= rows.length) continue;
    const value = Number(rows[index].ns);
    if (!Number.isFinite(value)) continue;
    let high = true;
    for (let step = 1; step <= pivotLeft; step += 1) {
      if (!(value >= Number(rows[index - step].ns))) high = false;
    }
    for (let step = 1; step <= pivotRight; step += 1) {
      if (!(value > Number(rows[index + step].ns))) high = false;
    }
    if (!high) continue;
    if (!(Number(rows[index + 1].ns) < value)) continue;
    const from = Math.max(0, index - window);
    if (from === index) continue;
    let priorMax = null;
    for (let cursor = from; cursor < index; cursor += 1) {
      const item = Number(rows[cursor].ns);
      if (!Number.isFinite(item)) continue;
      if (priorMax == null || item > priorMax) priorMax = item;
    }
    if (priorMax == null || !(value >= nearRatio * priorMax)) continue;
    flags.push({
      openTime: rows[index].openTime,
      reason: PEAK_REASON,
      family: "net-short-peak",
    });
  }
  return flags;
}

export function ninetyDayPeak(points, endTime) {
  const end = Number(endTime);
  if (!Number.isFinite(end)) return null;
  const start = end - NINETY_DAYS;
  let peak = null;
  for (const point of points || []) {
    const time = Number(point.openTime);
    if (time < start || time > end) continue;
    const value = Number(point.ns);
    if (!Number.isFinite(value)) continue;
    if (peak == null || value > peak) peak = value;
  }
  return peak;
}

export function peakCaption({ ns, peak90, rollingOver }) {
  if (rollingOver) return "rolling over";
  if (!Number.isFinite(Number(ns)) || !Number.isFinite(Number(peak90))) return "waiting for closed bars";
  if (Number(ns) >= Number(peak90)) return "at peak";
  if (Number(peak90) === 0) return "at peak";
  const percent = ((Number(peak90) - Number(ns)) / Math.abs(Number(peak90))) * 100;
  return `${percent.toFixed(1)}% below the 90-day peak`;
}

export function nsPivotSettings(settings = {}, interval = "4h") {
  if (interval === "1d") {
    return {
      left: Number(settings.nsPivotLeft1d ?? 2),
      right: Number(settings.nsPivotRight1d ?? 2),
      near: Number(settings.nsPeakNear ?? 0.95),
      lookback: Number(settings.nsPeakLookback1d ?? 30),
    };
  }
  return {
    left: Number(settings.nsPivotLeft4h ?? 3),
    right: Number(settings.nsPivotRight4h ?? 3),
    near: Number(settings.nsPeakNear ?? 0.95),
    lookback: Number(settings.nsPeakLookback4h ?? 60),
  };
}
