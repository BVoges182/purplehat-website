import { formatPrice } from "../coins.js";
import { formatR } from "./engine.js";

function grouped(value, digits) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCopy(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const digits = Math.max(0, Number(decimals) || 0);
  return number.toFixed(digits);
}

export function roundSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function formatSize(value) {
  const number = roundSize(value);
  if (number == null) return "—";
  return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatSizeCopy(value) {
  const number = roundSize(value);
  if (number == null) return "";
  return number.toFixed(2);
}

function formatAmount(value) {
  const text = formatSizeCopy(value);
  return text.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function orderLabels(side) {
  if (side === "long") return { entry: "buy limit", stop: "sell stop", partial: "sell limit" };
  return { entry: "sell limit", stop: "buy stop", partial: "buy limit" };
}

export function convertSize(value, unit, entry) {
  const number = Number(value);
  const price = Number(entry);
  if (!Number.isFinite(number) || !(price > 0)) return { notional: 0, coins: 0 };
  if (unit === "coin") return { notional: number * price, coins: number };
  return { notional: number, coins: number / price };
}

export function execLadder({
  side = "short",
  entry,
  stop,
  bandPrice,
  notional = 1000,
  remaining = 1,
  partialsTaken = 0,
  decimals = 4,
  coinId = "COIN",
} = {}) {
  const labels = orderLabels(side);
  const entryPrice = Number(entry);
  const stopPrice = Number(stop);
  const band = Number(bandPrice);
  const heldFraction = Number.isFinite(Number(remaining)) ? Number(remaining) : 1;
  const coinsAtEntry = entryPrice > 0 ? Number(notional) / entryPrice : 0;
  const heldCoins = coinsAtEntry * heldFraction;
  const breakeven = Number.isFinite(entryPrice) && Number.isFinite(stopPrice) && stopPrice === entryPrice;
  const risk = breakeven || !Number.isFinite(stopPrice) ? 0 : heldCoins * Math.abs(stopPrice - entryPrice);
  const rows = [];
  let pool = Math.round(Number(notional) * heldFraction * 10000) / 10000;
  for (let index = 0; index < 3; index += 1) {
    const usdt = Math.round(pool * 0.3 * 10000) / 10000;
    pool = Math.round(pool * 0.7 * 10000) / 10000;
    const coins = entryPrice > 0 ? usdt / entryPrice : 0;
    const distance = Number.isFinite(band) ? Math.abs(entryPrice - band) : 0;
    const profit = coins * distance;
    const r = !breakeven && Math.abs(stopPrice - entryPrice) > 0 ? distance / Math.abs(stopPrice - entryPrice) : 0;
    const number = partialsTaken + index + 1;
    rows.push({
      n: number,
      label: `P${number}`,
      estimated: index > 0,
      price: Number.isFinite(band) ? band : null,
      priceText: Number.isFinite(band) ? formatPrice(band, decimals) : "—",
      copyPrice: Number.isFinite(band) ? formatCopy(band, decimals) : "",
      usdt,
      usdtText: formatAmount(usdt),
      coins,
      coinsText: formatSize(coins),
      copyCoins: formatSizeCopy(coins),
      valueAtPrice: Number.isFinite(band) ? coins * band : null,
      valueText: Number.isFinite(band) ? grouped(coins * band, 2) : "—",
      profit,
      profitText: grouped(profit, 2),
      r,
      rText: formatR(r, 2),
      order: labels.partial,
    });
  }
  const leftCoins = entryPrice > 0 ? pool / entryPrice : 0;
  return {
    side,
    coinId,
    labels,
    breakeven,
    stopLabel: breakeven ? "breakeven" : labels.stop,
    entry: entryPrice,
    stop: stopPrice,
    entryText: formatPrice(entryPrice, decimals),
    stopText: formatPrice(stopPrice, decimals),
    copyEntry: formatCopy(entryPrice, decimals),
    copyStop: formatCopy(stopPrice, decimals),
    notional: Number(notional),
    coinsAtEntry,
    coinsText: formatSize(coinsAtEntry),
    heldCoins,
    heldText: formatSize(heldCoins),
    risk,
    riskText: grouped(risk, 2),
    rows,
    lastLabel: rows.at(-1)?.label || "P3",
    left: {
      usdt: pool,
      usdtText: formatAmount(pool),
      coins: leftCoins,
      coinsText: formatSize(leftCoins),
    },
  };
}
