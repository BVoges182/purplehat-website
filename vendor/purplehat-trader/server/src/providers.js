import { decimalsFromTickSize } from "../../shared/coins.js";
import { binanceBase, normalizeKline } from "./binance.js";
import { requestJson, withBackoff } from "./backoff.js";

const VENUE_TTL = 6 * 60 * 60 * 1000;

export function indexExchangeInfo(payload) {
  const listed = new Map();
  for (const row of payload?.symbols || []) {
    if (row?.status !== "TRADING") continue;
    const price = (row.filters || []).find((filter) => filter.filterType === "PRICE_FILTER");
    listed.set(row.symbol, {
      tickSize: price?.tickSize ?? null,
      decimals: decimalsFromTickSize(price?.tickSize),
    });
  }
  return listed;
}

export async function resolveCoinVenue(coin, listed, hyperliquid) {
  const pair = coin.pair || coin.symbol;
  const hit = typeof listed?.get === "function" ? listed.get(pair) : null;
  if (hit) {
    return {
      provider: "binance",
      market: pair,
      label: "Binance",
      kind: "spot",
      decimals: hit.decimals,
      tickSize: hit.tickSize ? String(hit.tickSize) : "",
    };
  }
  try {
    const resolved = await hyperliquid.resolveMarket(coin.id);
    return {
      provider: "hyperliquid",
      market: resolved.market,
      label: "Hyperliquid",
      kind: resolved.kind,
      decimals: coin.displayDecimals ?? 2,
    };
  } catch {
    return {
      provider: "unavailable",
      market: pair,
      label: "Unavailable",
      kind: null,
      decimals: coin.displayDecimals ?? 2,
    };
  }
}

export function createBinanceProvider({ fetchImpl = fetch, pace = async () => {}, base } = {}) {
  const root = (base || binanceBase()).replace(/\/$/, "");
  let listed = null;
  let listedAt = 0;
  let listedPromise = null;
  return {
    id: "binance",
    label: "Binance",
    async exchangeInfo() {
      if (listed && Date.now() - listedAt < VENUE_TTL) return listed;
      if (!listedPromise) {
        listedPromise = withBackoff(async () => {
          await pace();
          const body = await requestJson(`${root}/api/v3/exchangeInfo`, { fetchImpl, service: "Binance" });
          listed = indexExchangeInfo(body);
          listedAt = Date.now();
          return listed;
        }).finally(() => {
          listedPromise = null;
        });
      }
      return listedPromise;
    },
    async candles(symbol, interval, limit = 500) {
      return withBackoff(async () => {
        await pace();
        const url = `${root}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
        const rows = await requestJson(url, { fetchImpl, service: "Binance" });
        return rows.map(normalizeKline);
      });
    },
    async ticker(symbol) {
      return withBackoff(async () => {
        await pace();
        const url = `${root}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
        const body = await requestJson(url, { fetchImpl, service: "Binance" });
        return {
          lastPrice: String(body.lastPrice),
          changePercent: String(body.priceChangePercent),
        };
      });
    },
  };
}

export function normalizeHyperliquidCandle(row) {
  if (!row || row.t == null || row.T == null) return null;
  return {
    openTime: Number(row.t),
    open: String(row.o),
    high: String(row.h),
    low: String(row.l),
    close: String(row.c),
    volume: String(row.v),
    closeTime: Number(row.T),
  };
}

export function createHyperliquidProvider({ fetchImpl = fetch, pace = async () => {}, endpoint } = {}) {
  const url = endpoint || process.env.HYPERLIQUID_API_BASE || "https://api.hyperliquid.xyz/info";
  async function post(body) {
    return withBackoff(async () => {
      await pace();
      return requestJson(url, { fetchImpl, method: "POST", body: JSON.stringify(body), service: "Hyperliquid" });
    });
  }
  return {
    id: "hyperliquid",
    label: "Hyperliquid",
    async candles(market, interval, limit = 500) {
      const size = interval === "1M"
        ? 31 * 24 * 60 * 60 * 1000
        : interval === "1d"
          ? 24 * 60 * 60 * 1000
          : 4 * 60 * 60 * 1000;
      const end = Date.now();
      const start = end - limit * size;
      const rows = await post({
        type: "candleSnapshot",
        req: { coin: market, interval, startTime: start, endTime: end },
      });
      if (!Array.isArray(rows)) return [];
      return rows
        .map(normalizeHyperliquidCandle)
        .filter(Boolean)
        .sort((a, b) => a.openTime - b.openTime)
        .slice(-limit);
    },
    async resolveMarket(name = "HYPE") {
      try {
        const perp = await this.candles(name, "4h", 5);
        if (perp.length > 0) return { market: name, kind: "perp" };
      } catch {
        // The perp name is missing. The spot index is the other public market.
      }
      const meta = await post({ type: "spotMeta" });
      const spot = (meta?.universe || []).find((item) => {
        const label = String(item.name || "").toUpperCase();
        return label === name || label.startsWith(`${name}/`);
      });
      if (spot?.index == null) throw new Error(`Hyperliquid has no ${name} market`);
      return { market: `@${spot.index}`, kind: "spot", name: spot.name };
    },
    async ticker(market) {
      const mids = await post({ type: "allMids" });
      const last = mids?.[market];
      if (last == null) return null;
      let changePercent = "";
      try {
        const ctx = await post({ type: "metaAndAssetCtxs" });
        const universe = ctx?.[0]?.universe;
        const rows = ctx?.[1];
        const index = Array.isArray(universe) ? universe.findIndex((item) => item.name === market) : -1;
        const prev = Number(index >= 0 ? rows?.[index]?.prevDayPx : undefined);
        const mid = Number(last);
        if (prev > 0 && Number.isFinite(mid)) changePercent = (((mid - prev) / prev) * 100).toFixed(2);
      } catch {
        changePercent = "";
      }
      return { lastPrice: String(last), changePercent };
    },
  };
}

export async function resolveHypeVenue({ binance, hyperliquid }) {
  try {
    const rows = await binance.candles("HYPEUSDT", "4h", 2);
    if (Array.isArray(rows) && rows.length > 0) {
      return { provider: "binance", market: "HYPEUSDT", label: "Binance", kind: "spot" };
    }
  } catch {
    // Missing symbol, empty book, or a hard error. Hyperliquid is the fallback.
  }
  const resolved = await hyperliquid.resolveMarket("HYPE");
  return {
    provider: "hyperliquid",
    market: resolved.market,
    label: "Hyperliquid",
    kind: resolved.kind,
  };
}
