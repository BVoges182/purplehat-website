import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { COINS } from "../../shared/coins.js";
import { openDatabase } from "./db.js";
import { defaultFeeBps, defaultHoldBars, runStoredBacktest } from "./backtest.js";
import { redact } from "./alerts.js";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
const symbol = arg("symbol") || "BTCUSDT";
const interval = arg("interval") === "1d" ? "1d" : "4h";
const coin = COINS.find((item) => item.symbol === symbol || item.id.toLowerCase() === symbol.toLowerCase());
if (!coin) {
  console.error("Unknown symbol. Use a config id or pair, for example BTCUSDT or SOL.");
  process.exit(1);
}

const file = path.resolve(root, process.env.DATABASE_URL || "server/data/trading.sqlite");
const db = openDatabase(file);
try {
  const result = runStoredBacktest(db, {
    symbol: coin.symbol,
    interval,
    from: arg("from"),
    to: arg("to"),
    holdBars: arg("bars") == null ? defaultHoldBars(interval) : Number(arg("bars")),
    feeBps: arg("fee-bps") == null ? defaultFeeBps() : Number(arg("fee-bps")),
  });
  const metrics = result.metrics;
  const percent = (value) => (value == null ? "n/a" : `${(value * 100).toFixed(2)}%`);
  console.log(`${result.symbol} ${result.interval}`);
  console.log(`Trades ${metrics.trades}; win rate ${percent(metrics.winRate)}; average ${percent(metrics.averageReturn)}`);
  console.log(`Total ${percent(metrics.totalReturn)}; max drawdown ${percent(metrics.maxDrawdown)}; profit factor ${metrics.profitFactor ?? "n/a"}`);
  console.log(result.disclaimer);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
} finally {
  db.close();
}
