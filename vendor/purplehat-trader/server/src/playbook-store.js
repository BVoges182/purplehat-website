import { DYNAMIC_TARGET_VERSION, PLAYBOOK_1, PLAYBOOKS, allowedRewardRisk, indicatorRows, keepStoredResult, playbookById, recordedFillDrift, resumeFrozenOpen, simulateMarket, simulatePlaybook, tradeExits } from "../../shared/playbook.js";

const UPSERT = `
  INSERT INTO playbook_trades (
    id, symbol, coin_id, timeframe, playbook_id, signal_open_time,
    entry, tp1, tp2, stop, break_even, outcome, r, exit_open_time, exit_price, reward_risk, payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    symbol = excluded.symbol,
    coin_id = excluded.coin_id,
    timeframe = excluded.timeframe,
    playbook_id = excluded.playbook_id,
    signal_open_time = excluded.signal_open_time,
    entry = excluded.entry,
    tp1 = excluded.tp1,
    tp2 = excluded.tp2,
    stop = excluded.stop,
    break_even = excluded.break_even,
    outcome = excluded.outcome,
    r = excluded.r,
    exit_open_time = excluded.exit_open_time,
    exit_price = excluded.exit_price,
    reward_risk = excluded.reward_risk,
    payload = excluded.payload
`;

export function playbookTradeId(symbol, timeframe, playbookId, signalOpenTime) {
  return `${symbol}|${timeframe}|${playbookId}|${signalOpenTime}`;
}

function finalExitPrice(trade) {
  if (trade.outcome === "stopped") return Number(trade.stop);
  if (trade.outcome === "tp1-be") return Number(trade.breakEven);
  if (trade.outcome === "tp1-tp2") return Number(trade.tp2);
  return null;
}

function exitTimeOf(trade) {
  if (trade.exitTime != null) return trade.exitTime;
  if (trade.exitOpenTime == null) return null;
  return Math.floor(Number(trade.exitOpenTime) / 1000);
}

export function presentPlaybookTrade(trade, { symbol, coinId = null, timeframe, playbook = PLAYBOOK_1 } = {}) {
  const book = playbookById(trade.playbookId) || playbook;
  const playbookId = trade.playbookId || book.id;
  const signalOpenTime = trade.signalOpenTime ?? trade.entryOpenTime;
  const view = {
    id: playbookTradeId(symbol, timeframe, playbookId, signalOpenTime),
    symbol,
    coinId,
    timeframe,
    playbookId,
    playbookName: book.name,
    playbookVersion: trade.playbookVersion || book.version || 1,
    direction: trade.direction === "short" ? "short" : (book.direction === "short" ? "short" : "long"),
    signalOpenTime,
    entryOpenTime: signalOpenTime,
    entryTime: trade.entryTime,
    exitOpenTime: trade.exitOpenTime ?? null,
    exitTime: exitTimeOf(trade),
    entry: trade.entry,
    tp1: trade.tp1,
    tp2: trade.tp2,
    stop: trade.stop,
    breakEven: trade.breakEven,
    breakEvenFactor: trade.breakEvenFactor ?? book.breakEvenFactor,
    tp1Fraction: trade.tp1Fraction ?? book.tp1Fraction,
    tp2Fraction: trade.tp2Fraction ?? book.tp2Fraction,
    rewardRisk: allowedRewardRisk(trade.rewardRisk ?? playbook.rewardRisk),
    tp1Hit: !!trade.tp1Hit,
    outcome: trade.outcome,
    r: trade.r ?? null,
    durationBars: trade.durationBars ?? null,
    revisions: Array.isArray(trade.revisions) ? trade.revisions : [],
    projectedRewardRisk: Number.isFinite(Number(trade.projectedRewardRisk)) ? Number(trade.projectedRewardRisk) : null,
    dynamicSince: trade.dynamicSince ?? null,
    tp1Through: !!trade.tp1Through,
    tp2Through: !!trade.tp2Through,
    dataStatus: trade.dataStatus || null,
    dataCorrection: trade.dataCorrection || null,
    corrects: trade.corrects || null,
  };
  return { ...view, exits: tradeExits(view) };
}

