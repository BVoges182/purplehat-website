export class HttpError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function retryDelay(attempt, baseMs = 400) {
  return baseMs * (2 ** attempt);
}

export function isRetryableStatus(status) {
  // 418 is a ban. Retrying it spends the ban window faster.
  return status === 429 || (status >= 500 && status <= 599);
}

const fetchCounter = { calls: 0, maxWeight: 0, batches: [] };

export function noteExchangeResponse(response) {
  fetchCounter.calls += 1;
  const raw = response?.headers?.get?.("x-mbx-used-weight-1m");
  const weight = Number(raw);
  if (Number.isFinite(weight)) fetchCounter.maxWeight = Math.max(fetchCounter.maxWeight, weight);
}

export function fetchStats() {
  return {
    calls: fetchCounter.calls,
    maxWeight: fetchCounter.maxWeight,
    batches: fetchCounter.batches.map((row) => ({ ...row })),
  };
}

export function resetFetchStats() {
  fetchCounter.calls = 0;
  fetchCounter.maxWeight = 0;
  fetchCounter.batches = [];
}

export function recordBatch(summary) {
  fetchCounter.batches.push({ ...summary });
  if (!summary?.calls) return;
  console.log(`Batch ${summary.name}: calls ${summary.calls} weight ${summary.weight ?? 0} duration ${summary.ms}ms`);
}

export async function withBackoff(run, { attempts = 3, baseMs = 400, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!isRetryableStatus(error?.status) || attempt === attempts - 1) throw error;
      const wait = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : retryDelay(attempt, baseMs);
      await sleep(wait);
    }
  }
  throw last;
}

export function createPacer(gapMs = 250) {
  let chain = Promise.resolve();
  let last = 0;
  return function pace() {
    const run = chain.then(async () => {
      const wait = Math.max(0, gapMs - (Date.now() - last));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      last = Date.now();
    });
    chain = run.catch(() => {});
    return run;
  };
}

export async function requestJson(url, { fetchImpl = fetch, method = "GET", body, timeoutMs = 20000, service } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      body,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      signal: controller.signal,
    });
    noteExchangeResponse(response);
    if (!response.ok) {
      const header = response.headers?.get?.("retry-after");
      const seconds = Number(header);
      const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : undefined;
      const label = service || (String(url).includes("hyperliquid") ? "Hyperliquid" : "Binance");
      throw new HttpError(`${label} ${response.status}`, response.status, retryAfterMs);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}
