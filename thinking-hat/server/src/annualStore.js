import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db, { nowIso, uploadsDir } from "./db.js";
import { normalizeEditorSections } from "./templateSections.js";
import { parseAnnualWorkbook, renderAnnualPdf } from "./annualWorkbook.js";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "PurpleHatDemo_Audited_FS_FY2026.xlsx",
);

const AFS_SECTIONS = [
  ["afs-cover", "Cover"],
  ["afs-index", "Index to Financial Statements"],
  ["afs-auditor", "Independent Auditor's Report"],
  ["afs-balance-sheets", "Balance Sheets"],
  ["afs-operations", "Statements of Operations"],
  ["afs-equity", "Statements of Changes in Member's Equity"],
  ["afs-cash-flows", "Statements of Cash Flows"],
  ...Array.from({ length: 14 }, (_, index) => [`afs-note-${index + 1}`, `Note ${index + 1}`]),
];

db.exec(`
CREATE TABLE IF NOT EXISTS annual_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  year_end TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  content_json TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (user_id, year_end, version),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const templateColumns = db.prepare("PRAGMA table_info(client_templates)").all();
if (!templateColumns.some((column) => column.name === "afs_json")) {
  db.exec("ALTER TABLE client_templates ADD COLUMN afs_json TEXT");
}

function yearEndOk(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function annualProfile(row) {
  if (!row?.afs_json) return null;
  try {
    const parsed = JSON.parse(row.afs_json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAnnualProfile(templateId, input = {}) {
  const auditStatus = String(input.auditStatus || "").trim();
  if (!["Audited", "Reviewed", "Compiled"].includes(auditStatus)) {
    return { error: "Choose Audited, Reviewed, or Compiled." };
  }
  if (!yearEndOk(input.yearEnd) || !yearEndOk(input.comparativeYearEnd)) {
    return { error: "Enter the financial year end and the comparative year as dates." };
  }
  if (!yearEndOk(input.reportDate)) return { error: "Enter the auditor's report date." };
  const profile = {
    yearEnd: input.yearEnd,
    comparativeYearEnd: input.comparativeYearEnd,
    framework: "US GAAP",
    auditStatus,
    auditorName: String(input.auditorName || "").trim().slice(0, 120),
    auditorFirm: String(input.auditorFirm || "").trim().slice(0, 160),
    reportDate: input.reportDate,
  };
  if (!profile.auditorName || !profile.auditorFirm) return { error: "Enter the auditor's name and firm." };
  db.prepare("UPDATE client_templates SET afs_json = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(profile),
    nowIso(),
    templateId,
  );
  return { profile };
}

function publicStatement(row, { includeDocument = false } = {}) {
  const document = JSON.parse(row.content_json);
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    yearEnd: row.year_end,
    year: row.year_end.slice(0, 4),
    version: Number(row.version),
    status: row.status,
    sourceName: row.source_name,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    errors: document.errors || [],
    ...(includeDocument ? { document } : {}),
  };
}

export async function saveAnnualUpload({ userId, yearEnd, buffer, filename }) {
  if (!yearEndOk(yearEnd)) return { error: "Choose a financial year end." };
  const document = await parseAnnualWorkbook(buffer);
  const versionRow = db.prepare(
    "SELECT COALESCE(MAX(version), 0) AS version FROM annual_statements WHERE user_id = ? AND year_end = ?",
  ).get(userId, yearEnd);
  const version = Number(versionRow.version) + 1;
  const createdAt = nowIso();
  const info = db.prepare(
    `INSERT INTO annual_statements (user_id, year_end, version, status, content_json, source_name, source_file, created_at)
     VALUES (?, ?, ?, 'draft', ?, ?, '', ?)`,
  ).run(userId, yearEnd, version, JSON.stringify(document), filename || "statements.xlsx", createdAt);
  const id = Number(info.lastInsertRowid);
  const dir = path.join(uploadsDir, "annual");
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${id}.xlsx`);
  fs.writeFileSync(stored, buffer);
  db.prepare("UPDATE annual_statements SET source_file = ? WHERE id = ?").run(stored, id);
  return { statement: publicStatement(db.prepare("SELECT * FROM annual_statements WHERE id = ?").get(id), { includeDocument: true }) };
}

export function readAnnual(id) {
  const row = db.prepare("SELECT * FROM annual_statements WHERE id = ?").get(id);
  return row ? publicStatement(row, { includeDocument: true }) : null;
}

