import { createPacer, requestJson } from "./backoff.js";
import {
  LIQUIDATION_MODEL,
  accountRatioView,
  coverageWindows,
  fundingView,
  intervalHoursFrom,
} from "../../shared/liquidationModel.js";

const OKX_BASE = process.env.OKX_API_BASE || "https://www.okx.com";
const BINANCE_FAPI = process.env.BINANCE_FAPI_BASE || "https://fapi.binance.com";
const BYBIT_BASE = process.env.BYBIT_API_BASE || "https://api.bybit.com";
const CACHE_MS = 5 * 60 * 1000;
const PAGE_LIMITS = { okx: 8, binance: 2, bybit: 4 };

const LIMITATIONS = [
  "Estimated liquidation clusters (model). Not resting orders and not confirmed future liquidations.",
  "Open interest does not reveal the actual entry, side, or leverage.",
  "Clusters use OKX BTC-USDT-SWAP hourly USD open interest only. Binance and Bybit figures are listed separately and are not added in.",
  "Long-liquidation estimates sit below the reference close. Short-liquidation estimates sit above it.",
  "Intensity is relative, not a USD size.",
  "A cluster clears only when a later candle closes through it. The creating candle and wicks do not clear it.",
  "Realised liquidation prints are not included and are not used as a heatmap.",
];

let memory = { at: 0, symbol: "", body: null, inflight: null };

export function parseOkxOiHistory(body) {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((row) => ({
    time: Number(row?.[0]),
    oiUsd: Number(row?.[3]),
    venue: "okx",
  })).filter((row) => Number.isFinite(row.time) && Number.isFinite(row.oiUsd));
}

export function parseBinanceOiHistory(body) {
  const rows = Array.isArray(body) ? body : [];
  return rows.map((row) => ({
    time: Number(row?.timestamp),
    oiUsd: Number(row?.sumOpenInterestValue),
    oiCoin: Number(row?.sumOpenInterest),
    venue: "binance",
  })).filter((row) => Number.isFinite(row.time) && Number.isFinite(row.oiUsd));
}

export function parseBybitOiHistory(body) {
  const rows = Array.isArray(body?.result?.list) ? body.result.list : [];
  return {
    points: rows.map((row) => ({
      time: Number(row?.timestamp),
      oiCoin: Number(row?.openInterest),
      oiUsd: null,
      venue: "bybit",
    })).filter((row) => Number.isFinite(row.time) && Number.isFinite(row.oiCoin)),
    cursor: body?.result?.nextPageCursor || "",
  };
}

function dedupe(points) {
  const map = new Map();
  for (const point of points) map.set(point.time, point);
  return [...map.values()].sort((left, right) => left.time - right.time);
}

