import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPacer } from "./backoff.js";
import { openDatabase } from "./db.js";
import { backfillNetPosition } from "./futuresMetrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");

function arg(name) {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : "";
}

const fromText = arg("from");
const toText = arg("to");
const from = fromText ? Date.parse(fromText) : undefined;
const to = toText ? Date.parse(toText) : undefined;
const db = openDatabase(file);
const result = await backfillNetPosition(db, {
  from: Number.isFinite(from) ? from : undefined,
  to: Number.isFinite(to) ? to : undefined,
  pace: createPacer(250),
});
console.log(`Net-position backfill read ${result.files} files. 4h bars ${result.computed["4h"]}. Daily bars ${result.computed["1d"]}.`);
db.close();
