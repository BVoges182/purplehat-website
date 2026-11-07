import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { redact } from "./alerts.js";
import { openDatabase } from "./db.js";
import { evaluateAll } from "./evaluate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");
const db = openDatabase(file);
try {
  const result = await evaluateAll(db);
  const deliveries = result.deliveries
    .filter((item) => !item.skipped)
    .map((item) => ({ signalId: item.signalId, channel: item.channel, status: item.status }));
  console.log(JSON.stringify({
    evaluated: result.evaluated,
    skipped: result.skipped,
    created: result.created,
    deliveries,
  }, null, 2));
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  db.close();
}
