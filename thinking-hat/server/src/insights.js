import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const insightDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "insights");
export const INSIGHTS_CACHE_MS = 60 * 60 * 1000;

function cleanText(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clientFacing(value, max) {
  return cleanText(value, max)
    .replaceAll("John McEnroe's insights", "Purple Hat insights")
    .replaceAll("John McEnroe", "Purple Hat");
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
  const headline = clientFacing(value.headline, 280);
  if (!headline) throw new Error("Insights need a headline.");
  const findings = (Array.isArray(value.findings) ? value.findings : []).slice(0, 12).flatMap((item) => {
    const title = clientFacing(item?.title, 140);
    const detail = clientFacing(item?.detail, 600);
    if (!title && !detail) return [];
    return [{ title, detail, sourceUrl: httpUrl(item?.source_url) }];
  });
  const actions = (Array.isArray(value.actions) ? value.actions : [])
    .map((item) => clientFacing(item, 240))
    .filter(Boolean)
    .slice(0, 8);
  const title = clientFacing(value.title, 80);
  const joke = clientFacing(value.joke, 400);
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
    client: clientFacing(value.client, 120),
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
  return "Purple Hat insights";
}

function moneyValue(value) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function bulletList(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).flatMap((item) => {
    const text = clientFacing(typeof item === "string" ? item : item?.text || item?.detail || item?.title, 500);
    return text ? [text] : [];
  });
}

function moneySide(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const total = moneyValue(value.total);
  const overdue = moneyValue(value.overdue);
  const note = clientFacing(value.note, 800);
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
  const headline = clientFacing(value.headline, 500);
  const title = clientFacing(value.title, 80);
  const period = clientFacing(value.period, 80);
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

export function businessNameKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function chooseInsightClient(user, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const userId = Number(user?.id);
  const linked = list.find((row) => Number(row?.user_id) === userId) || null;
  const templateId = Number(user?.template_client_id);
  const template = templateId ? list.find((row) => Number(row?.client_id) === templateId) || null : null;
  const nameKey = businessNameKey(user?.business_name || user?.name);
  const named = nameKey
    ? list.filter((row) => businessNameKey(row?.client_name) === nameKey)
    : [];
  const usable = (row) => {
    if (!row || !cleanText(row.insights_source, 500)) return false;
    if (row.user_id == null || row.user_id === "") return true;
    return Number(row.user_id) === userId;
  };
  const chosen = [usable(linked) ? linked : null, usable(template) ? template : null, named.find(usable) || null].find(Boolean) || linked || null;
  let via = "none";
  if (chosen && chosen === linked) via = "user";
  else if (chosen && chosen === template) via = "template";
  else if (chosen) via = "name";
  return { chosen, via, linkedId: linked?.client_id ?? null, templateId: template?.client_id ?? null };
}

function botNameOf(user) {
  return cleanText(user?.bot_name, 80) || null;
}

const LOAD_ERROR = "Couldn't load insights";

function emptyRead(message) {
  const error = new Error(message);
  error.empty = true;
  return error;
}

async function readJsonResponse(response) {
  const text = await response.text();
  console.info(`[insights] step=download status=${response.status} type=${response.headers.get("content-type") || ""} bytes=${text.length} json=${text.trim().startsWith("{")}`);
  if (response.status === 404 || !text.trim()) throw emptyRead("Insights file is empty.");
  if (!response.ok) throw new Error("Insights file could not be read.");
  if (/^\s*</.test(text)) throw new Error("Insights file was not JSON.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Insights file was not JSON.");
  }
}

function keySet() {
  return Boolean(process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY);
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

  function ready(botName, insights, error = "") {
    return { configured: true, botName, insights, error };
  }

  async function load(user) {
    const source = insightSource(user);
    const botName = botNameOf(user);
    if (!source) return { configured: false, botName: null, insights: null, error: "" };
    const key = `${user?.id ?? ""}:${source}`;
    const fromDrive = Boolean(driveFileId(source));
    const hit = fromDrive ? null : cache.get(key);
    if (hit && now() - hit.at < cacheMs) return ready(botName, hit.insights);
    if (pending.has(key)) return pending.get(key);

    const job = (async () => {
      console.info(`[insights] user=${user?.id ?? ""} step=fetch drive=${fromDrive ? "yes" : "no"} key=${keySet() ? "yes" : "no"}`);
      const raw = source.startsWith("sample:") ? readSample(source) : await readRemote(source, fetchImpl);
      const insights = parse(raw);
      if (!fromDrive) cache.set(key, { at: now(), insights });
      console.info(`[insights] user=${user?.id ?? ""} step=parse ok title=${insights?.title ? "yes" : "no"} financial=${insights?.financial ? "yes" : "no"}`);
      return ready(botName, insights);
    })();
    pending.set(key, job);
    try {
      return await job;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[insights] user=${user?.id ?? ""} step=failed ${message}`);
      if (error?.empty) return ready(botName, null);
      return ready(botName, null, LOAD_ERROR);
    } finally {
      pending.delete(key);
    }
  }

  return { load, cache };
}

export const insightLoader = createInsightLoader();
