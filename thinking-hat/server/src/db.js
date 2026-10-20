import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { DatabaseSync } from "node:sqlite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "..", "..", ".env") });

// Hostinger replaces the deploy folder on every build. Keep the database and
// photos in DATA_DIR, or in the home directory when the app is running from hbuilds.
function storageRoot() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  const hosted = rootDir.includes(`${path.sep}hbuilds${path.sep}`);
  if (hosted) return path.join(os.homedir(), "thinking-hat-data");
  return rootDir;
}

const storage = storageRoot();
export const uploadsDir = path.join(storage, "uploads");
const dataDir = path.join(storage, "data");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "thinking-hat.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  photo_file TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  email TEXT,
  approve_on_use INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  expires_at TEXT,
  created_by INTEGER,
  used_by INTEGER,
  created_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (used_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finances (
  user_id INTEGER PRIMARY KEY,
  cash_cents INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  expenses_cents INTEGER NOT NULL DEFAULT 0,
  receivables_cents INTEGER NOT NULL DEFAULT 0,
  payables_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sample',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finance_months (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  revenue_cents INTEGER NOT NULL,
  expenses_cents INTEGER NOT NULL,
  UNIQUE (user_id, month),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ledger_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS build_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  details TEXT NOT NULL,
  budget TEXT NOT NULL DEFAULT '',
  needed_by TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'in_progress', 'done', 'declined')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS management_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  title TEXT NOT NULL,
  period_label TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, month),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_business TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_template_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  title TEXT NOT NULL,
  period_label TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (template_id, month),
  FOREIGN KEY (template_id) REFERENCES client_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_template_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES client_templates(id) ON DELETE CASCADE
);
`);

const inviteColumns = db.prepare("PRAGMA table_info(invites)").all();
if (!inviteColumns.some((column) => column.name === "template_id")) {
  db.exec("ALTER TABLE invites ADD COLUMN template_id INTEGER");
}
if (!inviteColumns.some((column) => column.name === "new_template")) {
  db.exec("ALTER TABLE invites ADD COLUMN new_template INTEGER NOT NULL DEFAULT 0");
}
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "needs_template")) {
  db.exec("ALTER TABLE users ADD COLUMN needs_template INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.some((column) => column.name === "report_template")) {
  db.exec("ALTER TABLE users ADD COLUMN report_template TEXT NOT NULL DEFAULT 'wealth-tech'");
}
if (!userColumns.some((column) => column.name === "template_id")) {
  db.exec("ALTER TABLE users ADD COLUMN template_id INTEGER");
}
const templateColumns = db.prepare("PRAGMA table_info(client_templates)").all();
if (!templateColumns.some((column) => column.name === "report_template")) {
  db.exec("ALTER TABLE client_templates ADD COLUMN report_template TEXT NOT NULL DEFAULT 'wealth-tech'");
}
if (!templateColumns.some((column) => column.name === "copied_from_id")) {
  db.exec("ALTER TABLE client_templates ADD COLUMN copied_from_id INTEGER");
}
db.exec(`
CREATE TABLE IF NOT EXISTS app_flags (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
const assignDemoTemplate = db.prepare(
  "UPDATE users SET report_template = 'purple-hat-demo' WHERE id = ? AND report_template = 'wealth-tech'",
);
for (const row of db.prepare("SELECT id, business_name FROM users").all()) {
  if (purpleHatDemoBusiness(row.business_name)) assignDemoTemplate.run(row.id);
}

export function purpleHatDemoBusiness(name) {
  return /purple\s*hat\s*demo/i.test(String(name || ""));
}

function layoutKey(value) {
  return value === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech";
}

function templateNameFor(row) {
  if (row?.template_id) {
    const template = db.prepare("SELECT name, template_key FROM client_templates WHERE id = ?").get(row.template_id);
    if (template?.name && template.template_key !== "wealth-tech" && template.template_key !== "purple-hat-demo") {
      return template.name;
    }
  }
  if (row?.role !== "client") return null;
  return layoutKey(row.report_template) === "purple-hat-demo" ? "Purple Hat Demo" : "WealthTech";
}

export function nowIso() {
  return new Date().toISOString();
}

export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function lastMonths(count) {
  const out = [];
  const start = new Date();
  start.setDate(1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(start.getFullYear(), start.getMonth() - i, 1);
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    businessName: row.business_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    needsTemplate: Boolean(row.needs_template),
    reportTemplate: row.report_template === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech",
    templateId: row.template_id ? Number(row.template_id) : null,
    templateName: templateNameFor(row),
    photoUrl: row.photo_file ? `/uploads/${row.photo_file}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const INFO_ADMIN_EMAIL = "info@purplehat.fun";

function ensureAdminAccount(email, password) {
  const ts = nowIso();
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!existing) {
    db.prepare(
      `INSERT INTO users (email, password_hash, name, business_name, phone, role, status, created_at, updated_at)
       VALUES (?, ?, 'Purple Hat', 'Purple Hat', '', 'admin', 'active', ?, ?)`,
    ).run(email, bcrypt.hashSync(password, 10), ts, ts);
    return { email, created: true };
  }
  if (!bcrypt.compareSync(password, existing.password_hash) || existing.role !== "admin" || existing.status !== "active") {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = ? WHERE id = ?",
    ).run(bcrypt.hashSync(password, 10), ts, existing.id);
  }
  return { email, created: false };
}

export function seedAdmin() {
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (password.length < 8) {
    throw new Error("Set ADMIN_PASSWORD in server/.env to at least 8 characters.");
  }
  const email = String(process.env.ADMIN_EMAIL || "admin@purplehat.fun").trim().toLowerCase();
  const primary = ensureAdminAccount(email, password);
  if (email !== INFO_ADMIN_EMAIL) ensureAdminAccount(INFO_ADMIN_EMAIL, password);
  return primary;
}

function flagValue(name) {
  return db.prepare("SELECT value FROM app_flags WHERE name = ?").get(name)?.value || "";
}

function setFlag(name, value = "1") {
  db.prepare("INSERT OR REPLACE INTO app_flags (name, value) VALUES (?, ?)").run(name, value);
}

export function seedWealthTechTemplate() {
  if (flagValue("template-removed:wealth-tech")) return null;
  const existing = db.prepare("SELECT id FROM client_templates WHERE template_key = ?").get("wealth-tech");
  if (existing) return existing.id;
  const user = db.prepare(
    "SELECT id, business_name FROM users WHERE role = 'client' AND business_name LIKE '%WealthTech%' ORDER BY id LIMIT 1",
  ).get();
  if (!user) return null;
  const reports = db.prepare(
    "SELECT month, title, period_label, entity_name, content_json, created_at FROM management_reports WHERE user_id = ? ORDER BY month",
  ).all(user.id);
  if (!reports.length) return null;
  const events = db.prepare(
    "SELECT kind, description, amount_cents, occurred_at FROM ledger_events WHERE user_id = ? ORDER BY id",
  ).all(user.id);
  const ts = nowIso();
  return transaction(() => {
    const created = db.prepare(
      "INSERT INTO client_templates (template_key, name, source_business, created_at) VALUES (?, ?, ?, ?)",
    ).run("wealth-tech", user.business_name, user.business_name, ts);
    const templateId = Number(created.lastInsertRowid);
    const insertReport = db.prepare(
      `INSERT INTO client_template_reports (template_id, month, title, period_label, entity_name, content_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const report of reports) {
      insertReport.run(templateId, report.month, report.title, report.period_label, report.entity_name, report.content_json, report.created_at);
    }
    const insertEvent = db.prepare(
      `INSERT INTO client_template_events (template_id, kind, description, amount_cents, occurred_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const event of events) {
      insertEvent.run(templateId, event.kind, event.description, event.amount_cents, event.occurred_at);
    }
    return templateId;
  });
}

export function seedPurpleHatDemoTemplate() {
  if (flagValue("template-removed:purple-hat-demo")) return null;
  const existing = db.prepare("SELECT id FROM client_templates WHERE template_key = ?").get("purple-hat-demo");
  if (existing) return existing.id;
  const user = db.prepare(
    "SELECT id, business_name FROM users WHERE role = 'client' AND business_name LIKE '%Purple%Hat%Demo%' ORDER BY id LIMIT 1",
  ).get();
  if (!user) return null;
  const reports = db.prepare(
    "SELECT month, title, period_label, entity_name, content_json, created_at FROM management_reports WHERE user_id = ? ORDER BY month",
  ).all(user.id);
  if (!reports.length) return null;
  const events = db.prepare(
    "SELECT kind, description, amount_cents, occurred_at FROM ledger_events WHERE user_id = ? ORDER BY id",
  ).all(user.id);
  const ts = nowIso();
  return transaction(() => {
    const created = db.prepare(
      `INSERT INTO client_templates (template_key, name, source_business, created_at, report_template)
       VALUES (?, ?, ?, ?, 'purple-hat-demo')`,
    ).run("purple-hat-demo", "Purple Hat Demo", user.business_name, ts);
    const templateId = Number(created.lastInsertRowid);
    const insertReport = db.prepare(
      `INSERT INTO client_template_reports (template_id, month, title, period_label, entity_name, content_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const report of reports) {
      insertReport.run(templateId, report.month, report.title, report.period_label, report.entity_name, report.content_json, report.created_at);
    }
    const insertEvent = db.prepare(
      `INSERT INTO client_template_events (template_id, kind, description, amount_cents, occurred_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const event of events) {
      insertEvent.run(templateId, event.kind, event.description, event.amount_cents, event.occurred_at);
    }
    return templateId;
  });
}

export function shortenWealthTechTemplateName() {
  db.prepare(
    "UPDATE client_templates SET name = 'WealthTech' WHERE template_key = 'wealth-tech' AND name = 'WealthTech (Pty) Ltd'",
  ).run();
}

export function linkClientsToTemplates() {
  if (flagValue("clients-linked-to-templates")) return;
  const wealth = db.prepare("SELECT id FROM client_templates WHERE template_key = ?").get("wealth-tech");
  const demo = db.prepare("SELECT id FROM client_templates WHERE template_key = ?").get("purple-hat-demo");
  if (wealth) {
    db.prepare(
      "UPDATE users SET template_id = ? WHERE template_id IS NULL AND role = 'client' AND business_name LIKE '%WealthTech%'",
    ).run(wealth.id);
  }
  if (demo) {
    const clients = db.prepare("SELECT id, business_name FROM users WHERE template_id IS NULL AND role = 'client'").all();
    const assign = db.prepare("UPDATE users SET template_id = ? WHERE id = ?");
    for (const client of clients) {
      if (purpleHatDemoBusiness(client.business_name)) assign.run(demo.id, client.id);
    }
  }
  setFlag("clients-linked-to-templates");
}

function templateNameTaken(name, exceptId) {
  const row = exceptId
    ? db.prepare("SELECT id FROM client_templates WHERE name = ? COLLATE NOCASE AND id != ?").get(name, exceptId)
    : db.prepare("SELECT id FROM client_templates WHERE name = ? COLLATE NOCASE").get(name);
  return Boolean(row);
}

export function copyClientTemplate(sourceId, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name the new template." };
  if (trimmed.length > 120) return { error: "Use a shorter name." };
  const source = db.prepare("SELECT * FROM client_templates WHERE id = ?").get(sourceId);
  if (!source) return { error: "Choose a template to copy." };
  if (templateNameTaken(trimmed)) return { error: "A template already has that name." };
  const layout = layoutKey(source.report_template);
  const ts = nowIso();
  const id = transaction(() => {
    const created = db.prepare(
      `INSERT INTO client_templates (template_key, name, source_business, created_at, report_template, copied_from_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(`copy-${crypto.randomBytes(6).toString("hex")}`, trimmed, source.name, ts, layout, source.id);
    return Number(created.lastInsertRowid);
  });
  return { id };
}

export function templateDocument(id) {
  const template = db.prepare("SELECT * FROM client_templates WHERE id = ?").get(id);
  if (!template) return null;
  const reports = db.prepare(
    "SELECT month, title, period_label, entity_name, content_json FROM client_template_reports WHERE template_id = ? ORDER BY month",
  ).all(id);
  const events = db.prepare(
    "SELECT kind, description, amount_cents, occurred_at FROM client_template_events WHERE template_id = ? ORDER BY id",
  ).all(id);
  return {
    format: "thinking-hat-template",
    version: 1,
    template: {
      name: template.name,
      layout: layoutKey(template.report_template),
      sourceBusiness: template.source_business || "",
      key: template.template_key,
    },
    reports: reports.map((report) => {
      const content = JSON.parse(report.content_json);
      return {
        month: report.month,
        title: report.title,
        periodLabel: report.period_label,
        entityName: report.entity_name,
        sections: Array.isArray(content.sections) ? content.sections : [],
      };
    }),
    movements: events.map((event) => ({
      kind: event.kind,
      description: event.description,
      amount: Math.round(Number(event.amount_cents)) / 100,
      occurredAt: event.occurred_at,
    })),
  };
}

function safeTemplateKey(value) {
  const key = String(value || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || key.length > 80) return "";
  return key;
}

function writeTemplatePack(templateId, document) {
  const insertReport = db.prepare(
    `INSERT INTO client_template_reports (template_id, month, title, period_label, entity_name, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const ts = nowIso();
  for (const report of document.reports) {
    insertReport.run(
      templateId,
      report.month,
      report.title,
      report.periodLabel,
      report.entityName,
      JSON.stringify({ sections: report.sections }),
      ts,
    );
  }
  const insertEvent = db.prepare(
    `INSERT INTO client_template_events (template_id, kind, description, amount_cents, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const movement of document.movements) {
    insertEvent.run(
      templateId,
      movement.kind,
      movement.description,
      Math.round(Number(movement.amount) * 100),
      movement.occurredAt,
    );
  }
}

function pushTemplateToClients(templateId, layout) {
  const users = db.prepare("SELECT id FROM users WHERE template_id = ?").all(templateId);
  const reports = db.prepare(
    "SELECT month, title, period_label, entity_name, content_json, created_at FROM client_template_reports WHERE template_id = ? ORDER BY month",
  );
  const events = db.prepare(
    "SELECT kind, description, amount_cents, occurred_at FROM client_template_events WHERE template_id = ? ORDER BY id",
  );
  const insertReport = db.prepare(
    `INSERT INTO management_reports (user_id, month, title, period_label, entity_name, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEvent = db.prepare(
    "INSERT INTO ledger_events (user_id, kind, description, amount_cents, occurred_at) VALUES (?, ?, ?, ?, ?)",
  );
  const ts = nowIso();
  for (const user of users) {
    db.prepare("DELETE FROM management_reports WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM ledger_events WHERE user_id = ?").run(user.id);
    for (const report of reports.all(templateId)) {
      insertReport.run(user.id, report.month, report.title, report.period_label, report.entity_name, report.content_json, report.created_at);
    }
    for (const event of events.all(templateId)) {
      insertEvent.run(user.id, event.kind, event.description, event.amount_cents, event.occurred_at);
    }
    const finance = db.prepare("SELECT user_id FROM finances WHERE user_id = ?").get(user.id);
    if (finance) {
      db.prepare("UPDATE finances SET source = 'report', updated_at = ? WHERE user_id = ?").run(ts, user.id);
    } else {
      db.prepare(
        `INSERT INTO finances (user_id, cash_cents, revenue_cents, expenses_cents, receivables_cents, payables_cents, source, updated_at)
         VALUES (?, 0, 0, 0, 0, 0, 'report', ?)`,
      ).run(user.id, ts);
    }
    db.prepare("UPDATE users SET report_template = ? WHERE id = ?").run(layout, user.id);
  }
  return users.length;
}

export function saveTemplateDocument(document) {
  const name = String(document?.template?.name || "").trim();
  const layout = document?.template?.layout === "purple-hat-demo" ? "purple-hat-demo" : document?.template?.layout === "wealth-tech" ? "wealth-tech" : "";
  if (!name) return { error: "Name the template." };
  if (!layout) return { error: "Use a WealthTech or Purple Hat Demo layout." };
  return transaction(() => {
    const key = safeTemplateKey(document.template.key);
    let existing = key
      ? db.prepare("SELECT * FROM client_templates WHERE template_key = ?").get(key)
      : null;
    if (!existing) {
      existing = db.prepare("SELECT * FROM client_templates WHERE name = ? COLLATE NOCASE").get(name);
    }
    let templateId;
    if (existing) {
      if (templateNameTaken(name, existing.id)) return { error: "A template already has that name." };
      db.prepare(
        "UPDATE client_templates SET name = ?, source_business = ?, report_template = ? WHERE id = ?",
      ).run(name, document.template.sourceBusiness || existing.source_business || "", layout, existing.id);
      templateId = Number(existing.id);
      db.prepare("DELETE FROM client_template_reports WHERE template_id = ?").run(templateId);
      db.prepare("DELETE FROM client_template_events WHERE template_id = ?").run(templateId);
    } else {
      if (templateNameTaken(name)) return { error: "A template already has that name." };
      let templateKey = key;
      if (!templateKey || db.prepare("SELECT id FROM client_templates WHERE template_key = ?").get(templateKey)) {
        templateKey = `file-${crypto.randomBytes(6).toString("hex")}`;
      }
      const created = db.prepare(
        `INSERT INTO client_templates (template_key, name, source_business, created_at, report_template)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(templateKey, name, document.template.sourceBusiness || "", nowIso(), layout);
      templateId = Number(created.lastInsertRowid);
    }
    writeTemplatePack(templateId, document);
    const clientsUpdated = pushTemplateToClients(templateId, layout);
    return { id: templateId, clientsUpdated };
  });
}

export function deleteClientTemplate(id) {
  const template = db.prepare("SELECT id, template_key, name FROM client_templates WHERE id = ?").get(id);
  if (!template) return { error: "That template was not found." };
  return transaction(() => {
    if (template.template_key === "wealth-tech" || template.template_key === "purple-hat-demo") {
      setFlag(`template-removed:${template.template_key}`);
    }
    db.prepare("UPDATE users SET template_id = NULL WHERE template_id = ?").run(template.id);
    db.prepare("UPDATE client_templates SET copied_from_id = NULL WHERE copied_from_id = ?").run(template.id);
    db.prepare("DELETE FROM client_templates WHERE id = ?").run(template.id);
    return { id: Number(template.id), name: template.name };
  });
}

export function renameClientTemplate(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name the template." };
  if (trimmed.length > 120) return { error: "Use a shorter name." };
  const template = db.prepare("SELECT id FROM client_templates WHERE id = ?").get(id);
  if (!template) return { error: "That template was not found." };
  if (templateNameTaken(trimmed, id)) return { error: "A template already has that name." };
  db.prepare("UPDATE client_templates SET name = ? WHERE id = ?").run(trimmed, id);
  return { id: Number(id) };
}

export function assignClientTemplate(userId, templateId) {
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!user) return { error: "That person was not found." };
  if (user.role !== "client") return { error: "Templates are for client accounts." };
  const template = db.prepare("SELECT id, report_template FROM client_templates WHERE id = ?").get(templateId);
  if (!template) return { error: "That template was not found." };
  db.prepare("UPDATE users SET report_template = ?, template_id = ?, updated_at = ? WHERE id = ?").run(
    layoutKey(template.report_template),
    template.id,
    nowIso(),
    user.id,
  );
  return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) };
}

