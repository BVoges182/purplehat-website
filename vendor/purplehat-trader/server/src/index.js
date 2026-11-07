import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { schedule } from "node-cron";
import { COINS } from "../../shared/coins.js";
import { DATA_CORRECTION_VERSION } from "../../shared/candleIntegrity.js";
import { redact } from "./alerts.js";
import { createApp } from "./app.js";
import { applyPendingCorrections } from "./candleCorrection.js";
import { candleRepairApplied, markCandleRepair, openDatabase, pendingCandleCorrections } from "./db.js";
import { armCloseScan } from "./closeScan.js";
import { evaluateAll } from "./evaluate.js";
import { refreshAll, resolveVenues } from "./refresh.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function directRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

export function boot(options = {}) {
  dotenv.config({ path: path.join(root, ".env") });
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || "server/data/trading.sqlite";
  const file = path.resolve(root, databaseUrl);
  const db = openDatabase(file);
  const port = Number(options.port ?? process.env.PORT ?? 8792);
  const host = options.host || process.env.HOST || "0.0.0.0";
  const basePath = options.basePath ?? "";
  const app = createApp(db, { basePath });
  if (options.redirectRoot && basePath) {
    app.get("/", (_req, res) => {
      res.redirect(302, `${basePath}/`);
    });
  }
  const server = app.listen(port, host, () => {
    const shown = basePath || "";
    console.log(`Purple Hat Trading API on http://${host}:${port}${shown}`);
    if (options.warmup === false) return;
    resolveVenues(db)
      .then(async (venues) => {
        const unavailable = venues.filter((venue) => venue.provider === "unavailable").map((venue) => venue.id);
        const fallback = venues.filter((venue) => venue.provider === "hyperliquid").map((venue) => venue.id);
        if (fallback.length) console.log(`Hyperliquid fallback: ${fallback.join(", ")}`);
        if (unavailable.length) console.log(`Unavailable coins: ${unavailable.join(", ")}`);
        if (candleRepairApplied(db, DATA_CORRECTION_VERSION)) return refreshAll(db);
        console.log(`Applying candle repair ${DATA_CORRECTION_VERSION}`);
        const repaired = await refreshAll(db, COINS, { force: true });
        applyPendingCorrections(db);
        const pending = pendingCandleCorrections(db, DATA_CORRECTION_VERSION);
        const failed = repaired.filter((row) => row.error || (row.intervals || []).some((item) => item.error));
        if (pending.length || failed.length) {
          const names = failed.map((row) => `${row.symbol}${row.error ? `: ${row.error}` : ""}`).join(", ");
          console.error(`Candle repair ${DATA_CORRECTION_VERSION} incomplete. Pending ${pending.length}. Failed: ${names || "none"}`);
          return repaired;
        }
        markCandleRepair(db, DATA_CORRECTION_VERSION);
        console.log(`Candle repair ${DATA_CORRECTION_VERSION} applied`);
        return repaired;
      })
      .catch((error) => {
        console.error(`Market warm-up failed: ${redact(error instanceof Error ? error.message : String(error))}`);
      })
      .finally(() => {
        // Catch up missed closes for every watched symbol, then arm the next exchange close.
        // This runs only while the API process is up. It does not run after the process stops.
        console.log("Close-aligned scans run while this API process is up. They stop when the process stops.");
        evaluateAll(db, { refresh: async () => {} }).catch((error) => {
          console.error(`Startup scan failed: ${redact(error instanceof Error ? error.message : String(error))}`);
        }).finally(() => {
          armCloseScan(() => evaluateAll(db).catch((error) => {
            console.error(`Close scan failed: ${redact(error instanceof Error ? error.message : String(error))}`);
          }));
        });
      });
  });

  if (process.env.ALERTS_CRON_ENABLED === "true") {
    schedule("*/2 * * * *", () => {
      evaluateAll(db).catch((error) => {
        console.error(`Signal evaluation failed: ${redact(error instanceof Error ? error.message : String(error))}`);
      });
    });
    console.log("Signal evaluation every 2 minutes");
  }
  return server;
}

if (directRun()) boot();
