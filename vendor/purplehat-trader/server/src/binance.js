export function binanceBase() {
  return (process.env.BINANCE_API_BASE || "https://data-api.binance.vision").replace(/\/$/, "");
}

export function normalizeKline(row) {
  return {
    openTime: Number(row[0]),
    open: String(row[1]),
    high: String(row[2]),
    low: String(row[3]),
    close: String(row[4]),
    volume: String(row[5]),
    closeTime: Number(row[6]),
  };
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Binance ${response.status} for ${url}`);
  }
  return response.json();
}

export async function fetchKlines(symbol, interval, limit = 500) {
  const url = `${binanceBase()}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const rows = await getJson(url);
  return rows.map(normalizeKline);
}

export async function fetchTicker(symbol) {
  const url = `${binanceBase()}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  const body = await getJson(url);
  return {
    lastPrice: String(body.lastPrice),
    changePercent: String(body.priceChangePercent),
  };
}
