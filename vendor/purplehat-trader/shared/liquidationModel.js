export const LIQUIDATION_MODEL = {
  id: "estimated-clusters-v1",
  version: 1,
  name: "Estimated liquidation clusters (model)",
  leverageBuckets: [10, 25, 50, 100],
  maintenanceMargin: 0.005,
  decayPerCandle: 0.98,
  entryAssumption: "The reference price is the closed candle's close when open interest increased. That close is not an observed entry.",
  sideAssumption: "An open-interest increase is treated as new paired contracts, so the model places a hypothetical long and a hypothetical short. Account ratio is not used to assign side or size.",
  leverageAssumption: "The increase is split equally across the leverage buckets. Open interest does not reveal leverage.",
  clearing: "A later close through the estimate removes that cluster. The candle that created it does not, and a wick does not.",
  units: "Intensity is relative to the largest open-interest increase in the window. It is not a USD amount.",
  clusterVenue: "okx",
  display: "Heatmap alpha uses log1p of each cell's intensity relative to the strongest cell: strength = log1p(relative * 9) / log1p(9), alpha = opacity * (0.28 + 0.34 * strength). The opacity slider is 0 to 1 and is not capped. Cells that fall in the same display row keep the stronger intensity. Band thickness is a display height around that model price, not a price interval.",
};

export function liquidationPrice(entry, leverage, side, maintenanceMargin = LIQUIDATION_MODEL.maintenanceMargin) {
  const price = Number(entry);
  const lev = Number(leverage);
  const margin = Number(maintenanceMargin);
  if (!(lev > 1) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(margin)) return null;
  const next = side === "short"
    ? price * (1 + 1 / lev - margin)
    : price * (1 - 1 / lev + margin);
  if (!Number.isFinite(next) || next <= 0) return null;
  if (side === "short" && next <= price) return null;
  if (side !== "short" && next >= price) return null;
  return next;
}