export function publishAnnual(id) {
  const row = db.prepare("SELECT * FROM annual_statements WHERE id = ?").get(id);
  if (!row) return { error: "That statement was not found." };
  const document = JSON.parse(row.content_json);
  if (document.errors?.length) return { error: document.errors[0], errors: document.errors };
  const publishedAt = nowIso();
  db.prepare(
    "UPDATE annual_statements SET status = 'published', published_at = ? WHERE id = ?",
  ).run(publishedAt, id);
  return { statement: publicStatement(db.prepare("SELECT * FROM annual_statements WHERE id = ?").get(id), { includeDocument: true }) };
}

export function latestPublished(userId, year) {
  const row = db.prepare(
    `SELECT * FROM annual_statements
     WHERE user_id = ? AND substr(year_end, 1, 4) = ? AND status = 'published'
     ORDER BY version DESC LIMIT 1`,
  ).get(userId, String(year));
  return row ? publicStatement(row, { includeDocument: true }) : null;
}

export function listPublished(userId) {
  const rows = db.prepare(
    `SELECT * FROM annual_statements WHERE user_id = ? AND status = 'published' ORDER BY year_end DESC, version DESC`,
  ).all(userId);
  const seen = new Set();
  const years = [];
  for (const row of rows) {
    if (seen.has(row.year_end)) continue;
    seen.add(row.year_end);
    years.push(publicStatement(row));
  }
  return years;
}

export function annualFile(id) {
  const row = db.prepare("SELECT * FROM annual_statements WHERE id = ?").get(id);
  if (!row || !row.source_file || !fs.existsSync(row.source_file)) return null;
  return { name: row.source_name, buffer: fs.readFileSync(row.source_file), statement: publicStatement(row) };
}

export async function annualPdf(id) {
  const statement = readAnnual(id);
  if (!statement) return null;
  return { statement, buffer: await renderAnnualPdf(statement.document) };
}

function afsSections() {
  const sections = AFS_SECTIONS.map(([key, title], index) => ({
    id: `sec-${key}`,
    title,
    subtitle: "",
    presentation: "table",
    chart: false,
    hidden: false,
    note: key,
    columns: [],
    rows: [],
    labelHeader: "",
  }));
  return normalizeEditorSections(sections).sections;
}

const DEFAULT_PROFILE = {
  yearEnd: "2026-12-31",
  comparativeYearEnd: "2025-12-31",
  framework: "US GAAP",
  auditStatus: "Audited",
  auditorName: "Benjamin Voges CA(SA)",
  auditorFirm: "Benjamin Voges, Chartered Accountant (SA)",
  reportDate: "2027-03-15",
};

export async function seedAnnualPackage() {
  const user = db.prepare("SELECT * FROM users WHERE lower(trim(email)) = 'demo@purplehat.fun'").get();
  if (!user) return;
  const client = db.prepare("SELECT * FROM builder_clients WHERE user_id = ?").get(user.id);
  const existing = db.prepare("SELECT id FROM client_templates WHERE template_key = 'annual-fs-audited-us-gaap'").get();
  if (client && !existing) {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO client_templates (
         template_key, name, source_business, created_at, report_template, builder_client_id,
         framework, currency, year_end, period, updated_at, review_required, sections_json, layout_saved, afs_json
       ) VALUES (?, ?, ?, ?, 'purple-hat-demo', ?, 'us-gaap', 'USD', '12-31', 'annual', ?, 0, ?, 1, ?)`,
    ).run(
      "annual-fs-audited-us-gaap",
      "Annual Financial Statements (Audited, US GAAP)",
      user.business_name || user.name,
      ts,
      client.id,
      ts,
      JSON.stringify(afsSections()),
      JSON.stringify(DEFAULT_PROFILE),
    );
  }
  const published = db.prepare(
    "SELECT id FROM annual_statements WHERE user_id = ? AND year_end = '2026-12-31' AND status = 'published'",
  ).get(user.id);
  if (published || !fs.existsSync(fixturePath)) return;
  const saved = await saveAnnualUpload({
    userId: user.id,
    yearEnd: "2026-12-31",
    buffer: fs.readFileSync(fixturePath),
    filename: "PurpleHatDemo_Audited_FS_FY2026.xlsx",
  });
  if (saved.statement && !saved.statement.errors.length) publishAnnual(saved.statement.id);
}

export { DEFAULT_PROFILE };
