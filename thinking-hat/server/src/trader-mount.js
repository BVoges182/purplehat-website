import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { storageRoot } from "./db.js";

// Pinned snapshot of purplehat-trading at 603b207. Do not edit files in vendor/.
const vendorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "vendor", "purplehat-trader");

export const TRADER_MIN_PASSWORD = 12;
const API_LIMIT = 30;
const PAGE_LIMIT = 120;
const REFRESH_LIMIT = 6;
const API_WINDOW_MS = 60 * 1000;
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

let traderDb = null;
let scanBusy = false;

function vendorUrl(relativePath) {
  return pathToFileURL(path.join(vendorRoot, relativePath)).href;
}

function cappedLimit(name, fallback, max) {
  const raw = Number(process.env[name]);
  if (!Number.isInteger(raw) || raw < 1) return fallback;
  return Math.min(raw, max);
}

export function traderPasswordConfigured(env = process.env) {
  return String(env.BASIC_AUTH_PASSWORD || "").trim().length >= TRADER_MIN_PASSWORD;
}

export function traderDatabaseFile() {
  return path.join(storageRoot(), "data", "trader.sqlite");
}

export function closeTrader() {
  const db = traderDb;
  traderDb = null;
  if (!db) return;
  try {
    db.close();
  } catch {
    // The file may already be closed during shutdown.
  }
}

function createHits() {
  const hits = new Map();
  return function allow(key, limit, windowMs) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
}

const apiHits = createHits();
const pageHits = createHits();
const refreshHits = createHits();

function traderUnavailable(_req, res) {
  res.status(503).json({ error: "Trader is not configured." });
}

function singleSymbol(value) {
  if (Array.isArray(value) || typeof value !== "string") return false;
  const symbol = value.trim();
  return symbol.length > 0 && symbol.length <= 20 && !/[,\s]/.test(symbol);
}

function isScan(req) {
  if (req.method === "GET" && (req.path === "/api/candles/refresh" || req.path === "/api/scanner")) return true;
  if (req.method === "POST" && (req.path === "/api/settings/re-evaluate" || req.path === "/api/jobs/evaluate")) return true;
  return false;
}

function traderGuards(req, res, next) {
  if (req.path === "/api/health" || req.path === "/healthz") {
    next();
    return;
  }
  const api = req.path === "/api" || req.path.startsWith("/api/");
  const limit = api
    ? cappedLimit("TRADER_API_LIMIT", API_LIMIT, API_LIMIT)
    : cappedLimit("TRADER_PAGE_LIMIT", PAGE_LIMIT, PAGE_LIMIT);
  const bucket = api ? apiHits : pageHits;
  if (!bucket(req.ip || "unknown", limit, API_WINDOW_MS)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: api ? "Too many Trader API requests." : "Too many Trader page requests." });
    return;
  }
  if (req.method === "GET" && req.path === "/api/candles/refresh") {
    const refreshLimit = cappedLimit("TRADER_REFRESH_LIMIT", REFRESH_LIMIT, REFRESH_LIMIT);
    if (!refreshHits(req.ip || "unknown", refreshLimit, REFRESH_WINDOW_MS)) {
      res.set("Retry-After", "600");
      res.status(429).json({ error: "Too many refresh requests." });
      return;
    }
    if (!singleSymbol(req.query.symbol)) {
      res.status(400).json({ error: "Refresh one symbol at a time." });
      return;
    }
  }
  if (!isScan(req)) {
    next();
    return;
  }
  if (scanBusy) {
    res.set("Retry-After", "5");
    res.status(429).json({ error: "A scan is already running." });
    return;
  }
  scanBusy = true;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    scanBusy = false;
  };
  res.on("finish", release);
  res.on("close", release);
  next();
}

function publicError(error) {
  const text = error instanceof Error ? error.message : String(error);
  const secret = String(process.env.BASIC_AUTH_PASSWORD || "").trim();
  const hidden = secret && text.includes(secret) ? "Trader request failed." : text;
  return hidden.slice(0, 300);
}

async function warmTrader(db) {
  const { redact } = await import(vendorUrl("server/src/alerts.js"));
  const { resolveVenues, refreshAll } = await import(vendorUrl("server/src/refresh.js"));
  const { evaluateAll } = await import(vendorUrl("server/src/evaluate.js"));
  const { armCloseScan } = await import(vendorUrl("server/src/closeScan.js"));
  const { applyPendingCorrections } = await import(vendorUrl("server/src/candleCorrection.js"));
  const { candleRepairApplied, markCandleRepair, pendingCandleCorrections } = await import(vendorUrl("server/src/db.js"));
  const { DATA_CORRECTION_VERSION } = await import(vendorUrl("shared/candleIntegrity.js"));
  const { COINS } = await import(vendorUrl("shared/coins.js"));
  const hide = (error) => redact(publicError(error));
  try {
    const venues = await resolveVenues(db);
    const unavailable = venues.filter((venue) => venue.provider === "unavailable").map((venue) => venue.id);
    const fallback = venues.filter((venue) => venue.provider === "hyperliquid").map((venue) => venue.id);
    if (fallback.length) console.log(`Hyperliquid fallback: ${fallback.join(", ")}`);
    if (unavailable.length) console.log(`Unavailable coins: ${unavailable.join(", ")}`);
    if (candleRepairApplied(db, DATA_CORRECTION_VERSION)) {
      await refreshAll(db);
    } else {
      console.log(`Applying candle repair ${DATA_CORRECTION_VERSION}`);
      const repaired = await refreshAll(db, COINS, { force: true });
      applyPendingCorrections(db);
      const pending = pendingCandleCorrections(db, DATA_CORRECTION_VERSION);
      const failed = repaired.filter((row) => row.error || (row.intervals || []).some((item) => item.error));
      if (pending.length || failed.length) {
        const names = failed.map((row) => `${row.symbol}${row.error ? `: ${row.error}` : ""}`).join(", ");
        console.error(`Candle repair ${DATA_CORRECTION_VERSION} incomplete. Pending ${pending.length}. Failed: ${hide(names || "none")}`);
      } else {
        markCandleRepair(db, DATA_CORRECTION_VERSION);
        console.log(`Candle repair ${DATA_CORRECTION_VERSION} applied`);
      }
    }
  } catch (error) {
    console.error(`Trader warm-up failed: ${hide(error)}`);
  } finally {
    console.log("Close-aligned scans run while this API process is up. They stop when the process stops.");
    evaluateAll(db, { refresh: async () => {} }).catch((error) => {
      console.error(`Startup scan failed: ${hide(error)}`);
    }).finally(() => {
      armCloseScan(() => evaluateAll(db).catch((error) => {
        console.error(`Close scan failed: ${hide(error)}`);
      }));
    });
  }
}

export async function mountWebsiteTrader(parent) {
  const file = traderDatabaseFile();
  if (!traderPasswordConfigured()) {
    parent.use("/trader", traderUnavailable);
    return { configured: false, file };
  }
  try {
    const { mountTrader } = await import(vendorUrl("server/src/app.js"));
    const { openDatabase } = await import(vendorUrl("server/src/db.js"));
    const db = openDatabase(file);
    traderDb = db;
    parent.use("/trader", traderGuards);
    mountTrader(parent, db, {
      basePath: "/trader",
      staticDir: path.join(vendorRoot, "dist"),
    });
    if (process.env.TRADER_WARMUP !== "0") warmTrader(db);
    return { configured: true, file };
  } catch (error) {
    closeTrader();
    console.error(`Trader mount failed. The accounting site will keep running. ${publicError(error)}`);
    parent.use("/trader", traderUnavailable);
    return { configured: false, file };
  }
}