async function readJson(url, service, fetchImpl) {
  try {
    const body = await requestJson(url, { fetchImpl, timeoutMs: 12000, service });
    return { ok: true, body, status: 200 };
  } catch (error) {
    return { ok: false, status: Number(error?.status) || 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function pageOkx(fetchImpl, pace) {
  const points = [];
  let end = Date.now();
  for (let page = 0; page < PAGE_LIMITS.okx; page += 1) {
    await pace();
    const result = await readJson(`${OKX_BASE}/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1H&end=${end}`, "OKX", fetchImpl);
    if (!result.ok) return { points: dedupe(points), status: result.status, error: result.error };
    const batch = parseOkxOiHistory(result.body);
    if (!batch.length) break;
    points.push(...batch);
    const oldest = Math.min(...batch.map((point) => point.time));
    if (!(oldest < end)) break;
    end = oldest - 1;
  }
  return { points: dedupe(points), status: 200, error: "" };
}

async function pageBinance(fetchImpl, pace) {
  const points = [];
  let end = Date.now();
  for (let page = 0; page < PAGE_LIMITS.binance; page += 1) {
    await pace();
    const result = await readJson(`${BINANCE_FAPI}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=500&endTime=${end}`, "Binance", fetchImpl);
    if (!result.ok) return { points: dedupe(points), status: result.status, error: result.error };
    const batch = parseBinanceOiHistory(result.body);
    if (!batch.length) break;
    points.push(...batch);
    const oldest = Math.min(...batch.map((point) => point.time));
    if (!(oldest < end)) break;
    end = oldest - 1;
  }
  return { points: dedupe(points), status: 200, error: "" };
}

async function pageBybit(fetchImpl, pace) {
  const points = [];
  let cursor = "";
  for (let page = 0; page < PAGE_LIMITS.bybit; page += 1) {
    await pace();
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const result = await readJson(`${BYBIT_BASE}/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=200${suffix}`, "Bybit", fetchImpl);
    if (!result.ok) return { points: dedupe(points), status: result.status, error: result.error };
    const batch = parseBybitOiHistory(result.body);
    points.push(...batch.points);
    if (!batch.cursor || batch.cursor === cursor || !batch.points.length) break;
    cursor = batch.cursor;
  }
  return { points: dedupe(points), status: 200, error: "" };
}

function venueState(id, instrument, result, role) {
  return {
    id,
    instrument,
    role,
    status: result.status && result.status !== 200 ? `http-${result.status}` : (result.error ? "unavailable" : "ok"),
    error: result.error || "",
  };
}

export function assembleLiquidity({ okx, binance, bybit, funding, ratios, now = Date.now() }) {
  const okxPoints = dedupe(okx?.points || []);
  const venues = [
    venueState("okx", "BTC-USDT-SWAP", okx || {}, "cluster-source"),
    venueState("binance", "BTCUSDT USD-M", binance || {}, "listed separately"),
    venueState("bybit", "BTCUSDT linear", bybit || {}, "listed separately"),
  ];
  const clusterReady = venues[0].status === "ok" && okxPoints.length > 1;
  const anyListed = venues.some((venue) => venue.status === "ok");
  let status = "unavailable";
  if (clusterReady && venues.every((venue) => venue.status === "ok")) status = "ok";
  else if (anyListed) status = "partial";
  const newest = okxPoints.at(-1)?.time ?? null;
  return {
    symbol: "BTCUSDT",
    status,
    updatedAt: now,
    stale: !newest || now - newest > 2 * 60 * 60 * 1000,
    model: LIQUIDATION_MODEL,
    clusterSource: "okx",
    oi: {
      okx: okxPoints,
      binance: dedupe(binance?.points || []),
      bybit: dedupe(bybit?.points || []),
    },
    coverage: coverageWindows(okxPoints),
    funding: (funding || []).map(fundingView).filter(Boolean),
    accountRatios: (ratios || []).map(accountRatioView),
    venues,
    realisedPrints: [],
    limitations: LIMITATIONS,
    chartsRemain: true,
  };
}

async function fundingAndRatios(fetchImpl, pace) {
  await pace();
  const okxCurrent = await readJson(`${OKX_BASE}/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`, "OKX", fetchImpl);
  await pace();
  const okxHistory = await readJson(`${OKX_BASE}/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=8`, "OKX", fetchImpl);
  await pace();
  const okxRatio = await readJson(`${OKX_BASE}/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1H`, "OKX", fetchImpl);
  await pace();
  const binancePremium = await readJson(`${BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=BTCUSDT`, "Binance", fetchImpl);
  await pace();
  const binanceFunding = await readJson(`${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=8`, "Binance", fetchImpl);
  await pace();
  const binanceRatio = await readJson(`${BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`, "Binance", fetchImpl);
  await pace();
  const bybitFunding = await readJson(`${BYBIT_BASE}/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=8`, "Bybit", fetchImpl);
  await pace();
  const bybitTicker = await readJson(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=BTCUSDT`, "Bybit", fetchImpl);
  await pace();
  const bybitRatio = await readJson(`${BYBIT_BASE}/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=1`, "Bybit", fetchImpl);
  return { okxCurrent, okxHistory, okxRatio, binancePremium, binanceFunding, binanceRatio, bybitFunding, bybitTicker, bybitRatio };
}

function pushFunding(list, row) {
  const view = fundingView(row);
  if (view) list.push(view);
}

export function fundingFromPayloads(payloads) {
  const funding = [];
  const okxHistory = Array.isArray(payloads.okxHistory?.body?.data) ? payloads.okxHistory.body.data : [];
  const current = payloads.okxCurrent?.body?.data?.[0];
  if (current) {
    const intervalHours = intervalHoursFrom([current.prevFundingTime, current.fundingTime]);
    pushFunding(funding, {
      venue: "OKX",
      instrument: "BTC-USDT-SWAP",
      rate: current.fundingRate,
      intervalHours,
      timestamp: Number(current.fundingTime),
      kind: "estimate",
    });
    if (!okxHistory.length) {
      pushFunding(funding, {
        venue: "OKX",
        instrument: "BTC-USDT-SWAP",
        rate: current.settFundingRate,
        intervalHours,
        timestamp: Number(current.prevFundingTime),
        kind: "settled",
      });
    }
  }
  const okxTimes = okxHistory.map((row) => Number(row.fundingTime));
  const okxHours = intervalHoursFrom(okxTimes);
  for (const row of okxHistory) {
    pushFunding(funding, {
      venue: "OKX",
      instrument: row.instId,
      rate: row.realizedRate ?? row.fundingRate,
      intervalHours: okxHours,
      timestamp: Number(row.fundingTime),
      kind: "settled",
    });
  }
  const premium = payloads.binancePremium?.body;
  const binanceHistory = Array.isArray(payloads.binanceFunding?.body) ? payloads.binanceFunding.body : [];
  const binanceHours = intervalHoursFrom(binanceHistory.map((row) => Number(row.fundingTime)));
  if (premium?.lastFundingRate) {
    pushFunding(funding, {
      venue: "Binance",
      instrument: "BTCUSDT USD-M",
      rate: premium.lastFundingRate,
      intervalHours: binanceHours,
      timestamp: Number(premium.nextFundingTime) || Number(premium.time),
      kind: "estimate",
    });
  }
  for (const row of binanceHistory) {
    pushFunding(funding, {
      venue: "Binance",
      instrument: "BTCUSDT USD-M",
      rate: row.fundingRate,
      intervalHours: binanceHours,
      timestamp: Number(row.fundingTime),
      kind: "settled",
    });
  }
  const bybitRows = Array.isArray(payloads.bybitFunding?.body?.result?.list) ? payloads.bybitFunding.body.result.list : [];
  const ticker = payloads.bybitTicker?.body?.result?.list?.[0];
  const bybitHours = intervalHoursFrom([
    ...bybitRows.map((row) => Number(row.fundingRateTimestamp)),
    Number(ticker?.nextFundingTime),
  ]);
  if (ticker?.fundingRate) {
    pushFunding(funding, {
      venue: "Bybit",
      instrument: "BTCUSDT linear",
      rate: ticker.fundingRate,
      intervalHours: bybitHours,
      timestamp: Number(ticker.nextFundingTime),
      kind: "estimate",
    });
  }
  for (const row of bybitRows) {
    pushFunding(funding, {
      venue: "Bybit",
      instrument: "BTCUSDT linear",
      rate: row.fundingRate,
      intervalHours: bybitHours,
      timestamp: Number(row.fundingRateTimestamp),
      kind: "settled",
    });
  }
  return funding;
}

export function ratiosFromPayloads(payloads) {
  const ratios = [];
  const okxRow = payloads.okxRatio?.ok ? payloads.okxRatio.body?.data?.[0] : null;
  ratios.push(okxRow ? {
    venue: "OKX",
    instrument: "BTC",
    timestamp: Number(okxRow[0]),
    longShortRatio: Number(okxRow[1]),
    definition: "OKX long/short account ratio: net-long accounts divided by net-short accounts.",
  } : { unavailable: true, venue: "OKX", instrument: "BTC", reason: payloads.okxRatio?.error || "Account ratio is unavailable." });
  const binanceRow = payloads.binanceRatio?.ok ? payloads.binanceRatio.body?.[0] : null;
  ratios.push(binanceRow ? {
    venue: "Binance",
    instrument: "BTCUSDT USD-M",
    timestamp: Number(binanceRow.timestamp),
    longShortRatio: Number(binanceRow.longShortRatio),
    longAccount: Number(binanceRow.longAccount),
    shortAccount: Number(binanceRow.shortAccount),
    definition: "Binance global long/short account ratio. The fractions count accounts, not position size.",
  } : { unavailable: true, venue: "Binance", instrument: "BTCUSDT USD-M", reason: payloads.binanceRatio?.error || "Account ratio is unavailable." });
  const bybitRow = payloads.bybitRatio?.ok ? payloads.bybitRatio.body?.result?.list?.[0] : null;
  ratios.push(bybitRow ? {
    venue: "Bybit",
    instrument: "BTCUSDT linear",
    timestamp: Number(bybitRow.timestamp),
    longAccount: Number(bybitRow.buyRatio),
    shortAccount: Number(bybitRow.sellRatio),
    definition: "Bybit account ratio buyRatio and sellRatio. These count accounts, not position size.",
  } : { unavailable: true, venue: "Bybit", instrument: "BTCUSDT linear", reason: payloads.bybitRatio?.error || "Account ratio is unavailable." });
  return ratios;
}

export async function loadLiquidity(symbol = "BTCUSDT", options = {}) {
  if (symbol !== "BTCUSDT") {
    return { symbol, status: "unavailable", reason: "The liquidation model is limited to BTC.", oi: { okx: [], binance: [], bybit: [] }, funding: [], accountRatios: [], realisedPrints: [], limitations: LIMITATIONS, chartsRemain: true };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now();
  if (!options.fetchImpl && memory.body && memory.symbol === symbol && now - memory.at < CACHE_MS) return memory.body;
  if (!options.fetchImpl && memory.inflight) return memory.inflight;
  const run = (async () => {
    const pace = createPacer(250);
    const [okx, binance, bybit, payloads] = await Promise.all([
      pageOkx(fetchImpl, pace),
      pageBinance(fetchImpl, pace),
      pageBybit(fetchImpl, pace),
      fundingAndRatios(fetchImpl, pace),
    ]);
    return assembleLiquidity({
      okx,
      binance,
      bybit,
      funding: fundingFromPayloads(payloads),
      ratios: ratiosFromPayloads(payloads),
      now,
    });
  })();
  if (!options.fetchImpl) {
    memory.inflight = run.then((body) => {
      memory = { at: now, symbol, body, inflight: null };
      return body;
    }).catch((error) => {
      memory.inflight = null;
      if (memory.body) return { ...memory.body, stale: true, status: "partial", error: error instanceof Error ? error.message : String(error) };
      throw error;
    });
    return memory.inflight;
  }
  return run;
}
