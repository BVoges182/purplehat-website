import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { COINS } from "../../shared/coins.js";
import { DATA_CORRECTION_VERSION } from "../../shared/candleIntegrity.js";
import { redact } from "./alerts.js";
import { createApp } from "./app.js";
import { applyPendingCorrections } from "./candleCorrection.js";
import { candleRepairApplied, markCandleRepair, openDatabase, pendingCandleCorrections } from "./db.js";
import { armCloseScan, armIntervalScan } from "./closeScan.js";
import { evaluateAll } from "./evaluate.js";
import { installStaleRecovery, refreshAll, resolveVenues } from "./refresh.js";
import { refreshZigzag30 } from "./zigzag30.js";
import { startZigzagBackfill } from "./zigzagBackfill.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

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
  const commit = options.commit ?? readCommit();
  const app = createApp(db, { basePath, commit });
  if (options.redirectRoot && basePath) {
    app.get("/", (_req, res) => {
      res.redirect(302, `${basePath}/`);
    });
  }
  installStaleRecovery(() => refreshAll(db, COINS, { funding: true, monthly: true }));
  const server = app.listen(port, host, () => {
    const shown = basePath || "";
    console.log(`Purple Hat Trading API on http://${host}:${port}${shown}`);
    console.log("Close-aligned scans run while this API process is up. They stop when the process stops.");
    armCloseScan(() => evaluateAll(db).catch((error) => {
      console.error(`Close scan failed: ${redact(error instanceof Error ? error.message : String(error))}`);
    }));
    armIntervalScan("30m", () => refreshZigzag30(db).catch((error) => {
      console.error(`30m batch failed: ${redact(error instanceof Error ? error.message : String(error))}`);
    }));
    if (options.backfill !== false) startZigzagBackfill(db);
    if (options.warmup === false) return;
    resolveVenues(db)
      .then(async (venues) => {
        const unavailable = venues.filter((venue) => venue.provider === "unavailable").map((venue) => venue.id);
        const fallback = venues.filter((venue) => venue.provider === "hyperliquid").map((venue) => venue.id);
        if (fallback.length) console.log(`Hyperliquid fallback: ${fallback.join(", ")}`);
        if (unavailable.length) console.log(`Unavailable coins: ${unavailable.join(", ")}`);
        if (candleRepairApplied(db, DATA_CORRECTION_VERSION)) return refreshAll(db, COINS, { monthly: true });
        console.log(`Applying candle repair ${DATA_CORRECTION_VERSION}`);
        const repaired = await refreshAll(db, COINS, { force: true, monthly: true });
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
        evaluateAll(db, { refresh: async () => {} }).catch((error) => {
          console.error(`Startup scan failed: ${redact(error instanceof Error ? error.message : String(error))}`);
        });
      });
  });

  if (process.env.ALERTS_CRON_ENABLED === "true") {
    console.log("Signal checks follow the 4H and Daily close. The 2-minute loop stays off.");
  }
  return server;
}

if (directRun()) boot();
