const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

export function roundedR(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10000) / 10000;
}

export function classifyR(totalR) {
  const rounded = roundedR(totalR);
  if (rounded == null) return null;
  if (rounded > 0) return "win";
  if (rounded < 0) return "loss";
  return "be";
}

export function countedTrades(trades, now = Date.now()) {
  const start = now - NINETY_DAYS;
  return (trades || []).filter((trade) => {
    if (!trade || trade.closed === false || trade.open === true) return false;
    if (trade.totalR == null || !Number.isFinite(Number(trade.totalR))) return false;
    const entry = Number(trade.entryTime);
    return Number.isFinite(entry) && entry >= start && entry <= now;
  });
}

function netText(netR) {
  if (!Number.isFinite(netR)) return "—";
  const rounded = Math.round(netR * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}R`;
}

function percentText(wins, losses) {
  const decided = wins + losses;
  if (!decided) return "—";
  const pct = (wins / decided) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function winRate(trades, now = Date.now()) {
  const rows = countedTrades(trades, now);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let netR = 0;
  for (const trade of rows) {
    const kind = classifyR(trade.totalR);
    if (kind === "win") wins += 1;
    else if (kind === "loss") losses += 1;
    else breakeven += 1;
    netR += Number(trade.totalR);
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    breakeven,
    n: rows.length,
    netR,
    netText: netText(netR),
    winPct: decided ? (wins / decided) * 100 : null,
    percentText: percentText(wins, losses),
    line: `W ${wins} · L ${losses} · BE ${breakeven}`,
    small: rows.length < 10,
  };
}

export function winRateBand(winPct) {
  if (winPct == null || winPct === "") return "grey";
  const pct = Number(winPct);
  if (!Number.isFinite(pct)) return "grey";
  if (pct >= 50) return "green";
  if (pct >= 40) return "yellow";
  if (pct >= 30) return "orange";
  return "red";
}

export function recordChip(stats) {
  if (!stats?.n) return "90d: no trades";
  return `90d: ${stats.wins}W / ${stats.losses}L / ${stats.breakeven}BE · ${stats.percentText} · ${stats.netText} (${stats.n} trades)`;
}

export function compareWinRate(left, right) {
  const leftPct = left?.winPct;
  const rightPct = right?.winPct;
  if (leftPct == null && rightPct == null) {
    // Fall through to net R.
  } else if (leftPct == null) return -1;
  else if (rightPct == null) return 1;
  else if (leftPct !== rightPct) return leftPct - rightPct;
  const leftNet = Number.isFinite(left?.netR) ? left.netR : -Infinity;
  const rightNet = Number.isFinite(right?.netR) ? right.netR : -Infinity;
  if (leftNet !== rightNet) return leftNet - rightNet;
  return (left?.n || 0) - (right?.n || 0);
}
