import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { COINS, coinById } from "../../shared/coins.js";
import { PLAYBOOK_1, PLAYBOOKS, listPlaybooks, playbookById } from "../../shared/playbook.js";
import { requireBasicAuth } from "./auth.js";
import { runStoredBacktest } from "./backtest.js";
import { runPlaybookBacktest } from "./playbook-backtest.js";
import { dismissSignal, listUnreadNotifications, markNotificationRead, querySignals } from "./db.js";
import { evaluateAll } from "./evaluate.js";
import { monthlyOpensFor } from "./monthlyOpens.js";
import { saveRewardRisk } from "./playbook-store.js";
import { loadLiquidity } from "./liquidity.js";
import { loadCoin, refreshAll } from "./refresh.js";
import { filterScanner, overviewCoins, scanCoins } from "./scanner.js";
import { getSettings, saveSettings } from "./settings-store.js";

const APP_VERSION = "phase-5";
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

function signalSymbol(value) {
  if (!value) return null;
  const byId = coinById(value);
  if (byId) return byId.symbol;
  const bySymbol = COINS.find((coin) => coin.symbol.toLowerCase() === String(value).toLowerCase());
  return bySymbol ? bySymbol.symbol : value;
}

export function normalizeBase(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

function clientRoute(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (req.path === "/api" || req.path.startsWith("/api/") || req.path === "/healthz") return false;
  if (path.extname(req.path)) return false;
  return true;
}

export function createTraderRouter(db, deps = {}) {
  const router = express.Router();
  const runEvaluation = deps.evaluateAll || evaluateAll;
  const runPlaybook = deps.runPlaybookBacktest || runPlaybookBacktest;
  router.use(cors());
  router.use(express.json({ limit: "32kb" }));
  router.use((req, res, next) => {
    if (req.path === "/api/health" || req.path === "/healthz") {
      next();
      return;
    }
    requireBasicAuth(req, res, next);
  });
  const health = (_req, res) => {
    try {
      db.prepare("SELECT 1 AS ok").get();
      res.json({ ok: true, db: "up", version: APP_VERSION });
    } catch {
      res.status(503).json({ ok: false, db: "down" });
    }
  };
  router.get("/api/health", health);
  router.get("/healthz", health);
  router.get("/api/coins", (_req, res) => res.json({ coins: COINS }));
  router.get("/api/overview", (req, res) => {
    const requested = String(req.query.coin || "").trim();
    if (!requested) {
      res.json({ coins: overviewCoins(db) });
      return;
    }
    const coin = coinById(requested);
    if (!coin) {
      res.status(404).json({ error: "Unknown coin" });
      return;
    }
    res.json({ coin: overviewCoins(db, [coin])[0] });
  });
  router.get("/api/monthly-opens", async (req, res) => {
    const coin = coinById(req.query.coin || req.query.symbol || "");
    if (!coin) {
      res.status(404).json({ error: "Unknown coin" });
      return;
    }
    try {
      const load = deps.monthlyOpens || ((item, extra) => monthlyOpensFor(db, item, extra));
      const opens = await load(coin, {});
      res.json({ symbol: coin.symbol, opens });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.get("/api/dashboard", async (req, res) => {
    const coin = coinById(req.query.coin || "BTC");
    if (!coin) {
      res.status(404).json({ error: "Unknown coin" });
      return;
    }
    try {
      res.json(await loadCoin(db, coin));
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.get("/api/candles", (req, res) => {
    const symbol = signalSymbol(req.query.symbol);
    const coin = COINS.find((item) => item.symbol === symbol);
    const interval = req.query.interval === "1d" ? "1d" : "4h";
    if (!coin) {
      res.status(404).json({ error: "Unknown symbol" });
      return;
    }
    res.json({ symbol: coin.symbol, interval, candles: loadSeries(db, coin.symbol, interval) });
  });
  router.get("/api/liquidity", async (req, res) => {
    const symbol = signalSymbol(req.query.symbol) || "BTCUSDT";
    try {
      const body = await (deps.loadLiquidity || loadLiquidity)(symbol);
      res.json(body);
    } catch (error) {
      res.json({
        symbol,
        status: "unavailable",
        error: error instanceof Error ? error.message : String(error),
        oi: { okx: [], binance: [], bybit: [] },
        funding: [],
        accountRatios: [],
        realisedPrints: [],
        limitations: [],
        chartsRemain: true,
      });
    }
  });
  router.get("/api/candles/refresh", async (req, res) => {
    try {
      if (!req.query.symbol) {
        res.json({ results: await refreshAll(db) });
        return;
      }
      const coin = COINS.find((item) => item.symbol === req.query.symbol || item.id.toLowerCase() === String(req.query.symbol).toLowerCase());
      if (!coin) {
        res.status(404).json({ error: "Unknown symbol" });
        return;
      }
      const dashboard = await loadCoin(db, coin, { force: true });
      if (req.query.scan === "1") {
        await runEvaluation(db, { coins: [coin], refresh: async () => {} });
      }
      res.json({ ...dashboard, source: dashboard.error ? dashboard.source : "live" });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.get("/api/scanner", async (req, res) => {
    try {
      const filter = ["BUY", "SELL", "divergence"].includes(req.query.filter) ? req.query.filter : "";
      const rows = await (deps.scanCoins || scanCoins)(db);
      res.json({ coins: filterScanner(rows, filter) });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.get("/api/signals", (req, res) => {
    const view = ["active", "recent", "dismissed", "overview"].includes(req.query.view) ? req.query.view : "active";
    const side = req.query.side === "BUY" || req.query.side === "SELL" ? req.query.side : "";
    const family = ["bb", "rsi", "divergence", "rejection"].includes(req.query.family) ? req.query.family : "";
    res.json({
      signals: querySignals(db, {
        symbol: signalSymbol(req.query.symbol),
        view,
        side,
        family,
        limit: view === "recent" ? 40 : 100,
      }),
    });
  });
  router.post("/api/signals/dismiss", (req, res) => {
    const id = req.body?.id;
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Signal id is required" });
      return;
    }
    dismissSignal(db, id);
    res.json({ ok: true, id });
  });
  router.get("/api/notifications/unread", (_req, res) => {
    res.json({ notifications: listUnreadNotifications(db) });
  });
  router.post("/api/notifications/read", (req, res) => {
    const id = req.body?.id;
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Signal id is required" });
      return;
    }
    markNotificationRead(db, id);
    res.json({ ok: true, id });
  });
  router.get("/api/settings", (_req, res) => {
    res.json({ settings: getSettings(db) });
  });
  router.put("/api/settings", (req, res) => {
    const result = saveSettings(db, req.body || {});
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    res.json({ settings: result.settings });
  });
  router.post("/api/settings/re-evaluate", async (_req, res) => {
    try {
      const result = await runEvaluation(db);
      res.json({
        evaluated: result.evaluated,
        skipped: result.skipped,
        created: result.created,
      });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.post("/api/jobs/evaluate", async (req, res) => {
    const secret = process.env.EVAL_JOB_SECRET;
    if (!secret || req.get("x-eval-secret") !== secret) {
      res.status(401).json({ error: "Evaluation secret is invalid" });
      return;
    }
    try {
      const result = await runEvaluation(db);
      res.json({ evaluated: result.evaluated, skipped: result.skipped, created: result.created });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  router.post("/api/backtest", (req, res) => {
    try {
      res.json(runStoredBacktest(db, req.body || {}));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });
  router.get("/api/playbooks", (_req, res) => {
    res.json({ playbooks: listPlaybooks() });
  });
  router.post("/api/playbooks/ratio", (req, res) => {
    const body = req.body || {};
    const coin = coinById(body.coin || body.coinId || "");
    const symbol = coin?.symbol || (typeof body.symbol === "string" ? body.symbol : "");
    const timeframe = body.timeframe === "1d" ? "1d" : body.timeframe === "4h" ? "4h" : "";
    const raw = Number(body.rewardRisk);
    if (!symbol || !timeframe) {
      res.status(400).json({ error: "Unknown coin or timeframe" });
      return;
    }
    if (raw !== 2 && raw !== 3) {
      res.status(400).json({ error: "Risk/reward must be 2 or 3" });
      return;
    }
    if (body.playbookId && !playbookById(body.playbookId)) {
      res.status(400).json({ error: "Unknown playbook" });
      return;
    }
    const ids = body.playbookId ? [body.playbookId] : PLAYBOOKS.map((item) => item.id);
    for (const playbookId of ids) saveRewardRisk(db, { symbol, timeframe, playbookId, rewardRisk: raw });
    res.json({ symbol, timeframe, playbookId: body.playbookId || PLAYBOOK_1.id, rewardRisk: raw });
  });
  router.post("/api/playbooks/backtest", async (req, res) => {
    try {
      res.json(await runPlaybook(req.body || {}));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });
  const staticDir = deps.staticDir === undefined ? distDir : deps.staticDir;
  const indexFile = staticDir ? path.join(staticDir, "index.html") : "";
  const hasIndex = Boolean(indexFile && fs.existsSync(indexFile));
  if (staticDir && fs.existsSync(staticDir)) {
    router.use(express.static(staticDir, { index: hasIndex ? "index.html" : false }));
  }
  if (hasIndex) {
    router.use((req, res, next) => {
      if (!clientRoute(req)) {
        next();
        return;
      }
      res.sendFile(indexFile);
    });
  }
  router.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  return router;
}

export function createApp(db, deps = {}) {
  const app = express();
  const basePath = normalizeBase(deps.basePath ?? "");
  const router = createTraderRouter(db, deps);
  if (basePath) app.use(basePath, router);
  else app.use(router);
  return app;
}

export function mountTrader(parent, db, deps = {}) {
  const basePath = normalizeBase(deps.basePath || "/trader");
  parent.use(basePath, createTraderRouter(db, deps));
  return parent;
}

function loadSeries(db, symbol, interval) {
  return db.prepare(`
    SELECT open_time AS openTime, open, high, low, close, volume, close_time AS closeTime
    FROM candles WHERE symbol = ? AND interval = ? ORDER BY open_time
  `).all(symbol, interval);
}
