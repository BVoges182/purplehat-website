import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { redact } from "./alerts.js";
import { openDatabase } from "./db.js";
import { evaluateAll } from "./evaluate.js";
import { formatSast } from "../../shared/time.js";

export function workerIntervalMs(env = process.env) {
  const value = Number(env.EVAL_INTERVAL_MS || 120000);
  if (!Number.isInteger(value) || value < 10000) {
    throw new Error("EVAL_INTERVAL_MS must be an integer of at least 10000");
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  dotenv.config({ path: path.join(root, ".env") });
  let interval;
  try {
    interval = workerIntervalMs();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");
  let db;
  try {
    db = openDatabase(file);
  } catch (error) {
    console.error(`Worker database failed: ${redact(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
  console.log(`Signal worker every ${interval / 1000}s. Alerts stay off unless ALERTS_ENABLED=true.`);
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopped) {
    const started = Date.now();
    try {
      const result = await evaluateAll(db);
      const evaluated = result.evaluated.length ? result.evaluated.join(", ") : "none";
      const skipped = result.skipped.length ? result.skipped.join(", ") : "none";
      console.log(`${formatSast(started)} evaluated ${evaluated}; skipped ${skipped}; new signals ${result.created.length}`);
    } catch (error) {
      console.error(`${formatSast(started)} evaluate tick failed: ${redact(error instanceof Error ? error.message : String(error))}`);
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(0, interval - elapsed));
  }
  db.close();
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entry === import.meta.url) {
  main();
}
