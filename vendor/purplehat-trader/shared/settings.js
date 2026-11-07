const OPTIONAL_PIVOTS = ["pivotLeft4h", "pivotRight4h", "pivotLeft1d", "pivotRight1d"];

function num(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNum(env, name) {
  const raw = env[name];
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function flag(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  return asFlag(raw, fallback);
}

function asFlag(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;
  return fallback;
}

export function divergenceStyle(value, fallback = "A") {
  const text = String(value || "").trim().toUpperCase();
  return text === "A" || text === "B" || text === "C" ? text : fallback;
}

function readEnv(env) {
  if (env != null) return env;
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
}

export function envDefaults(env) {
  const source = readEnv(env);
  return {
    bbPeriod: num(source, "BB_PERIOD", 20),
    bbStd: num(source, "BB_STD", 2),
    rsiPeriod: num(source, "RSI_PERIOD", 14),
    rsiSmaPeriod: num(source, "RSI_SMA_PERIOD", 14),
    rsiSmaVisible: flag(source, "RSI_SMA_VISIBLE", true),
    rsiOversold: num(source, "RSI_OVERSOLD", 30),
    rsiOverbought: num(source, "RSI_OVERBOUGHT", 70),
    bandTouchPercent: num(source, "BAND_TOUCH_PERCENT", 0.1),
    rsiSellZone: num(source, "RSI_SELL_ZONE", 65),
    rsiBuyZone: num(source, "RSI_BUY_ZONE", 35),
    rsiPivotLookback: num(source, "RSI_PIVOT_LOOKBACK", 3),
    pivotLeft: num(source, "PIVOT_LEFT", num(source, "PIVOT_L", 5)),
    pivotRight: num(source, "PIVOT_RIGHT", num(source, "PIVOT_R", 5)),
    pivotLeft4h: optionalNum(source, "PIVOT_LEFT_4H") ?? 3,
    pivotRight4h: optionalNum(source, "PIVOT_RIGHT_4H") ?? 3,
    pivotLeft1d: optionalNum(source, "PIVOT_LEFT_1D") ?? 2,
    pivotRight1d: optionalNum(source, "PIVOT_RIGHT_1D") ?? 2,
    divMinBars: num(source, "DIV_MIN_BARS", 3),
    divMaxBars: num(source, "DIV_MAX_BARS", 60),
    divMaxBars1d: optionalNum(source, "DIV_MAX_BARS_1D") ?? 40,
    divergenceStyle: divergenceStyle(source.DIVERGENCE_STYLE, "A"),
  };
}

export function normalizeSettings(input = {}, env) {
  const base = envDefaults(env);
  const next = { ...base };
  for (const key of Object.keys(base)) {
    if (input[key] == null || input[key] === "") continue;
    if (key === "rsiSmaVisible") {
      next[key] = asFlag(input[key], base[key]);
      continue;
    }
    if (key === "divergenceStyle") {
      next[key] = divergenceStyle(input[key], base.divergenceStyle);
      continue;
    }
    if (OPTIONAL_PIVOTS.includes(key) && (input[key] === null || input[key] === "")) {
      next[key] = null;
      continue;
    }
    const value = Number(input[key]);
    next[key] = Number.isFinite(value) ? value : input[key];
  }
  for (const key of OPTIONAL_PIVOTS) {
    if (input[key] === null) next[key] = null;
  }
  return next;
}

export function validateSettings(input, env) {
  const settings = normalizeSettings(input, env);
  const errors = [];
  if (!Number.isInteger(settings.bbPeriod) || settings.bbPeriod < 2) errors.push("BB period must be an integer of at least 2");
  if (!(Number(settings.bbStd) > 0)) errors.push("BB standard deviation must be above 0");
  if (!Number.isInteger(settings.rsiPeriod) || settings.rsiPeriod < 2) errors.push("RSI period must be an integer of at least 2");
  if (!Number.isInteger(settings.rsiSmaPeriod) || settings.rsiSmaPeriod < 2) errors.push("RSI SMA period must be an integer of at least 2");
  if (typeof settings.rsiSmaVisible !== "boolean") errors.push("RSI SMA visibility must be on or off");
  if (!(settings.rsiOversold > 0 && settings.rsiOversold < settings.rsiOverbought && settings.rsiOverbought < 100)) {
    errors.push("RSI oversold must be below RSI overbought, and both must sit between 0 and 100");
  }
  if (!(Number(settings.bandTouchPercent) >= 0)) errors.push("Band touch tolerance must be 0 or greater");
  if (!(settings.rsiBuyZone > 0 && settings.rsiBuyZone < settings.rsiSellZone && settings.rsiSellZone < 100)) {
    errors.push("RSI buy zone must be below the RSI sell zone, and both must sit between 0 and 100");
  }
  if (!Number.isInteger(settings.rsiPivotLookback) || settings.rsiPivotLookback < 1) {
    errors.push("RSI pivot lookback must be an integer of at least 1");
  }
  for (const key of ["pivotLeft", "pivotRight", "divMinBars", "divMaxBars"]) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1) errors.push("Pivot lengths and divergence spans must be integers of at least 1");
  }
  for (const key of OPTIONAL_PIVOTS) {
    if (settings[key] == null) continue;
    if (!Number.isInteger(settings[key]) || settings[key] < 1) errors.push("Pivot overrides must be integers of at least 1");
  }
  if (settings.divMaxBars < settings.divMinBars) errors.push("Divergence max bars must be at least the minimum");
  if (!["A", "B", "C"].includes(settings.divergenceStyle)) errors.push("Divergence style must be A, B, or C");
  return { ok: errors.length === 0, errors: [...new Set(errors)], settings };
}

export function pivotFor(settings, interval) {
  if (interval === "1d") {
    return {
      left: settings.pivotLeft1d ?? settings.pivotLeft,
      right: settings.pivotRight1d ?? settings.pivotRight,
    };
  }
  return {
    left: settings.pivotLeft4h ?? settings.pivotLeft,
    right: settings.pivotRight4h ?? settings.pivotRight,
  };
}
