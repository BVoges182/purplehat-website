export const COINS = [
  { id: "BTC", symbol: "BTCUSDT", name: "Bitcoin", pair: "BTCUSDT", source: "binance", displayDecimals: 2 },
  { id: "SOL", symbol: "SOLUSDT", name: "Solana", pair: "SOLUSDT", source: "binance", displayDecimals: 2 },
  { id: "ETH", symbol: "ETHUSDT", name: "Ethereum", pair: "ETHUSDT", source: "binance", displayDecimals: 2 },
  { id: "ZEC", symbol: "ZECUSDT", name: "Zcash", pair: "ZECUSDT", source: "binance", displayDecimals: 2 },
  { id: "NEAR", symbol: "NEARUSDT", name: "NEAR", pair: "NEARUSDT", source: "binance", displayDecimals: 3 },
  { id: "HYPE", symbol: "HYPEUSDT", name: "Hype", pair: "HYPEUSDT", source: "binance", displayDecimals: 2 },
  { id: "WLD", symbol: "WLDUSDT", name: "Worldcoin", pair: "WLDUSDT", source: "binance", displayDecimals: 4 },
  { id: "AAVE", symbol: "AAVEUSDT", name: "Aave", pair: "AAVEUSDT", source: "binance", displayDecimals: 2 },
  { id: "AVAX", symbol: "AVAXUSDT", name: "Avalanche", pair: "AVAXUSDT", source: "binance", displayDecimals: 3 },
  { id: "DOT", symbol: "DOTUSDT", name: "Polkadot", pair: "DOTUSDT", source: "binance", displayDecimals: 3 },
  { id: "TAO", symbol: "TAOUSDT", name: "Bittensor", pair: "TAOUSDT", source: "binance", displayDecimals: 1 },
  { id: "ONDO", symbol: "ONDOUSDT", name: "Ondo", pair: "ONDOUSDT", source: "binance", displayDecimals: 4 },
  { id: "SUI", symbol: "SUIUSDT", name: "Sui", pair: "SUIUSDT", source: "binance", displayDecimals: 4 },
  { id: "ADA", symbol: "ADAUSDT", name: "Cardano", pair: "ADAUSDT", source: "binance", displayDecimals: 4 },
  { id: "BNB", symbol: "BNBUSDT", name: "BNB", pair: "BNBUSDT", source: "binance", displayDecimals: 2 },
  { id: "DASH", symbol: "DASHUSDT", name: "Dash", pair: "DASHUSDT", source: "binance", displayDecimals: 2 },
  { id: "XLM", symbol: "XLMUSDT", name: "Stellar", pair: "XLMUSDT", source: "binance", displayDecimals: 4 },
  { id: "PENGU", symbol: "PENGUUSDT", name: "Pudgy Penguins", pair: "PENGUUSDT", source: "binance", displayDecimals: 6 },
];

export function decimalsFromTickSize(tickSize) {
  const raw = String(tickSize ?? "").trim();
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric) || numeric <= 0) return 2;
  const text = /e/i.test(raw) ? numeric.toFixed(12) : raw;
  const fraction = (text.split(".")[1] || "").replace(/0+$/, "");
  return fraction.length;
}

export function pairLabel(symbol) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

export function coinById(id) {
  const key = String(id || "").toLowerCase();
  return COINS.find((coin) => coin.id.toLowerCase() === key) || null;
}

export function defaultCoin() {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const symbol = env.DEFAULT_SYMBOL || "BTCUSDT";
  return COINS.find((coin) => coin.symbol === symbol || coin.pair === symbol) || COINS[0];
}

export function formatPrice(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