export function readRewardRisk(db, symbol, timeframe, playbookId) {
  const row = db.prepare(`
    SELECT reward_risk AS rewardRisk FROM playbook_preferences
    WHERE symbol = ? AND timeframe = ? AND playbook_id = ?
  `).get(symbol, timeframe, playbookId);
  return allowedRewardRisk(row?.rewardRisk ?? 2);
}

export function saveRewardRisk(db, { symbol, timeframe, playbookId = PLAYBOOK_1.id, rewardRisk }) {
  const ratio = allowedRewardRisk(rewardRisk);
  db.prepare(`
    INSERT INTO playbook_preferences (symbol, timeframe, playbook_id, reward_risk)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol, timeframe, playbook_id) DO UPDATE SET
      reward_risk = excluded.reward_risk
  `).run(symbol, timeframe, playbookId, ratio);
  return ratio;
}

export function readPlaybookHistory(db, symbol, timeframe, playbookId) {
  const rows = db.prepare(`
    SELECT payload FROM playbook_trades
    WHERE symbol = ? AND timeframe = ? AND playbook_id = ?
    ORDER BY signal_open_time DESC
  `).all(symbol, timeframe, playbookId);
  const history = [];
  for (const row of rows) {
    try {
      const trade = JSON.parse(row.payload);
      if (!trade || trade.outcome === "waiting") continue;
      if (trade.dataStatus === "superseded-data-corrected" || (trade.outcome !== "open")) history.push(trade);
    } catch {
      // A damaged payload stays out of the list. The row is left in place.
    }
  }
  return history;
}

function storedRecords(db, symbol, timeframe, playbookId) {
  const rows = db.prepare(`
    SELECT id, signal_open_time AS signalOpenTime, reward_risk AS rewardRisk, outcome, entry, stop,
      exit_open_time AS exitOpenTime, exit_price AS exitPrice, payload
    FROM playbook_trades
    WHERE symbol = ? AND timeframe = ? AND playbook_id = ?
  `).all(symbol, timeframe, playbookId);
  const records = new Map();
  for (const row of rows) {
    let ratio = Number(row.rewardRisk);
    let outcome = row.outcome;
    if (ratio !== 2 && ratio !== 3) {
      try {
        const payload = JSON.parse(row.payload);
        ratio = Number(payload?.rewardRisk);
        outcome = outcome || payload?.outcome;
      } catch {
        ratio = 2;
      }
    }
    let playbookVersion = 1;
    let payload = null;
    try {
      payload = JSON.parse(row.payload);
      playbookVersion = Number(payload?.playbookVersion) || 1;
    } catch {
      payload = null;
    }
    const next = {
      id: row.id,
      signalOpenTime: Number(row.signalOpenTime),
      rewardRisk: ratio === 3 ? 3 : 2,
      outcome,
      playbookVersion,
      payload,
      dataStatus: payload?.dataStatus || null,
      dataCorrection: payload?.dataCorrection || null,
      entry: row.entry,
      stop: row.stop,
      exitOpenTime: row.exitOpenTime,
      exitPrice: row.exitPrice,
    };
    const current = records.get(Number(row.signalOpenTime));
    if (!current || recordRank(next) >= recordRank(current)) records.set(Number(row.signalOpenTime), next);
  }
  return records;
}

function recordRank(record) {
  if (record?.dataStatus === "data-corrected") return 2;
  if (record?.dataStatus === "superseded-data-corrected") return 0;
  return 1;
}

function runUpsert(upsert, view) {
  upsert.run(
    view.id,
    view.symbol,
    view.coinId,
    view.timeframe,
    view.playbookId,
    view.signalOpenTime,
    view.entry,
    view.tp1,
    view.tp2,
    view.stop,
    view.breakEven,
    view.outcome,
    view.r,
    view.exitOpenTime,
    finalExitPrice(view),
    view.rewardRisk,
    JSON.stringify(view),
  );
}

function stampSuperseded(db, stored, correctionVersion) {
  const payload = {
    ...(stored.payload || {}),
    dataStatus: "superseded-data-corrected",
    dataCorrection: correctionVersion,
  };
  db.prepare("UPDATE playbook_trades SET payload = ? WHERE id = ?").run(JSON.stringify(payload), stored.id);
}

