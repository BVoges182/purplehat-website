import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPacer } from "./backoff.js";
import { openDatabase } from "./db.js";
import { backfillFunding } from "./futuresMetrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");
const db = openDatabase(file);
const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
const from = fromArg ? Date.parse(fromArg.slice("--from=".length)) : undefined;
const result = await backfillFunding(db, { from, pace: createPacer(250) });
console.log(`Funding backfill stored ${result.fetched} prints.`);
db.close();
