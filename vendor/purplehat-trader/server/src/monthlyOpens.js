import { formatPrice } from "../../shared/coins.js";
import { createMonthlyOpenStore, firstCandlePerMonth } from "../../shared/monthlyOpens.js";
import { readVenue } from "./db.js";
import { createBinanceProvider, createHyperliquidProvider } from "./providers.js";

const defaultStore = createMonthlyOpenStore();

async function fetchMonthlyKlines(provider, market) {
  try {
    const monthly = await provider.candles(market, "1M", 6);
    if (Array.isArray(monthly) && monthly.length > 0) return monthly;
  } catch {
    // 1M is missing on this venue. The first daily candle of the month is the open.
  }
  const daily = await provider.candles(market, "1d", 120);
  return firstCandlePerMonth(Array.isArray(daily) ? daily : []);
}

export async function monthlyOpensFor(db, coin, options = {}) {
  const now = options.now ?? Date.now();
  const venue = options.venue || (db ? readVenue(db, coin.symbol) : null) || {
    provider: "binance",
    market: coin.pair || coin.symbol,
    label: "Binance",
    kind: "spot",
  };
  if (venue.provider === "unavailable") return [];
  const binance = options.binance || createBinanceProvider({ fetchImpl: options.fetchImpl, pace: async () => {} });
  const hyperliquid = options.hyperliquid || createHyperliquidProvider({ fetchImpl: options.fetchImpl, pace: async () => {} });
  const provider = venue.provider === "hyperliquid" ? hyperliquid : binance;
  const market = venue.market || coin.pair || coin.symbol;
  const store = options.store || defaultStore;
  const fromVenue = venue.decimals == null ? coin.displayDecimals : Number(venue.decimals);
  const decimals = Number.isFinite(fromVenue) ? fromVenue : 2;
  return store.load({
    key: `${venue.provider}:${market}`,
    now,
    format: (value) => formatPrice(value, decimals),
    fetchKlines: () => fetchMonthlyKlines(provider, market),
  });
}
