import { COINS } from "../../shared/coins.js";
import { DYNAMIC_TARGET_VERSION, PLAYBOOK_1, allowedRewardRisk, playbookById, simulateMarket, indicatorRows, summarizeTrades, tradeRows } from "../../shared/playbook.js";
import { BACKTEST_DISCLAIMER } from "./backtest.js";
import { fetchKlineHistory } from "./playbook-history.js";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const cache = new Map();

export function clearPlaybookCache() {
  cache.clear();
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function resolveSymbol(value) {
  const text = String(value || "").trim();
  const coin = COINS.find((item) => (
    item.id.toLowerCase() === text.toLowerCase() || item.symbol.toLowerCase() === text.toLowerCase()
  ));
  if (!coin) throw fail("Unknown coin");
  return coin.symbol;
}

export async function runPlaybookBacktest(input = {}, deps = {}) {
  const playbook = playbookById(input.playbookId || PLAYBOOK_1.id);
  if (!playbook) throw fail("Unknown playbook");
  const years = Number(input.years ?? 3);
  if (![1, 2, 3].includes(years)) throw fail("Range must be 1, 2, or 3 years");
  const symbol = resolveSymbol(input.symbol || "BTCUSDT");
  const interval = input.interval || playbook.timeframe;
  if (!playbook.enabledTimeframes.includes(interval)) throw fail("Playbook is not enabled on this timeframe yet");
  const rewardRisk = input.rewardRisk == null ? allowedRewardRisk(playbook.rewardRisk) : Number(input.rewardRisk);
  if (rewardRisk !== 2 && rewardRisk !== 3) throw fail("Risk/reward must be 2 or 3");
  const key = `${playbook.id}|${symbol}|${interval}|${years}|${rewardRisk}`;
  if (!input.refresh && cache.has(key)) return { ...cache.get(key), cached: true };
  const now = deps.now ?? Date.now();
  const startTime = now - years * YEAR_MS;
  const fetchHistory = deps.fetchKlineHistory || fetchKlineHistory;
  const candles = await fetchHistory({ symbol, interval, startTime, endTime: now, now });
  const shared = simulateMarket(indicatorRows(candles, playbook, now), {
    rewardRisk,
    strategyVersion: DYNAMIC_TARGET_VERSION,
  });
  const trades = shared.trades.filter((trade) => trade.playbookId === playbook.id);
  const metrics = summarizeTrades(trades);
  const report = {
    playbook: {
      id: playbook.id,
      name: playbook.name,
      version: playbook.version || 1,
      direction: playbook.direction || "long",
      timeframe: interval,
      rewardRisk,
      trigger: playbook.trigger,
      entry: playbook.entry,
      exit: playbook.exit,
    },
    symbol,
    interval,
    years,
    rewardRisk,
    direction: playbook.direction || "long",
    playbookVersion: playbook.version || 1,
    strategyVersion: DYNAMIC_TARGET_VERSION,
    targetRule: "dynamic-bands",
    candles: candles.length,
    from: candles[0]?.openTime ?? null,
    to: candles[candles.length - 1]?.openTime ?? null,
    metrics,
    trades: tradeRows(trades),
    equity: metrics.equity,
    backtest: true,
    label: "Backtested. Not a trade that was taken.",
    cached: false,
    disclaimer: BACKTEST_DISCLAIMER,
  };
  cache.set(key, report);
  return report;
}