// The last open-interest point inside each candle. No point is invented for a gap.
export function bucketOpenInterest(points, candles) {
  const sorted = (points || [])
    .map((point) => ({ time: Number(point.time), oiUsd: Number(point.oiUsd) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.oiUsd))
    .sort((left, right) => left.time - right.time);
  const buckets = [];
  for (const candle of candles || []) {
    const openTime = Number(candle.openTime);
    const closeTime = Number(candle.closeTime);
    const close = Number(candle.close);
    if (!Number.isFinite(openTime) || !Number.isFinite(closeTime) || !Number.isFinite(close)) continue;
    let chosen = null;
    for (const point of sorted) {
      if (point.time < openTime) continue;
      if (point.time >= closeTime) break;
      chosen = point;
    }
    if (!chosen) continue;
    buckets.push({ openTime, closeTime, close, oiUsd: chosen.oiUsd, oiTime: chosen.time });
  }
  return buckets;
}

export function coverageWindows(points, ranges = [3, 7, 30]) {
  const times = (points || []).map((point) => Number(point.time)).filter(Number.isFinite).sort((left, right) => left - right);
  if (times.length < 2) {
    return {
      from: times[0] ?? null,
      to: times.at?.(-1) ?? times[times.length - 1] ?? null,
      spanDays: 0,
      ranges: ranges.map((days) => ({ days, available: false, reason: "insufficient coverage" })),
    };
  }
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
  return {
    from: times[0],
    to: times[times.length - 1],
    spanDays,
    ranges: ranges.map((days) => ({
      days,
      available: spanDays >= days - 0.05,
      reason: spanDays >= days - 0.05 ? "covered" : "insufficient coverage",
    })),
  };
}

function cleared(cluster, close) {
  if (cluster.side === "short") return close >= cluster.price;
  return close <= cluster.price;
}

export function buildClusters(buckets, model = LIQUIDATION_MODEL) {
  const rows = buckets || [];
  const increases = [];
  for (let index = 1; index < rows.length; index += 1) {
    const delta = rows[index].oiUsd - rows[index - 1].oiUsd;
    if (delta > 0) increases.push({ row: rows[index], delta, index });
  }
  const maxDelta = increases.reduce((max, item) => Math.max(max, item.delta), 0);
  if (!(maxDelta > 0)) return [];
  const share = 1 / model.leverageBuckets.length;
  const clusters = [];
  for (const increase of increases) {
    for (const leverage of model.leverageBuckets) {
      for (const side of ["long", "short"]) {
        const price = liquidationPrice(increase.row.close, leverage, side, model.maintenanceMargin);
        if (price == null) continue;
        clusters.push({
          time: increase.row.openTime,
          price,
          side,
          leverage,
          intensity: (increase.delta / maxDelta) * share,
          venue: model.clusterVenue,
          index: increase.index,
        });
      }
    }
  }
  return clusters.map((cluster) => {
    let intensity = cluster.intensity;
    for (let index = cluster.index + 1; index < rows.length; index += 1) {
      intensity *= model.decayPerCandle;
      if (cleared(cluster, rows[index].close)) return null;
    }
    if (!(intensity > 0.02)) return null;
    return {
      time: cluster.time,
      price: cluster.price,
      side: cluster.side,
      leverage: cluster.leverage,
      intensity,
      venue: cluster.venue,
    };
  }).filter(Boolean);
}

export function clustersForRange(clusters, rangeDays, coverage, now) {
  const spec = (coverage?.ranges || []).find((item) => item.days === rangeDays);
  if (!spec?.available) return { status: "insufficient coverage", clusters: [] };
  const from = now - rangeDays * 86_400_000;
  return {
    status: "ready",
    clusters: (clusters || []).filter((cluster) => Number(cluster.time) >= from),
  };
}

export const HEATMAP_BAND_PX = 10;

// strength = log1p((intensity / maxIntensity) * 9) / log1p(9)
// alpha = opacity * (0.28 + 0.34 * strength)
export function heatmapAlpha(intensity, opacity, maxIntensity) {
  const value = Number(intensity);
  const peak = Number(maxIntensity);
  const slider = Number(opacity);
  if (!(value > 0) || !(peak > 0) || !Number.isFinite(slider)) return 0;
  const clamped = Math.min(1, Math.max(0, slider));
  const relative = Math.min(1, Math.max(0, value / peak));
  const strength = Math.log1p(relative * 9) / Math.log1p(9);
  return clamped * (0.28 + 0.34 * strength);
}

export function placeHeatmapBands(clusters, mapPoint, plot = {}) {
  const rows = (clusters || []).filter((row) => Number(row?.intensity) > 0 && Number.isFinite(Number(row.price)));
  const maxIntensity = rows.reduce((max, row) => Math.max(max, Number(row.intensity)), 0);
  const width = Number(plot.width);
  const height = Number(plot.height);
  const bandPx = Number(plot.bandPx) > 0 ? Number(plot.bandPx) : HEATMAP_BAND_PX;
  const bins = new Map();
  let outside = 0;
  for (const row of rows) {
    const point = typeof mapPoint === "function" ? (mapPoint(row) || {}) : {};
    const y = Number(point.y);
    if (point.y == null || !Number.isFinite(y) || y < 0 || (Number.isFinite(height) && y > height)) {
      outside += 1;
      continue;
    }
    const rawX = point.x;
    let x = Number(rawX);
    if (rawX == null) x = 0;
    else if (!Number.isFinite(x)) {
      outside += 1;
      continue;
    }
    if (Number.isFinite(width) && x >= width) {
      outside += 1;
      continue;
    }
    const start = Math.max(0, x);
    const end = Number.isFinite(width) ? width : start;
    if (!(end > start)) {
      outside += 1;
      continue;
    }
    const alpha = heatmapAlpha(row.intensity, plot.opacity, maxIntensity);
    if (!(alpha > 0)) continue;
    const bin = Math.round(y / bandPx);
    const band = {
      x: start,
      y,
      width: end - start,
      height: bandPx,
      alpha,
      side: row.side === "short" ? "short" : "long",
      price: Number(row.price),
      intensity: Number(row.intensity),
    };
    const current = bins.get(bin);
    if (!current || alpha > current.alpha) bins.set(bin, band);
  }
  return { bands: [...bins.values()], outside, maxIntensity, scale: "log1p" };
}

export function heatmapDataState({ liquidity, clusters, rangeDays, rangeStatus }) {
  if (liquidity == null || rangeStatus === "warming") {
    return {
      status: "warming",
      detail: "OKX BTC-USDT-SWAP model is still loading. No cells yet.",
    };
  }
  const coverage = liquidity.coverage || {};
  const span = Number.isFinite(Number(coverage.spanDays)) ? `${Number(coverage.spanDays).toFixed(2)} days` : "unknown span";
  const from = Number.isFinite(Number(coverage.from)) ? new Date(Number(coverage.from)).toISOString() : "n/a";
  const to = Number.isFinite(Number(coverage.to)) ? new Date(Number(coverage.to)).toISOString() : "n/a";
  const okx = (liquidity.venues || []).find((venue) => venue.id === "okx");
  const provider = okx
    ? `OKX ${okx.instrument || "BTC-USDT-SWAP"} status ${okx.status}${okx.error ? ` (${okx.error})` : ""}`
    : "OKX BTC-USDT-SWAP";
  const coverageText = `${provider}. Coverage ${span}, ${from} to ${to}.`;
  const blockedStatus = String(okx?.status || "");
  const blockedError = `${okx?.error || ""} ${liquidity.error || ""} ${liquidity.reason || ""}`;
  if (/^http-(401|403|451)$/.test(blockedStatus) || /\b(403|451)\b/.test(blockedError)) {
    return { status: "blocked", detail: `${coverageText} Provider access is blocked. No heatmap cells are drawn.` };
  }
  const count = (clusters || []).length;
  if (liquidity.status === "unavailable" && !count) {
    return { status: "unavailable", detail: `${coverageText} ${liquidity.error || liquidity.reason || "Liquidity data is unavailable."}`.trim() };
  }
  if (rangeStatus === "insufficient coverage") {
    return { status: "insufficient-coverage", detail: `${coverageText} The ${rangeDays}d window is not covered.` };
  }
  if (!count) {
    const stale = liquidity.stale ? " Open interest is stale." : "";
    return {
      status: liquidity.stale ? "stale" : "zero",
      detail: `${coverageText}${stale} The model returned no nonzero cells in the ${rangeDays}d window.`,
    };
  }
  const notes = [];
  if (liquidity.stale) notes.push("Open interest is stale.");
  if (liquidity.status === "partial") notes.push("Coverage is partial.");
  return {
    status: liquidity.stale ? "stale" : "ready",
    detail: `${coverageText} ${count} nonzero model cells in the ${rangeDays}d window. ${notes.join(" ")}`.trim(),
  };
}

export function fundingPresentation(rate) {
  if (typeof rate === "string" && rate.trim() === "") return { tone: "unavailable", text: "unavailable" };
  if (rate == null || typeof rate === "boolean") return { tone: "unavailable", text: "unavailable" };
  const numeric = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(numeric)) return { tone: "unavailable", text: "unavailable" };
  const percent = numeric * 100;
  let text = "0%";
  if (percent !== 0) {
    const abs = Math.abs(percent);
    const digits = abs >= 0.0001 ? 4 : Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
    text = `${percent.toFixed(digits)}%`;
  }
  const tone = numeric > 0 ? "positive" : numeric < 0 ? "negative" : "neutral";
  return { tone, text, rate: numeric, ratePercent: percent };
}

