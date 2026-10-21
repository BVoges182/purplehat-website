import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const insightDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "insights");
export const INSIGHTS_CACHE_MS = 60 * 60 * 1000;

function cleanText(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function normalBusinessName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function driveFileId(source) {
  const text = String(source || "").trim();
  if (!text || text.startsWith("sample:")) return "";
  if (text.startsWith("drive:")) return text.slice("drive:".length).trim();
  const fromPath = text.match(/\/file\/d\/([^/?#]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = text.match(/[?&]id=([^&#]+)/);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  if (!text.includes("/") && !text.includes(":") && /^[\w-]{10,}$/.test(text)) return text;
  return "";
}

export function parseInsights(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Insights file must be a JSON object.");
  }
  const updated = cleanText(value.updated, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) throw new Error("Insights need an updated date.");
  const headline = cleanText(value.headline, 280);
  if (!headline) throw new Error("Insights need a headline.");
  const findings = (Array.isArray(value.findings) ? value.findings : []).slice(0, 12).flatMap((item) => {
    const title = cleanText(item?.title, 140);
    const detail = cleanText(item?.detail, 600);
    if (!title && !detail) return [];
    return [{ title, detail, sourceUrl: httpUrl(item?.source_url) }];
  });
  const actions = (Array.isArray(value.actions) ? value.actions : [])
    .map((item) => cleanText(item, 240))
    .filter(Boolean)
    .slice(0, 8);
  const title = cleanText(value.title, 80);
  const joke = cleanText(value.joke, 400);
  let financial = null;
  if (value.financial != null) {
    try {
      financial = parseFinancialInsights(value.financial);
    } catch {
      financial = null;
    }
  }
  return {
    updated,
    client: cleanText(value.client, 120),
    ...(title ? { title } : {}),
    headline,
    findings,
    actions,
    ...(joke ? { joke } : {}),
    ...(financial ? { financial } : {}),
  };
}

export function insightsFileSource(value) {
  const text = cleanText(value, 500);
  if (!text) return "";
  const id = driveFileId(text);
  if (id) return `drive:${id}`;
  if (/^sample:[a-z0-9-]+$/.test(text)) return text;
  if (/^https:\/\//i.test(text)) return text;
  return null;
}

export function insightsFileLabel(source) {
  const text = String(source || "");
  return text.startsWith("drive:") ? text.slice("drive:".length) : text;
}

export function botInsightsTitle(name) {
  const text = cleanText(name, 80);
  if (!text) return "";
  return `${text}'s insights`;
}

function moneyValue(value) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function bulletList(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).flatMap((item) => {
    const text = cleanText(typeof item === "string" ? item : item?.text || item?.detail || item?.title, 500);
    return text ? [text] : [];
  });
}

function moneySide(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const total = moneyValue(value.total);
  const overdue = moneyValue(value.overdue);
  const note = cleanText(value.note, 800);
  if (total == null && overdue == null && !note) return null;
  return {
    ...(total == null ? {} : { total }),
    ...(overdue == null ? {} : { overdue }),
    ...(note ? { note } : {}),
  };
}

export function parseFinancialInsights(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Financial insights file must be a JSON object.");
  }
  const updated = cleanText(value.updated, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) throw new Error("Financial insights need an updated date.");
  const headline = cleanText(value.headline, 500);
  const title = cleanText(value.title, 80);
  const period = cleanText(value.period, 80);
  const receivables = moneySide(value.receivables);
  const payables = moneySide(value.payables);
  const currentMonth = bulletList(value.current_month);
  const trends = bulletList(value.trends);
  const actions = bulletList(value.actions);
  return {
    updated,
    ...(title ? { title } : {}),
    ...(period ? { period } : {}),
    ...(headline ? { headline } : {}),
    ...(receivables ? { receivables } : {}),
    ...(payables ? { payables } : {}),
    currentMonth,
    trends,
    actions,
  };
}

export function grokBotInput(input = {}) {
  const name = cleanText(input?.name, 80);
  if (!name) return { error: "Name the bot." };
  const source = insightsFileSource(input?.fileId);
  if (!source) return { error: "Enter a Google Drive file ID." };
  return { value: { name, insightsSource: source } };
}

export function insightSource(user) {
  return cleanText(user?.bot_source, 500);
}

function botNameOf(user) {
  return cleanText(user?.bot_name, 80) || null;
}

async function readJsonResponse(response) {
  if (!response.ok) throw new Error("Insights file could not be read.");
  const text = await response.text();
  if (/^\s*</.test(text)) throw new Error("Insights file was not JSON.");
  return JSON.parse(text);
}

function driveReadUrl(fileId) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY || "";
  const bust = `cb=${Date.now()}`;
  if (apiKey) {
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}&${bust}`;
  }
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&${bust}`;
}

async function readRemote(source, fetchImpl) {
  const fileId = driveFileId(source);
  const url = fileId ? driveReadUrl(fileId) : source;
  if (!fileId && !/^https:\/\//i.test(source)) throw new Error("Insights source is not a file link.");
  const init = { redirect: "follow" };
  if (fileId) {
    init.cache = "no-store";
    init.headers = { "Cache-Control": "no-store" };
  }
  return readJsonResponse(await fetchImpl(url, init));
}

function readSample(source) {
  const name = source.slice("sample:".length);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Unknown insights sample.");
  const file = path.join(insightDir, "samples", `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function createInsightLoader({
  now = () => Date.now(),
  fetchImpl = globalThis.fetch,
  cacheMs = INSIGHTS_CACHE_MS,
  parse = parseInsights,
} = {}) {
  const cache = new Map();
  const pending = new Map();

  async function load(user) {
    const source = insightSource(user);
    const botName = botNameOf(user);
    if (!source) return { configured: false, botName: null, insights: null };
    const key = `${user?.id ?? ""}:${source}`;
    const fromDrive = Boolean(driveFileId(source));
    const hit = fromDrive ? null : cache.get(key);
    if (hit && now() - hit.at < cacheMs) return { configured: true, botName, insights: hit.insights };
    if (pending.has(key)) return pending.get(key);

    const job = (async () => {
      const raw = source.startsWith("sample:") ? readSample(source) : await readRemote(source, fetchImpl);
      const insights = parse(raw);
      if (!fromDrive) cache.set(key, { at: now(), insights });
      return { configured: true, botName, insights };
    })();
    pending.set(key, job);
    try {
      return await job;
    } catch (error) {
      console.error(`Insights file could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
      return { configured: true, botName, insights: null };
    } finally {
      pending.delete(key);
    }
  }

  return { load, cache };
}

export const insightLoader = createInsightLoader();
