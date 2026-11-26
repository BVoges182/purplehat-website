import db, { nowIso } from "./db.js";
import { loadPlanning, missingRedReasons, redLinesFor, variancePack } from "./planning.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function seedFor(period) {
  const seed = loadPlanning("purple-hat-demo").commentary;
  if (seed.period !== period) fail("That commentary period is not available.", 404);
  return seed;
}

function cleanParagraphs(input, seed) {
  if (!Array.isArray(input)) fail("Enter the commentary paragraphs.");
  if (input.length !== seed.paragraphs.length) fail("Keep one paragraph for each heading.");
  return seed.paragraphs.map((item, index) => {
    const text = String(input[index]?.text ?? "");
    if (text.length > 4000) fail("A paragraph is too long.");
    return { heading: item.heading, text };
  });
}

function cleanReasons(input) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) fail("Line reasons must be a list of notes.");
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-z0-9_]+$/.test(key)) continue;
    const text = String(value ?? "");
    if (text.length > 1000) fail("A line reason is too long.");
    if (text.trim()) out[key] = text;
  }
  return out;
}

function readRow(userId, period) {
  return db.prepare(
    "SELECT * FROM planning_commentary WHERE user_id = ? AND period = ?",
  ).get(userId, period);
}

function present(userId, period, row) {
  const seed = seedFor(period);
  const saved = row
    ? {
      paragraphs: JSON.parse(row.paragraphs_json),
      lineReasons: JSON.parse(row.line_reasons_json),
      status: row.status,
      approvedAt: row.approved_at,
      updatedAt: row.updated_at,
    }
    : null;
  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
  return {
    period,
    status: saved?.status || "draft",
    paragraphs: saved?.paragraphs || seed.paragraphs,
    lineReasons: saved?.lineReasons || seed.lineReasons || {},
    seedParagraphs: seed.paragraphs,
    seedLineReasons: seed.lineReasons || {},
    approvedAt: saved?.status === "approved" ? saved.approvedAt : null,
    approvedBy: saved?.status === "approved" ? (user?.name || "") : null,
    updatedAt: saved?.updatedAt || null,
    draftedBy: seed.draftedBy || "AI (seeded draft)",
  };
}

export function commentaryRecord(userId, period = "2026-12") {
  return present(userId, period, readRow(userId, period));
}

function writeRow(userId, period, paragraphs, lineReasons, status) {
  const ts = nowIso();
  const approvedAt = status === "approved" ? ts : null;
  db.prepare(
    `INSERT INTO planning_commentary (
       user_id, period, paragraphs_json, line_reasons_json, status, approved_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, period) DO UPDATE SET
       paragraphs_json = excluded.paragraphs_json,
       line_reasons_json = excluded.line_reasons_json,
       status = excluded.status,
       approved_at = excluded.approved_at,
       updated_at = excluded.updated_at`,
  ).run(userId, period, JSON.stringify(paragraphs), JSON.stringify(lineReasons), status, approvedAt, ts);
  return commentaryRecord(userId, period);
}

export function saveCommentary(userId, period, body) {
  const seed = seedFor(period);
  const paragraphs = cleanParagraphs(body?.paragraphs, seed);
  const lineReasons = cleanReasons(body?.lineReasons);
  return writeRow(userId, period, paragraphs, lineReasons, "draft");
}

export function approveCommentary(userId, period) {
  const current = commentaryRecord(userId, period);
  const missing = missingRedReasons(redLinesFor(variancePack().month), current.lineReasons);
  if (missing.length) {
    fail("Add a reason for every red line before approval.");
  }
  return writeRow(userId, period, current.paragraphs, current.lineReasons, "approved");
}