export function fundingView(row) {
  const rate = Number(row?.rate);
  if (!row || !Number.isFinite(rate)) return null;
  const hours = Number(row.intervalHours);
  return {
    venue: row.venue,
    instrument: row.instrument,
    rate,
    ratePercent: rate * 100,
    intervalHours: Number.isFinite(hours) ? hours : null,
    timestamp: row.timestamp ?? null,
    kind: row.kind === "estimate" ? "estimate" : "settled",
    positiveMeans: "longs pay shorts",
  };
}

export function intervalHoursFrom(times) {
  const sorted = (times || []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length < 2) return null;
  const hours = (sorted[sorted.length - 1] - sorted[sorted.length - 2]) / 3_600_000;
  if (hours < 0.5 || hours > 24) return null;
  return Math.round(hours * 1000) / 1000;
}

export function accountRatioView(row) {
  if (!row || row.unavailable) {
    return {
      status: "unavailable",
      venue: row?.venue || null,
      instrument: row?.instrument || null,
      reason: row?.reason || "Account ratio is unavailable.",
    };
  }
  return {
    status: "ready",
    venue: row.venue,
    instrument: row.instrument,
    timestamp: row.timestamp ?? null,
    definition: row.definition,
    longShortRatio: Number.isFinite(Number(row.longShortRatio)) ? Number(row.longShortRatio) : null,
    longAccount: Number.isFinite(Number(row.longAccount)) ? Number(row.longAccount) : null,
    shortAccount: Number.isFinite(Number(row.shortAccount)) ? Number(row.shortAccount) : null,
    note: "Counts accounts at this venue, not position size or the whole market. Separate from funding. Every contract has both a long and a short.",
  };
}
