const DAY = 24 * 60 * 60 * 1000;
const BLOCK_MINUTES = 10;
const NEXT_BLOCK = 1_050_000;

export const CONFIRMED_HALVINGS = [
  { cycle: 2012, date: "2012-11-28" },
  { cycle: 2016, date: "2016-07-09" },
  { cycle: 2020, date: "2020-05-11" },
  { cycle: 2024, date: "2024-04-20" },
];

export function dateOnlyUtc(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addCalendarDays(ms, days) {
  return dateOnlyUtc(formatIso(ms)) + days * DAY;
}

export function windowFor(halvingMs) {
  const day = dateOnlyUtc(halvingMs);
  return { buy: addCalendarDays(day, -500), sell: addCalendarDays(day, 500) };
}

export function estimateHalving({ height, asOf, block = NEXT_BLOCK, minutesPerBlock = BLOCK_MINUTES } = {}) {
  const left = block - Number(height);
  const asOfMs = dateOnlyUtc(asOf);
  const halving = asOfMs + left * minutesPerBlock * 60 * 1000;
  return {
    block,
    height: Number(height),
    blocksLeft: left,
    minutesPerBlock,
    asOf: formatIso(asOfMs),
    halvingMs: dateOnlyUtc(halving),
    halvingDate: formatIso(halving),
    estimated: true,
  };
}

export function completedCycles(now = Date.now()) {
  return CONFIRMED_HALVINGS.map((item) => {
    const halving = dateOnlyUtc(item.date);
    const window = windowFor(halving);
    return {
      cycle: item.cycle,
      halving: item.date,
      buy: formatIso(window.buy),
      sell: formatIso(window.sell),
      buyMs: window.buy,
      sellMs: window.sell,
      estimated: false,
      complete: dateOnlyUtc(now) > window.sell,
    };
  });
}

export function nextCycle(estimate) {
  const window = windowFor(estimate.halvingMs);
  return {
    cycle: "next",
    halving: estimate.halvingDate,
    halvingMs: estimate.halvingMs,
    buy: formatIso(window.buy),
    sell: formatIso(window.sell),
    buyMs: window.buy,
    sellMs: window.sell,
    estimated: true,
    blocksLeft: estimate.blocksLeft,
    block: estimate.block,
    height: estimate.height,
    minutesPerBlock: estimate.minutesPerBlock,
    asOf: estimate.asOf,
  };
}

export function cycleState(now, buyMs, sellMs) {
  const day = dateOnlyUtc(now);
  if (day < buyMs) return "Cash";
  if (day >= sellMs) return "Cash";
  return "Hold";
}

export function daysUntil(now, targetMs) {
  return Math.round((dateOnlyUtc(targetMs) - dateOnlyUtc(now)) / DAY);
}

export function describeCycle(now, upcoming) {
  const state = cycleState(now, upcoming.buyMs, upcoming.sellMs);
  if (state === "Cash" && dateOnlyUtc(now) < upcoming.buyMs) {
    return { state, action: "BUY", days: daysUntil(now, upcoming.buyMs), when: upcoming.buy };
  }
  if (state === "Hold") {
    return { state, action: "SELL", days: daysUntil(now, upcoming.sellMs), when: upcoming.sell };
  }
  return { state, action: "BUY", days: null, when: upcoming.buy };
}

export function priceOn(points, ms) {
  let chosen = null;
  for (const point of points || []) {
    if (Number(point.time) <= ms) chosen = point;
    else break;
  }
  return chosen ? Number(chosen.close) : null;
}

export function holdStats(points, buyMs, sellMs) {
  const buy = priceOn(points, buyMs + DAY - 1);
  const sell = priceOn(points, sellMs + DAY - 1);
  if (!(buy > 0) || !(sell > 0)) return null;
  let peak = buy;
  let maxDd = 0;
  for (const point of points || []) {
    if (point.time < buyMs || point.time > sellMs + DAY) continue;
    const close = Number(point.close);
    if (close > peak) peak = close;
    if (peak > 0) maxDd = Math.min(maxDd, (close - peak) / peak);
  }
  return {
    buyPrice: buy,
    sellPrice: sell,
    returnPct: (sell / buy - 1) * 100,
    maxDdPct: maxDd * 100,
  };
}

export function halvingModel({ height, asOf, now = asOf, points = [] } = {}) {
  const estimate = estimateHalving({ height, asOf });
  const past = completedCycles(now);
  const upcoming = nextCycle(estimate);
  const status = describeCycle(now, upcoming);
  const lastSell = [...past].reverse().find((cycle) => cycle.complete) || past.at(-1);
  const table = past.map((cycle) => ({
    ...cycle,
    ...(holdStats(points, cycle.buyMs, cycle.sellMs) || {}),
  }));
  return {
    state: status.state,
    action: status.action,
    days: status.days,
    when: status.when,
    estimate,
    upcoming,
    lastSell,
    table,
    chip: status.days == null
      ? `Halving cycle: ${status.state}`
      : `Halving cycle: ${status.state} · ${status.action} in ${status.days}d`,
  };
}