export function applyClientTemplate(userId, templateId) {
  const template = db.prepare("SELECT id, report_template FROM client_templates WHERE id = ?").get(templateId);
  if (!template) {
    const error = new Error("template");
    throw error;
  }
  const ts = nowIso();
  const reports = db.prepare(
    "SELECT month, title, period_label, entity_name, content_json, created_at FROM client_template_reports WHERE template_id = ? ORDER BY month",
  ).all(templateId);
  const insertReport = db.prepare(
    `INSERT INTO management_reports (user_id, month, title, period_label, entity_name, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const report of reports) {
    insertReport.run(userId, report.month, report.title, report.period_label, report.entity_name, report.content_json, report.created_at);
  }
  const events = db.prepare(
    "SELECT kind, description, amount_cents, occurred_at FROM client_template_events WHERE template_id = ? ORDER BY id",
  ).all(templateId);
  const insertEvent = db.prepare(
    "INSERT INTO ledger_events (user_id, kind, description, amount_cents, occurred_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const event of events) {
    insertEvent.run(userId, event.kind, event.description, event.amount_cents, event.occurred_at);
  }
  db.prepare(
    `INSERT INTO finances (user_id, cash_cents, revenue_cents, expenses_cents, receivables_cents, payables_cents, source, updated_at)
     VALUES (?, 0, 0, 0, 0, 0, 'report', ?)`,
  ).run(userId, ts);
  db.prepare("UPDATE users SET report_template = ?, template_id = ? WHERE id = ?").run(
    layoutKey(template.report_template),
    template.id,
    userId,
  );
}

export function seedEmptyBooks(userId) {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO finances (user_id, cash_cents, revenue_cents, expenses_cents, receivables_cents, payables_cents, source, updated_at)
     VALUES (?, 0, 0, 0, 0, 0, 'empty', ?)`,
  ).run(userId, ts);
}

