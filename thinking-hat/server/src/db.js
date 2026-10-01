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
`);

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
    photoUrl: row.photo_file ? `/uploads/${row.photo_file}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "admin@purplehat.fun").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (password.length < 8) {
    throw new Error("Set ADMIN_PASSWORD in server/.env to at least 8 characters.");
  }
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

export default db;
