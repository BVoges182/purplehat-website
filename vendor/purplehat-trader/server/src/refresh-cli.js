import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { openDatabase } from "./db.js";
import { refreshAll } from "./refresh.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");
const db = openDatabase(file);
const results = await refreshAll(db);
for (const result of results) {
  const summary = result.intervals.map((item) => `${item.interval}:${item.fetched ?? item.error}`).join(" ");
  console.log(`${result.symbol} ${summary}`);
}
db.close();