export function seedClientBooks(userId) {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO finances (user_id, cash_cents, revenue_cents, expenses_cents, receivables_cents, payables_cents, source, updated_at)
     VALUES (?, 18640000, 9200000, 4125000, 2875000, 1240000, 'sample', ?)`,
  ).run(userId, ts);

  const months = lastMonths(6);
  const revenue = [6400000, 7100000, 6800000, 8400000, 7900000, 9200000];
  const expenses = [3900000, 4200000, 3750000, 4600000, 4010000, 4125000];
  const insertMonth = db.prepare(
    "INSERT INTO finance_months (user_id, month, revenue_cents, expenses_cents) VALUES (?, ?, ?, ?)",
  );
  months.forEach((month, index) => insertMonth.run(userId, month, revenue[index], expenses[index]));

  const insertEvent = db.prepare(
    "INSERT INTO ledger_events (user_id, kind, description, amount_cents, occurred_at) VALUES (?, ?, ?, ?, ?)",
  );
  insertEvent.run(userId, "receipt", "Customer receipt posted", 1850000, ts);
  insertEvent.run(userId, "bill", "Supplier bill coded", -640000, ts);

  const insertInvoice = db.prepare(
    `INSERT INTO invoices (user_id, number, description, amount_cents, status, issued_on, due_on)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  insertInvoice.run(userId, "PH-1042", "Monthly accounting", 450000, "sent", addDays(-12), addDays(18));
  insertInvoice.run(userId, "PH-1038", "Management reports", 320000, "paid", addDays(-40), addDays(-10));
  insertInvoice.run(userId, "PH-1051", "Integration scoping", 180000, "draft", addDays(-2), addDays(28));
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newInviteCode() {
  const bytes = crypto.randomBytes(8);
  let body = "";
  for (let i = 0; i < 8; i += 1) body += alphabet[bytes[i] % alphabet.length];
  return `TH-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashCode(code) {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export function codeHint(code) {
  return `TH-••••-${String(code).slice(-4)}`;
}

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function bootstrapEmail() {
  return String(process.env.ADMIN_EMAIL || "admin@purplehat.fun").trim().toLowerCase();
}

export function isProtectedAdmin(email) {
  const value = String(email || "").trim().toLowerCase();
  return value === bootstrapEmail() || value === INFO_ADMIN_EMAIL;
}

export default db;
