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
  return status === 429 || status === 418 || (status >= 500 && status <= 599);
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