export function reconcileCorrectedTrades(db, { records, setups, correctionVersion, correctedOpens, meta }) {
  if (!correctionVersion || !correctedOpens?.size) return;
  const earliest = Math.min(...correctedOpens);
  const upsert = db.prepare(UPSERT);
  for (const stored of records.values()) {
    if (stored.dataStatus === "superseded-data-corrected" || stored.dataStatus === "data-corrected") continue;
    const time = Number(stored.signalOpenTime);
    // A still-open fill is rebuilt only when its own signal candle was corrected.
    // Later candles can revise targets, and the carry replay also emits earlier copies of that same open.
    if (stored.outcome === "open" && !correctedOpens.has(time)) continue;
    const inWindow = time >= earliest || Number(stored.exitOpenTime) >= earliest || stored.outcome === "open";
    if (!inWindow) continue;
    const playbookId = stored.payload?.playbookId;
    const setup = (setups || []).filter((item) => {
      const itemPlaybook = item.playbookId || playbookId;
      const itemTime = Number(item.signalOpenTime ?? item.entryOpenTime);
      return itemPlaybook === playbookId && itemTime === time;
    }).at(-1) || null;
    const book = playbookById(playbookId) || meta.playbook || PLAYBOOK_1;
    const view = setup ? presentPlaybookTrade(setup, { ...meta, playbook: book }) : null;
    const drift = view ? recordedFillDrift(stored, view) : false;
    const touched = correctedOpens.has(time);
    if (view && !drift) continue;
    if (!view && !touched && stored.outcome !== "open") continue;
    if (!view && stored.outcome === "open" && !touched && time < earliest) continue;
    stampSuperseded(db, stored, correctionVersion);
    stored.dataStatus = "superseded-data-corrected";
    if (!view) continue;
    const rebuilt = {
      ...view,
      id: `${view.id}|${correctionVersion}`,
      dataStatus: "data-corrected",
      dataCorrection: correctionVersion,
      corrects: view.id,
    };
    runUpsert(upsert, rebuilt);
  }
  for (const setup of setups || []) {
    const time = Number(setup.signalOpenTime ?? setup.entryOpenTime);
    if (time < earliest) continue;
    const playbookId = setup.playbookId || meta.playbook?.id;
    if (records.has(Number(time)) && records.get(Number(time))?.payload?.playbookId === playbookId) continue;
    const already = [...records.values()].some((record) => record.payload?.playbookId === playbookId && Number(record.signalOpenTime) === time);
    if (already) continue;
    setup.dataStatus = "data-corrected";
    setup.dataCorrection = correctionVersion;
  }
}

function rememberBook(records) {
  const legacyOpenTimes = [];
  let carry = null;
  for (const [time, record] of records) {
    if (record.dataStatus === "superseded-data-corrected") continue;
    const version = Number(record.playbookVersion || 1);
    if (version < DYNAMIC_TARGET_VERSION && terminalOutcome(record.outcome)) legacyOpenTimes.push(Number(time));
    if (record.outcome !== "open" || !record.payload) continue;
    const payload = record.payload;
    if (!Number.isFinite(Number(payload.tp1)) || !Number.isFinite(Number(payload.tp2)) || !Number.isFinite(Number(payload.entry))) continue;
    carry = {
      signalOpenTime: Number(time),
      dynamicSince: payload.dynamicSince == null ? null : Number(payload.dynamicSince),
      state: { ...payload, signalOpenTime: Number(time), rewardRisk: record.rewardRisk },
    };
  }
  return { legacyOpenTimes, carry };
}

function terminalOutcome(outcome) {
  return outcome === "stopped" || outcome === "tp1-be" || outcome === "tp1-tp2";
}

