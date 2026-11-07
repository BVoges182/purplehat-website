import { COINS } from "../../shared/coins.js";
import { envDefaults } from "../../shared/settings.js";
import { generateSignals } from "../../shared/signals.js";
import { readCandles } from "./db.js";
import { getSettings } from "./settings-store.js";

const DAY = 24 * 60 * 60 * 1000;

export const BACKTEST_DISCLAIMER = "Illustrative simulation only. Not financial advice. Past simulated results do not imply future profits.";

export function parseSastDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("Date must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error("Date must be YYYY-MM-DD");
  return Date.UTC(year, month - 1, day, -2, 0, 0);
}

export function defaultHoldBars(interval) {
  return interval === "1d" ? 5 : 12;
}

export function defaultFeeBps(env = process.env) {
  const raw = env.BACKTEST_FEE_BPS;
  if (raw == null || raw === "") return 5;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 5;
}

export function tradeReturn(entryPrice, exitPrice, feeBps = 0) {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  const fee = Number(feeBps) / 10000;
  const gross = exit / entry - 1;
  const net = (exit * (1 - fee)) / (entry * (1 + fee)) - 1;
  return { gross, net };
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1e8) / 1e8;
}

export function signalsAtBar({ symbol, coinId, candles, index, interval, settings }) {
  const slice = candles.slice(0, index + 1);
  const now = Number(candles[index].closeTime) + 1;
  return generateSignals({
    symbol,
    coinId,
    candles4h: interval === "1d" ? [] : slice,
    candles1d: interval === "1d" ? slice : [],
    settings,
    now,
  });
}

export function runBacktest({
  symbol,
  coinId = null,
  candles = [],
  interval = "4h",
  settings = envDefaults(),
  holdBars = defaultHoldBars(interval),
  feeBps = 0,
  from = null,
  to = null,
} = {}) {
  const ordered = [...(candles || [])]
    .filter((candle) => candle && Number.isFinite(Number(candle.openTime)) && Number.isFinite(Number(candle.closeTime)))
    .sort((a, b) => Number(a.openTime) - Number(b.openTime));
  const start = from ?? -Infinity;
  const end = to ?? Infinity;
  const visible = ordered.filter((candle) => Number(candle.openTime) < end);
  const bars = holdBars;
  const fee = Number(feeBps) || 0;
  const trades = [];
  let position = null;
  let equityValue = 1;
  const first = visible.find((candle) => Number(candle.openTime) >= start) || visible[0];
  const equity = [{ time: first ? Number(first.openTime) : null, equity: 1 }];

  for (let index = 0; index < visible.length; index += 1) {
    const bar = visible[index];
    const inWindow = Number(bar.openTime) >= start;
    const signals = signalsAtBar({ symbol, coinId, candles: visible, index, interval, settings });
    const buys = signals.filter((signal) => signal.side === "BUY");
    const sells = signals.filter((signal) => signal.side === "SELL");
    if (position && inWindow && index > position.entryIndex) {
      const held = index - position.entryIndex;
      const timedOut = held >= bars;
      const opposite = sells.length > 0;
      if (timedOut || opposite) {
        const exitPrice = Number(bar.close);
        const { gross, net } = tradeReturn(position.entryPrice, exitPrice, fee);
        equityValue *= 1 + net;
        trades.push({
          symbol,
          side: "BUY",
          entryTime: position.entryTime,
          exitTime: Number(bar.openTime),
          entryPrice: position.entryPrice,
          exitPrice,
          grossReturn: round(gross),
          netReturn: round(net),
          reason: position.reason,
          exitReason: opposite ? sells.map((signal) => signal.reason).join("; ") : `Held ${bars} bars`,
          barsHeld: held,
        });
        equity.push({ time: Number(bar.openTime), equity: round(equityValue) });
        position = null;
      }
    }
    if (!position && inWindow && buys.length > 0 && sells.length === 0) {
      position = {
        entryIndex: index,
        entryTime: Number(bar.openTime),
        entryPrice: Number(bar.close),
        reason: buys.map((signal) => signal.reason).join("; "),
      };
    }
  }

  let peak = 1;
  let maxDrawdown = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - point.equity) / peak);
  }
  const wins = trades.filter((trade) => trade.netReturn > 0);
  const losses = trades.filter((trade) => trade.netReturn < 0);
  const profitSum = wins.reduce((sum, trade) => sum + trade.netReturn, 0);
  const lossSum = losses.reduce((sum, trade) => sum + Math.abs(trade.netReturn), 0);
  return {
    symbol,
    interval,
    feeBps: fee,
    holdBars: bars,
    from: start === -Infinity ? null : start,
    to: end === Infinity ? null : end,
    bars: visible.filter((candle) => Number(candle.openTime) >= start && Number(candle.openTime) < end).length,
    disclaimer: BACKTEST_DISCLAIMER,
    metrics: {
      trades: trades.length,
      winRate: trades.length ? round(wins.length / trades.length) : null,
      averageReturn: trades.length ? round(trades.reduce((sum, trade) => sum + trade.netReturn, 0) / trades.length) : null,
      maxDrawdown: round(maxDrawdown),
      totalReturn: round(equityValue - 1),
      profitFactor: lossSum > 0 ? round(profitSum / lossSum) : null,
    },
    trades,
    equity,
    openPosition: position ? {
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      reason: position.reason,
    } : null,
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function runStoredBacktest(db, body = {}) {
  const symbol = String(body.symbol || "");
  const coin = COINS.find((item) => item.symbol === symbol || item.id.toLowerCase() === symbol.toLowerCase());
  if (!coin) throw badRequest("Unknown symbol");
  const interval = body.interval === "1d" ? "1d" : "4h";
  const from = body.from ? parseSastDay(body.from) : null;
  const to = body.to ? parseSastDay(body.to) + DAY : null;
  if (from != null && to != null && !(to > from)) throw badRequest("The end date must be after the start date");
  const holdBars = body.holdBars == null || body.holdBars === "" ? defaultHoldBars(interval) : Number(body.holdBars);
  if (!Number.isInteger(holdBars) || holdBars < 1) throw badRequest("Hold bars must be an integer of at least 1");
  const feeBps = body.feeBps == null || body.feeBps === "" ? defaultFeeBps() : Number(body.feeBps);
  if (!Number.isFinite(feeBps) || feeBps < 0) throw badRequest("Fee bps must be zero or more");
  return runBacktest({
    symbol: coin.symbol,
    coinId: coin.id,
    candles: readCandles(db, coin.symbol, interval),
    interval,
    settings: getSettings(db),
    holdBars,
    feeBps,
    from,
    to,
  });
}