function persistTrades(db, setups, { symbol, coinId = null, timeframe, playbook = PLAYBOOK_1 }) {
  const existing = storedRecords(db, symbol, timeframe, playbook.id);
  const upsert = db.prepare(UPSERT);
  db.exec("BEGIN");
  try {
    for (const setup of setups) {
      if (setup.outcome === "waiting") continue;
      const view = presentPlaybookTrade(setup, { symbol, coinId, timeframe, playbook });
      const stored = existing.get(Number(view.signalOpenTime));
      // A recorded trade keeps the ratio it was created with. A shorter candle window cannot reopen it.
      // A finished fill is not rewritten when a later candle correction only changes the replay.
      if (stored?.dataStatus === "superseded-data-corrected") continue;
      if (stored?.dataStatus === "data-corrected") {
        const live = {
          ...view,
          id: stored.id,
          dataStatus: "data-corrected",
          dataCorrection: stored.dataCorrection,
          corrects: stored.payload?.corrects || view.id,
        };
        if (keepStoredResult(stored, live)) continue;
        runUpsert(upsert, live);
        continue;
      }
      if (keepStoredResult(stored, view)) continue;
      runUpsert(upsert, view);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function comparisonSummary(rows, playbook, preference) {
  if (preference !== 3) return null;
  const compared = simulatePlaybook(rows, { ...playbook, rewardRisk: 3 }, { strategyVersion: DYNAMIC_TARGET_VERSION });
  return {
    rewardRisk: 3,
    trades: compared.report.trades,
    tradeCount: compared.report.trades,
    totalR: compared.report.totalR,
    averageR: compared.report.averageR,
  };
}

export function syncPlaybookRows(db, meta, rows) {
  const playbook = meta.playbook || PLAYBOOK_1;
  const preference = meta.rewardRisk == null
    ? readRewardRisk(db, meta.symbol, meta.timeframe, playbook.id)
    : allowedRewardRisk(meta.rewardRisk);
  const records = storedRecords(db, meta.symbol, meta.timeframe, playbook.id);
  const memory = rememberBook(records);
  const resumed = memory.carry ? resumeFrozenOpen(memory.carry.state, rows) : null;
  const legacyOpenTimes = memory.legacyOpenTimes.slice();
  let carry = null;
  if (resumed?.closed) legacyOpenTimes.push(Number(memory.carry.signalOpenTime));
  if (resumed && !resumed.closed && resumed.dynamicSince != null) {
    carry = {
      signalOpenTime: Number(memory.carry.signalOpenTime),
      dynamicSince: resumed.dynamicSince,
      state: { ...resumed.state, dynamicSince: resumed.dynamicSince, rewardRisk: memory.carry.state.rewardRisk },
    };
  }
  const simulating = {
    ...playbook,
    rewardRisk: preference,
    rewardRiskFor(openTime) {
      const stored = records.get(Number(openTime));
      return stored ? stored.rewardRisk : preference;
    },
  };
  const { setups, skipped } = simulatePlaybook(rows, simulating, {
    strategyVersion: DYNAMIC_TARGET_VERSION,
    legacyOpenTimes,
    carry,
  });
  persistTrades(db, setups, { ...meta, playbook });
  const openSetup = setups.find((setup) => setup.outcome === "open") || null;
  return {
    open: openSetup ? presentPlaybookTrade(openSetup, { ...meta, playbook }) : null,
    history: readPlaybookHistory(db, meta.symbol, meta.timeframe, playbook.id),
    skipped: skipped || [],
    rewardRisk: preference,
    comparison: comparisonSummary(rows, playbook, preference),
  };
}

export function syncPlaybookTrades(db, options = {}) {
  const playbook = options.playbook || PLAYBOOK_1;
  const { symbol, timeframe } = options;
  if (!symbol || !timeframe) return { open: null, history: [], skipped: [], rewardRisk: 2, comparison: null };
  // Rows that fall out of the current candle window stay stored. History is not rebuilt from scratch.
  if (!playbook.enabledTimeframes.includes(timeframe)) {
    return {
      open: null,
      history: readPlaybookHistory(db, symbol, timeframe, playbook.id),
      skipped: [],
      rewardRisk: readRewardRisk(db, symbol, timeframe, playbook.id),
      comparison: null,
    };
  }
  const rows = indicatorRows(options.candles || [], playbook, options.now ?? Date.now(), options.settings);
  return syncPlaybookRows(db, { ...options, playbook }, rows);
}

function comparisonMarket(rows, preference) {
  if (preference !== 3) return null;
  const compared = simulateMarket(rows, { rewardRisk: 3, strategyVersion: DYNAMIC_TARGET_VERSION });
  return {
    rewardRisk: 3,
    trades: compared.report.trades,
    tradeCount: compared.report.trades,
    totalR: compared.report.totalR,
    averageR: compared.report.averageR,
    realisedR: compared.report.realisedR,
  };
}

export function syncMarketTrades(db, options = {}) {
  const { symbol, timeframe } = options;
  if (!symbol || !timeframe) return { open: null, history: [], skipped: [], rewardRisk: 2, comparison: null };
  const enabled = PLAYBOOKS.filter((playbook) => playbook.enabledTimeframes.includes(timeframe));
  if (!enabled.length) {
    return { open: null, history: [], skipped: [], rewardRisk: 2, comparison: null };
  }
  const preference = options.rewardRisk == null
    ? readRewardRisk(db, symbol, timeframe, PLAYBOOK_1.id)
    : allowedRewardRisk(options.rewardRisk);
  const records = new Map();
  const legacyOpenTimes = [];
  const openPayloads = [];
  for (const playbook of enabled) {
    for (const [time, record] of storedRecords(db, symbol, timeframe, playbook.id)) {
      records.set(`${playbook.id}|${time}`, record);
      if (record.dataStatus === "superseded-data-corrected") continue;
      if (Number(record.playbookVersion || 1) < DYNAMIC_TARGET_VERSION && terminalOutcome(record.outcome)) {
        legacyOpenTimes.push(Number(time));
      }
      const corrected = new Set((options.correctedOpens || []).map(Number));
      if (options.correctionVersion && corrected.has(Number(time))) continue;
      if (record.outcome === "open" && record.payload && Number.isFinite(Number(record.payload.tp1)) && Number.isFinite(Number(record.payload.entry))) {
        openPayloads.push({ ...record.payload, signalOpenTime: Number(time), rewardRisk: record.rewardRisk });
      }
    }
  }
  const rows = indicatorRows(options.candles || [], enabled[0], options.now ?? Date.now(), options.settings);
  const openStored = openPayloads.sort((left, right) => Number(right.signalOpenTime) - Number(left.signalOpenTime))[0] || null;
  const resumed = openStored ? resumeFrozenOpen(openStored, rows) : null;
  if (resumed?.closed) legacyOpenTimes.push(Number(openStored.signalOpenTime));
  const carry = resumed && !resumed.closed && resumed.dynamicSince != null
    ? {
      signalOpenTime: Number(openStored.signalOpenTime),
      dynamicSince: resumed.dynamicSince,
      state: { ...resumed.state, dynamicSince: resumed.dynamicSince, rewardRisk: openStored.rewardRisk },
    }
    : null;
  const simulated = simulateMarket(rows, {
    playbooks: enabled,
    rewardRisk: preference,
    strategyVersion: DYNAMIC_TARGET_VERSION,
    legacyOpenTimes,
    carry,
    rewardRiskFor(openTime, playbookId) {
      const stored = records.get(`${playbookId}|${Number(openTime)}`);
      return stored ? stored.rewardRisk : preference;
    },
  });
  if (options.correctionVersion) {
    reconcileCorrectedTrades(db, {
      records,
      setups: simulated.setups,
      correctionVersion: options.correctionVersion,
      correctedOpens: new Set((options.correctedOpens || []).map(Number)),
      meta: options,
    });
  }
  for (const playbook of enabled) {
    const mine = simulated.setups.filter((setup) => setup.playbookId === playbook.id);
    persistTrades(db, mine, { ...options, playbook });
  }
  const openSetup = simulated.setups.find((setup) => setup.outcome === "open") || null;
  const openBook = openSetup ? (playbookById(openSetup.playbookId) || PLAYBOOK_1) : PLAYBOOK_1;
  const history = enabled
    .flatMap((playbook) => readPlaybookHistory(db, symbol, timeframe, playbook.id))
    .sort((a, b) => Number(b.signalOpenTime) - Number(a.signalOpenTime));
  return {
    open: openSetup ? presentPlaybookTrade(openSetup, { ...options, playbook: openBook }) : null,
    history,
    skipped: simulated.skipped || [],
    rewardRisk: preference,
    comparison: comparisonMarket(rows, preference),
  };
}
