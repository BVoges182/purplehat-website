import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import db, {
  isProtectedAdmin,
  codeHint,
  hashCode,
  newInviteCode,
  nowIso,
  publicUser,
  applyClientTemplate,
  assignClientTemplate,
  copyClientTemplate,
  deleteClientTemplate,
  linkClientsToTemplates,
  purpleHatDemoBusiness,
  renameClientTemplate,
  seedAdmin,
  seedClientBooks,
  seedEmptyBooks,
  applyBuilderSectionAction,
  builderCatalog,
  builderTemplateView,
  copyBuilderTemplate,
  createBuilderClient,
  createBuilderTemplate,
  importBuilderTemplate,
  replaceBuilderSections,
  saveTemplateDocument,
  seedBuilderCatalog,
  seedPurpleHatDemoTemplate,
  seedWealthTechTemplate,
  shortenWealthTechTemplateName,
  templateDocument,
  transaction,
  uploadsDir,
} from "./db.js";
import { parseTemplateFile, templateCsv, templateDownloadName, templateText } from "./templateFile.js";
import { builderOptions } from "./templateBuilder.js";
import { parseWorkbook, previewTabs, sectionsFromMapping } from "./templateSections.js";
import {
  deleteManagementReport,
  listAllManagementReports,
  listManagementReports,
  dashboardFigures,
  readManagementReport,
  renderManagementReportPdf,
  reportPdfFilename,
  saveManagementReport,
} from "./managementReports.js";
import { parseManagementWorkbook } from "./parseManagementWorkbook.js";
import { mailConfigured, sendInviteKeyEmail } from "./mail.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("Set JWT_SECRET in server/.env.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "1mb" }));

const hits = new Map();
function rateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 40) {
    res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
    return;
  }
  recent.push(now);
  hits.set(key, recent);
  next();
}

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function sign(user) {
  return jwt.sign({ sub: Number(user.id), role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (user.status !== "active") {
      const error = user.status === "suspended"
        ? "This account is suspended."
        : "This account is waiting for approval.";
      res.status(403).json({ error });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Sign in to continue." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access only." });
    return;
  }
  next();
}

function rands(cents) {
  return Math.round(Number(cents)) / 100;
}

function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const cents = Math.round(number * 100);
  if (Math.abs(cents) > 100_000_000_000) return null;
  return cents;
}

function readFinances(userId, { fromReports = false } = {}) {
  const row = db.prepare("SELECT * FROM finances WHERE user_id = ?").get(userId);
  const months = db.prepare(
    "SELECT month, revenue_cents, expenses_cents FROM finance_months WHERE user_id = ? ORDER BY month",
  ).all(userId);
  const events = db.prepare(
    "SELECT id, kind, description, amount_cents, occurred_at FROM ledger_events WHERE user_id = ? ORDER BY id DESC LIMIT 8",
  ).all(userId);
  const stored = {
    cash: row ? rands(row.cash_cents) : 0,
    revenue: row ? rands(row.revenue_cents) : 0,
    expenses: row ? rands(row.expenses_cents) : 0,
    receivables: row ? rands(row.receivables_cents) : 0,
    payables: row ? rands(row.payables_cents) : 0,
    source: row ? row.source : "empty",
    updatedAt: row ? row.updated_at : null,
    serverTime: nowIso(),
    months: months.map((month) => ({
      month: month.month,
      revenue: rands(month.revenue_cents),
      expenses: rands(month.expenses_cents),
    })),
    events: events.map((event) => ({
      id: Number(event.id),
      kind: event.kind,
      description: event.description,
      amount: rands(event.amount_cents),
      occurredAt: event.occurred_at,
    })),
  };
  if (!fromReports) return stored;
  const dash = dashboardFigures(userId);
  if (!dash.latest) {
    return {
      ...stored,
      cash: null,
      revenue: null,
      expenses: null,
      receivables: null,
      payables: null,
      source: "empty",
      months: dash.chart,
    };
  }
  return {
    ...stored,
    cash: dash.latest.cash,
    revenue: dash.latest.revenue,
    expenses: dash.latest.expenses,
    receivables: dash.latest.receivables,
    payables: dash.latest.payables,
    source: "report",
    months: dash.chart,
  };
}

function reportFinances(userId) {
  const { latest, months } = dashboardFigures(userId);
  if (!latest) {
    return {
      cash: null,
      revenue: null,
      expenses: null,
      receivables: null,
      payables: null,
      source: "empty",
      months: [],
    };
  }
  return {
    cash: latest.cash,
    revenue: latest.revenue,
    expenses: latest.expenses,
    receivables: latest.receivables,
    payables: latest.payables,
    source: "report",
    month: latest.month,
    months,
  };
}

function adminFigures(userId) {
  const reports = reportFinances(userId);
  const stored = readFinances(userId);
  const savedMonths = stored.source === "practice" ? stored.months : [];
  const months = (reports.months || []).map((month) => {
    const saved = savedMonths.find((item) => item.month === month.month);
    const source = saved || month;
    return {
      month: month.month,
      revenue: source.revenue ?? "",
      expenses: source.expenses ?? "",
    };
  });
  const headline = stored.source === "practice" ? stored : reports;
  return {
    cash: headline.cash ?? "",
    revenue: headline.revenue ?? "",
    expenses: headline.expenses ?? "",
    receivables: headline.receivables ?? "",
    payables: headline.payables ?? "",
    source: stored.source === "practice" ? "practice" : reports.source,
    months,
  };
}

function publicInvoice(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    number: row.number,
    description: row.description,
    amount: rands(row.amount_cents),
    status: row.status,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
  };
}

function publicRequest(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: row.user_name || undefined,
    businessName: row.business_name || undefined,
    email: row.user_email || undefined,
    title: row.title,
    kind: row.kind,
    details: row.details,
    budget: row.budget,
    neededBy: row.needed_by,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const imageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename(req, file, callback) {
      const ext = imageTypes[file.mimetype] || ".img";
      const who = req.params.id || req.user?.id || "user";
      callback(null, `${who}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!imageTypes[file.mimetype]) {
      callback(new Error("Use a JPG, PNG, or WebP photo."));
      return;
    }
    callback(null, true);
  },
});

const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const name = String(file.originalname || "").toLowerCase();
    if (!name.endsWith(".xlsx")) {
      callback(new Error("Upload an Excel .xlsx file."));
      return;
    }
    callback(null, true);
  },
}).single("file");

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const name = String(file.originalname || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      callback(new Error("Upload an Excel .xlsx or .xls file."));
      return;
    }
    callback(null, true);
  },
}).single("file");

function acceptExcel(req, res, next) {
  excelUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Use an Excel file under 8 MB."
      : (error.message || "Upload an Excel .xlsx or .xls file.");
    res.status(400).json({ error: message });
  });
}

function acceptWorkbook(req, res, next) {
  workbookUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error.code === "LIMIT_FILE_SIZE" ? "Use an Excel file under 8 MB." : (error.message || "Upload an Excel .xlsx file.");
    res.status(400).json({ error: message });
  });
}

function photoUpload(req, res, next) {
  upload.single("photo")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error.code === "LIMIT_FILE_SIZE" ? "Use a photo under 2 MB." : (error.message || "Could not upload that photo.");
    res.status(400).json({ error: message });
  });
}

function looksLikeImage(filePath, ext) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 12) return false;
  if (ext === ".png") return buf[0] === 0x89 && buf[1] === 0x50;
  if (ext === ".jpg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === ".webp") return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function storePhoto(user, file) {
  const ext = path.extname(file.filename).toLowerCase();
  if (!looksLikeImage(file.path, ext)) {
    fs.rmSync(file.path, { force: true });
    return { error: "Use a JPG, PNG, or WebP photo." };
  }
  if (user.photo_file && user.photo_file !== file.filename) {
    fs.rmSync(path.join(uploadsDir, user.photo_file), { force: true });
  }
  const ts = nowIso();
  db.prepare("UPDATE users SET photo_file = ?, updated_at = ? WHERE id = ?").run(file.filename, ts, user.id);
  return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", rateLimit, (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  const businessName = clean(req.body.businessName, 120);
  const phone = clean(req.body.phone, 40);
  const rawCode = clean(req.body.inviteCode, 40);
  if (!name) {
    res.status(400).json({ error: "Enter your name." });
    return;
  }
  if (!businessName) {
    res.status(400).json({ error: "Enter the business name." });
    return;
  }
  if (!isEmail(email)) {
    res.status(400).json({ error: "Enter a valid email." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Use at least 8 characters." });
    return;
  }
  if (password.length > 200) {
    res.status(400).json({ error: "Use a shorter password." });
    return;
  }
  const normalized = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^TH[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(normalized)) {
    res.status(400).json({ error: "Enter the invite key." });
    return;
  }

  const invite = db.prepare("SELECT * FROM invites WHERE code_hash = ?").get(hashCode(rawCode));
  if (!invite || invite.status === "revoked") {
    res.status(400).json({ error: "That invite key is not valid." });
    return;
  }
  if (invite.status === "used") {
    res.status(400).json({ error: "That invite key has already been used." });
    return;
  }
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) {
    res.status(400).json({ error: "That invite key has expired." });
    return;
  }
  if (invite.email && invite.email !== email) {
    res.status(400).json({ error: "Use the email address this key was issued for." });
    return;
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    res.status(400).json({ error: "That email is already registered." });
    return;
  }
  if (invite.template_id && !db.prepare("SELECT id FROM client_templates WHERE id = ?").get(invite.template_id)) {
    res.status(400).json({ error: "That invite's template is no longer available." });
    return;
  }

  const status = invite.approve_on_use ? "active" : "pending";
  const ts = nowIso();
  let userId;
  try {
    userId = transaction(() => {
      const current = db.prepare("SELECT status FROM invites WHERE id = ?").get(invite.id);
      if (!current || current.status !== "active") {
        const error = new Error("used");
        throw error;
      }
      const created = db.prepare(
        `INSERT INTO users (email, password_hash, name, business_name, phone, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'client', ?, ?, ?)`,
      ).run(email, bcrypt.hashSync(password, 10), name, businessName, phone, status, ts, ts);
      const id = Number(created.lastInsertRowid);
      const updated = db.prepare(
        "UPDATE invites SET status = 'used', used_by = ?, used_at = ? WHERE id = ? AND status = 'active'",
      ).run(id, ts, invite.id);
      if (!updated.changes) {
        const error = new Error("used");
        throw error;
      }
      if (invite.new_template) {
        db.prepare("UPDATE users SET needs_template = 1 WHERE id = ?").run(id);
        seedEmptyBooks(id);
        if (purpleHatDemoBusiness(businessName)) {
          db.prepare("UPDATE users SET report_template = 'purple-hat-demo' WHERE id = ?").run(id);
        }
      } else if (invite.template_id) applyClientTemplate(id, invite.template_id);
      else {
        seedClientBooks(id);
        if (purpleHatDemoBusiness(businessName)) {
          db.prepare("UPDATE users SET report_template = 'purple-hat-demo' WHERE id = ?").run(id);
        }
      }
      return id;
    });
  } catch (error) {
    if (error.message === "used") {
      res.status(400).json({ error: "That invite key has already been used." });
      return;
    }
    if (error.message === "template") {
      res.status(400).json({ error: "That invite's template is no longer available." });
      return;
    }
    if (String(error.message).includes("UNIQUE")) {
      res.status(400).json({ error: "That email is already registered." });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Could not create the account." });
    return;
  }

  const user = publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
  res.status(201).json({
    message: status === "active"
      ? "Account created. You can sign in."
      : "Account created. Purple Hat still needs to approve access.",
    user,
  });
});

app.post("/api/auth/login", rateLimit, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  const user = isEmail(email) ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : null;
  if (!user || !password || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  if (user.status === "pending") {
    res.status(403).json({ error: "This account is waiting for approval." });
    return;
  }
  if (user.status === "suspended") {
    res.status(403).json({ error: "This account is suspended." });
    return;
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/me", requireAuth, (req, res) => {
  if (req.user.role === "admin") {
    res.status(400).json({ error: "Update client details from the admin panel." });
    return;
  }
  const name = clean(req.body.name, 80);
  const businessName = clean(req.body.businessName, 120);
  const phone = clean(req.body.phone, 40);
  if (!name) {
    res.status(400).json({ error: "Enter your name." });
    return;
  }
  if (!businessName) {
    res.status(400).json({ error: "Enter the business name." });
    return;
  }
  const ts = nowIso();
  db.prepare("UPDATE users SET name = ?, business_name = ?, phone = ?, updated_at = ? WHERE id = ?").run(
    name,
    businessName,
    phone,
    ts,
    req.user.id,
  );
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
});

app.post("/api/me/photo", requireAuth, photoUpload, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Choose a photo." });
    return;
  }
  const saved = storePhoto(req.user, req.file);
  if (saved.error) {
    res.status(400).json({ error: saved.error });
    return;
  }
  res.json(saved);
});

app.get("/api/me/finances", requireAuth, (req, res) => {
  res.json(readFinances(req.user.id, { fromReports: true }));
});

app.get("/api/me/reports", requireAuth, (req, res) => {
  res.json({ reports: listManagementReports(req.user.id) });
});

app.get("/api/me/reports/:month/pdf", requireAuth, (req, res) => {
  sendManagementReportPdf(res, req.user, req.params.month);
});

app.get("/api/me/reports/:month", requireAuth, (req, res) => {
  const report = readManagementReport(req.user.id, req.params.month);
  if (!report) {
    res.status(404).json({ error: "That report was not found." });
    return;
  }
  res.json({
    report,
    businessName: req.user.business_name,
    reportTemplate: req.user.report_template === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech",
  });
});

app.get("/api/me/invoices", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY issued_on DESC, id DESC").all(req.user.id);
  res.json({ invoices: rows.map(publicInvoice) });
});

app.get("/api/me/requests", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM build_requests WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  res.json({ requests: rows.map(publicRequest) });
});

const requestKinds = new Set(["website", "integration", "report", "other"]);

app.post("/api/me/requests", requireAuth, (req, res) => {
  const title = clean(req.body.title, 120);
  const kind = clean(req.body.kind, 40);
  const details = clean(req.body.details, 2000);
  const budget = clean(req.body.budget, 80);
  const neededBy = clean(req.body.neededBy, 10);
  if (!title) {
    res.status(400).json({ error: "Enter a title." });
    return;
  }
  if (!requestKinds.has(kind)) {
    res.status(400).json({ error: "Choose a request type." });
    return;
  }
  if (!details) {
    res.status(400).json({ error: "Describe the build." });
    return;
  }
  if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) {
    res.status(400).json({ error: "Enter a valid date." });
    return;
  }
  const ts = nowIso();
  const created = db.prepare(
    `INSERT INTO build_requests (user_id, title, kind, details, budget, needed_by, status, admin_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'submitted', '', ?, ?)`,
  ).run(req.user.id, title, kind, details, budget, neededBy || null, ts, ts);
  const row = db.prepare("SELECT * FROM build_requests WHERE id = ?").get(Number(created.lastInsertRowid));
  res.status(201).json({ request: publicRequest(row) });
});

app.get("/api/admin/reports", requireAuth, requireAdmin, (req, res) => {
  res.json({ reports: listAllManagementReports() });
});

app.post("/api/admin/reports", requireAuth, requireAdmin, acceptWorkbook, async (req, res) => {
  const month = String(req.body.month || "");
  const userId = Number(req.body.userId);
  const replace = String(req.body.replace || "") === "1";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ error: "Choose a report month." });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user || user.role !== "client") {
    res.status(400).json({ error: "Choose a client." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Choose an Excel file." });
    return;
  }
  const header = req.file.buffer.subarray(0, 2).toString("utf8");
  if (header !== "PK") {
    res.status(400).json({ error: "Upload an Excel .xlsx file." });
    return;
  }
  let parsed;
  try {
    parsed = await parseManagementWorkbook(req.file.buffer);
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not read that Excel file." });
    return;
  }
  const saved = saveManagementReport({
    userId: user.id,
    month,
    entityName: parsed.entityName,
    sections: parsed.sections,
    replace,
  });
  if (saved.error) {
    res.status(400).json({ error: saved.error });
    return;
  }
  if (saved.exists && !replace) {
    res.status(409).json({
      error: `${user.business_name || user.name} already has a report for ${saved.title}. Replace it?`,
      exists: true,
    });
    return;
  }
  res.status(saved.replaced ? 200 : 201).json({
    replaced: Boolean(saved.replaced),
    report: {
      ...saved.report,
      userId: Number(user.id),
      businessName: user.business_name,
      name: user.name,
      email: user.email,
    },
  });
});

app.delete("/api/admin/users/:id/reports/:month", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const removed = deleteManagementReport(user.id, req.params.month);
  if (!removed) {
    res.status(404).json({ error: "That report was not found." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY id DESC").all();
  res.json({ users: rows.map(publicUser) });
});

app.get("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const invoices = db.prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY issued_on DESC, id DESC").all(user.id);
  res.json({
    user: publicUser(user),
    bootstrap: isProtectedAdmin(user.email),
    finances: adminFigures(user.id),
    invoices: invoices.map(publicInvoice),
    reports: listManagementReports(user.id),
  });
});

app.get("/api/admin/users/:id/reports/:month/pdf", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  sendManagementReportPdf(res, user, req.params.month);
});

app.get("/api/admin/users/:id/reports/:month", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const report = readManagementReport(user.id, req.params.month);
  if (!report) {
    res.status(404).json({ error: "That report was not found." });
    return;
  }
  res.json({
    report,
    businessName: user.business_name,
    reportTemplate: user.report_template === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech",
  });
});

app.patch("/api/admin/users/:id/template", requireAuth, requireAdmin, (req, res) => {
  const result = assignClientTemplate(Number(req.params.id), Number(req.body.templateId));
  if (result.error) {
    const missing = result.error === "That person was not found." || result.error === "That template was not found.";
    res.status(missing ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ user: result.user });
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const name = clean(req.body.name ?? user.name, 80);
  const email = clean(req.body.email ?? user.email, 120).toLowerCase();
  const businessName = clean(req.body.businessName ?? user.business_name, 120);
  const phone = clean(req.body.phone ?? user.phone, 40);
  const role = clean(req.body.role ?? user.role, 20);
  const status = clean(req.body.status ?? user.status, 20);
  const password = String(req.body.password || "");
  if (!name) {
    res.status(400).json({ error: "Enter a name." });
    return;
  }
  if (!isEmail(email)) {
    res.status(400).json({ error: "Enter a valid email." });
    return;
  }
  if (!["admin", "client"].includes(role) || !["pending", "active", "suspended"].includes(status)) {
    res.status(400).json({ error: "Choose a valid role and access." });
    return;
  }
  const bootstrap = isProtectedAdmin(user.email);
  if (bootstrap && email !== user.email) {
    res.status(400).json({ error: "Change this admin email in server/.env." });
    return;
  }
  if (bootstrap && (role !== "admin" || status !== "active")) {
    res.status(400).json({ error: "This admin account stays active." });
    return;
  }
  if (Number(user.id) === Number(req.user.id) && (role !== "admin" || status !== "active")) {
    res.status(400).json({ error: "You cannot change your own access." });
    return;
  }
  if (password && bootstrap) {
    res.status(400).json({ error: "Set ADMIN_PASSWORD in server/.env and restart." });
    return;
  }
  if (password && password.length < 8) {
    res.status(400).json({ error: "Use at least 8 characters." });
    return;
  }
  if (password.length > 200) {
    res.status(400).json({ error: "Use a shorter password." });
    return;
  }
  const duplicate = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id);
  if (duplicate) {
    res.status(400).json({ error: "That email is already registered." });
    return;
  }
  const ts = nowIso();
  if (password) {
    db.prepare(
      `UPDATE users SET name = ?, email = ?, business_name = ?, phone = ?, role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
    ).run(name, email, businessName, phone, role, status, bcrypt.hashSync(password, 10), ts, user.id);
  } else {
    db.prepare(
      `UPDATE users SET name = ?, email = ?, business_name = ?, phone = ?, role = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(name, email, businessName, phone, role, status, ts, user.id);
  }
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
});

app.post("/api/admin/users/:id/photo", requireAuth, requireAdmin, photoUpload, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Choose a photo." });
    return;
  }
  const saved = storePhoto(user, req.file);
  if (saved.error) {
    res.status(400).json({ error: saved.error });
    return;
  }
  res.json(saved);
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  if (isProtectedAdmin(user.email)) {
    res.status(400).json({ error: "This admin account cannot be deleted." });
    return;
  }
  if (Number(user.id) === Number(req.user.id)) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }
  try {
    transaction(() => {
      db.prepare("UPDATE invites SET created_by = NULL WHERE created_by = ?").run(user.id);
      db.prepare("UPDATE invites SET used_by = NULL WHERE used_by = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    });
  } catch {
    res.status(400).json({ error: "That account could not be deleted." });
    return;
  }
  if (user.photo_file) fs.rmSync(path.join(uploadsDir, user.photo_file), { force: true });
  res.json({ ok: true });
});

app.put("/api/admin/users/:id/finances", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const fields = ["cash", "revenue", "expenses", "receivables", "payables"];
  const cents = {};
  for (const field of fields) {
    const value = toCents(req.body[field]);
    if (value === null || value < 0) {
      res.status(400).json({ error: "Enter amounts as zero or more." });
      return;
    }
    cents[field] = value;
  }
  const months = Array.isArray(req.body.months) ? req.body.months : null;
  if (months) {
    for (const month of months) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month.month || ""))) {
        res.status(400).json({ error: "Enter a valid month." });
        return;
      }
      const revenue = toCents(month.revenue);
      const expenses = toCents(month.expenses);
      if (revenue === null || expenses === null || revenue < 0 || expenses < 0) {
        res.status(400).json({ error: "Enter amounts as zero or more." });
        return;
      }
    }
  }
  let event = null;
  if (req.body.event && clean(req.body.event.description, 160)) {
    const kind = clean(req.body.event.kind, 20);
    const description = clean(req.body.event.description, 160);
    const amount = toCents(req.body.event.amount);
    if (!["receipt", "bill", "adjustment"].includes(kind) || amount === null) {
      res.status(400).json({ error: "Check the movement amount." });
      return;
    }
    let signed = amount;
    if (kind === "bill") signed = -Math.abs(amount);
    if (kind === "receipt") signed = Math.abs(amount);
    event = { kind, description, amount: signed };
  }
  const ts = nowIso();
  transaction(() => {
    db.prepare(
      `INSERT INTO finances (user_id, cash_cents, revenue_cents, expenses_cents, receivables_cents, payables_cents, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'practice', ?)
       ON CONFLICT(user_id) DO UPDATE SET
         cash_cents = excluded.cash_cents,
         revenue_cents = excluded.revenue_cents,
         expenses_cents = excluded.expenses_cents,
         receivables_cents = excluded.receivables_cents,
         payables_cents = excluded.payables_cents,
         source = 'practice',
         updated_at = excluded.updated_at`,
    ).run(user.id, cents.cash, cents.revenue, cents.expenses, cents.receivables, cents.payables, ts);
    if (months) {
      db.prepare("DELETE FROM finance_months WHERE user_id = ?").run(user.id);
      const insert = db.prepare(
        "INSERT INTO finance_months (user_id, month, revenue_cents, expenses_cents) VALUES (?, ?, ?, ?)",
      );
      months.forEach((month) => insert.run(user.id, month.month, toCents(month.revenue), toCents(month.expenses)));
    }
    if (event) {
      db.prepare(
        "INSERT INTO ledger_events (user_id, kind, description, amount_cents, occurred_at) VALUES (?, ?, ?, ?, ?)",
      ).run(user.id, event.kind, event.description, event.amount, ts);
    }
  });
  res.json(readFinances(user.id));
});

const invoiceStatuses = new Set(["draft", "sent", "paid", "overdue"]);

app.post("/api/admin/users/:id/invoices", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "That person was not found." });
    return;
  }
  const number = clean(req.body.number, 40);
  const description = clean(req.body.description, 160);
  const amount = toCents(req.body.amount);
  const status = clean(req.body.status, 20);
  const issuedOn = clean(req.body.issuedOn, 10);
  const dueOn = clean(req.body.dueOn, 10);
  if (!number || !description) {
    res.status(400).json({ error: "Enter the invoice number and description." });
    return;
  }
  if (amount === null || amount < 0) {
    res.status(400).json({ error: "Enter an amount of zero or more." });
    return;
  }
  if (!invoiceStatuses.has(status)) {
    res.status(400).json({ error: "Choose a valid status." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    res.status(400).json({ error: "Enter valid dates." });
    return;
  }
  const duplicate = db.prepare("SELECT id FROM invoices WHERE user_id = ? AND number = ?").get(user.id, number);
  if (duplicate) {
    res.status(400).json({ error: "That invoice number is already used." });
    return;
  }
  const created = db.prepare(
    `INSERT INTO invoices (user_id, number, description, amount_cents, status, issued_on, due_on)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(user.id, number, description, amount, status, issuedOn, dueOn);
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(Number(created.lastInsertRowid));
  res.status(201).json({ invoice: publicInvoice(row) });
});

app.patch("/api/admin/invoices/:id", requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "That invoice was not found." });
    return;
  }
  const number = req.body.number === undefined ? row.number : clean(req.body.number, 40);
  const status = clean(req.body.status ?? row.status, 20);
  const description = clean(req.body.description ?? row.description, 160);
  const amount = req.body.amount === undefined ? Number(row.amount_cents) : toCents(req.body.amount);
  const issuedOn = req.body.issuedOn === undefined ? row.issued_on : clean(req.body.issuedOn, 10);
  const dueOn = req.body.dueOn === undefined ? row.due_on : clean(req.body.dueOn, 10);
  if (!number || !invoiceStatuses.has(status) || !description || amount === null || amount < 0) {
    res.status(400).json({ error: "Check the invoice details." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    res.status(400).json({ error: "Enter valid dates." });
    return;
  }
  const duplicate = db.prepare(
    "SELECT id FROM invoices WHERE user_id = ? AND number = ? AND id != ?",
  ).get(row.user_id, number, row.id);
  if (duplicate) {
    res.status(400).json({ error: "That invoice number is already used." });
    return;
  }
  db.prepare(
    "UPDATE invoices SET number = ?, status = ?, description = ?, amount_cents = ?, issued_on = ?, due_on = ? WHERE id = ?",
  ).run(number, status, description, amount, issuedOn, dueOn, row.id);
  res.json({ invoice: publicInvoice(db.prepare("SELECT * FROM invoices WHERE id = ?").get(row.id)) });
});

app.delete("/api/admin/invoices/:id", requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM invoices WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "That invoice was not found." });
    return;
  }
  db.prepare("DELETE FROM invoices WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

app.get("/api/admin/invites", requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT invites.*, users.name AS used_by_name, users.email AS used_by_email,
            client_templates.name AS template_name
     FROM invites
     LEFT JOIN users ON users.id = invites.used_by
     LEFT JOIN client_templates ON client_templates.id = invites.template_id
     ORDER BY invites.id DESC`,
  ).all();
  res.json({
    invites: rows.map((row) => ({
      id: Number(row.id),
      label: row.label,
      email: row.email,
      codeHint: row.code_hint,
      approveOnUse: Boolean(row.approve_on_use),
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      usedAt: row.used_at,
      usedByName: row.used_by_name,
      usedByEmail: row.used_by_email,
      templateId: row.template_id ? Number(row.template_id) : null,
      templateName: row.new_template ? "New client template" : (row.template_name || (row.template_id ? "Removed template" : null)),
      newTemplate: Boolean(row.new_template),
    })),
  });
});

function publicTemplate(template) {
  const reports = db.prepare(
    "SELECT month, title FROM client_template_reports WHERE template_id = ? ORDER BY month",
  ).all(template.id);
  const movements = db.prepare(
    "SELECT description FROM client_template_events WHERE template_id = ? ORDER BY id",
  ).all(template.id);
  const copiedFrom = template.copied_from_id
    ? db.prepare("SELECT name FROM client_templates WHERE id = ?").get(template.copied_from_id)
    : null;
  return {
    id: Number(template.id),
    key: template.template_key,
    name: template.name,
    sourceBusiness: template.source_business,
    reportTemplate: template.report_template === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech",
    copiedFromName: copiedFrom?.name || null,
    createdAt: template.created_at,
    reports: reports.map((report) => ({ month: report.month, title: report.title })),
    movements: movements.map((event) => event.description),
  };
}

app.get("/api/admin/templates", requireAuth, requireAdmin, (req, res) => {
  const templates = db.prepare("SELECT * FROM client_templates ORDER BY id").all();
  res.json({ templates: templates.map(publicTemplate) });
});

const templateFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("file");

function acceptTemplateFile(req, res, next) {
  templateFileUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error.code === "LIMIT_FILE_SIZE" ? "Use a CSV or text file under 8 MB." : (error.message || "Choose a CSV or text file.");
    res.status(400).json({ error: message });
  });
}

app.get("/api/admin/templates/:id/file", requireAuth, requireAdmin, (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "text";
  let document;
  try {
    document = templateDocument(Number(req.params.id));
  } catch {
    res.status(500).json({ error: "That template could not be saved as a file." });
    return;
  }
  if (!document) {
    res.status(404).json({ error: "That template was not found." });
    return;
  }
  const filename = templateDownloadName(document.template.name, format);
  const body = format === "csv" ? `\uFEFF${templateCsv(document)}` : templateText(document);
  res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
});

app.post("/api/admin/templates/upload", requireAuth, requireAdmin, acceptTemplateFile, (req, res) => {
  const name = String(req.file?.originalname || "").toLowerCase();
  if (!req.file) {
    res.status(400).json({ error: "Choose a CSV or text file." });
    return;
  }
  if (!name.endsWith(".csv") && !name.endsWith(".txt") && !name.endsWith(".json")) {
    res.status(400).json({ error: "Upload a CSV or text file." });
    return;
  }
  const parsed = parseTemplateFile(req.file.buffer.toString("utf8"), req.file.originalname);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const saved = saveTemplateDocument(parsed.document);
  if (saved.error) {
    res.status(400).json({ error: saved.error });
    return;
  }
  const template = db.prepare("SELECT * FROM client_templates WHERE id = ?").get(saved.id);
  res.status(201).json({ template: publicTemplate(template), clientsUpdated: saved.clientsUpdated });
});

app.post("/api/admin/templates/copy", requireAuth, requireAdmin, (req, res) => {
  const result = copyClientTemplate(Number(req.body.sourceId), clean(req.body.name, 120));
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  const template = db.prepare("SELECT * FROM client_templates WHERE id = ?").get(result.id);
  res.status(201).json({ template: publicTemplate(template) });
});

app.delete("/api/admin/templates/:id", requireAuth, requireAdmin, (req, res) => {
  const result = deleteClientTemplate(Number(req.params.id));
  if (result.error) {
    res.status(result.error === "That template was not found." ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ deleted: true, id: result.id, name: result.name });
});

app.patch("/api/admin/templates/:id", requireAuth, requireAdmin, (req, res) => {
  const result = renameClientTemplate(Number(req.params.id), clean(req.body.name, 120));
  if (result.error) {
    res.status(result.error === "That template was not found." ? 404 : 400).json({ error: result.error });
    return;
  }
  const template = db.prepare("SELECT * FROM client_templates WHERE id = ?").get(result.id);
  res.json({ template: publicTemplate(template) });
});

app.get("/api/admin/template-builder", requireAuth, requireAdmin, (req, res) => {
  res.json({ ...builderCatalog(), options: builderOptions() });
});

app.get("/api/admin/template-builder/clients/:clientId/templates/:templateId", requireAuth, requireAdmin, (req, res) => {
  const view = builderTemplateView(Number(req.params.clientId), Number(req.params.templateId));
  if (!view) {
    res.status(404).json({ error: "That template was not found." });
    return;
  }
  res.json(view);
});

app.post("/api/admin/template-builder/clients", requireAuth, requireAdmin, (req, res) => {
  const result = createBuilderClient({
    name: clean(req.body.name, 120),
    framework: clean(req.body.framework, 40),
    currency: clean(req.body.currency, 8),
    yearEnd: clean(req.body.yearEnd, 8),
    period: clean(req.body.period, 20),
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/admin/template-builder/clients/:clientId/templates", requireAuth, requireAdmin, (req, res) => {
  const framework = clean(req.body.framework, 40);
  const period = clean(req.body.period, 20);
  const result = createBuilderTemplate(Number(req.params.clientId), {
    name: clean(req.body.name, 120),
    ...(framework ? { framework } : {}),
    ...(period ? { period } : {}),
  });
  if (result.error) {
    res.status(result.error === "That client was not found." ? 404 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/admin/template-builder/clients/:clientId/templates/copy", requireAuth, requireAdmin, (req, res) => {
  const result = copyBuilderTemplate(Number(req.params.clientId), Number(req.body.sourceId));
  if (result.error) {
    res.status(result.error === "That client was not found." ? 404 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/admin/template-builder/clients/:clientId/templates/import", requireAuth, requireAdmin, acceptTemplateFile, (req, res) => {
  const name = String(req.file?.originalname || "").toLowerCase();
  if (!req.file) {
    res.status(400).json({ error: "Choose a CSV file." });
    return;
  }
  if (!name.endsWith(".csv") && !name.endsWith(".txt") && !name.endsWith(".json")) {
    res.status(400).json({ error: "Upload a CSV or text file." });
    return;
  }
  const parsed = parseTemplateFile(req.file.buffer.toString("utf8"), req.file.originalname);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const saved = importBuilderTemplate(Number(req.params.clientId), parsed.document);
  if (saved.error) {
    res.status(saved.error === "That client was not found." ? 404 : 400).json({ error: saved.error });
    return;
  }
  res.status(201).json(saved);
});

app.post("/api/admin/template-builder/clients/:clientId/templates/:templateId/sections", requireAuth, requireAdmin, (req, res) => {
  const patch = req.body.patch && typeof req.body.patch === "object" && !Array.isArray(req.body.patch) ? req.body.patch : {};
  const result = applyBuilderSectionAction(Number(req.params.clientId), Number(req.params.templateId), {
    action: clean(req.body.action, 20),
    sectionType: clean(req.body.sectionType, 40),
    id: clean(req.body.id, 40),
    ids: Array.isArray(req.body.ids) ? req.body.ids.map((id) => clean(id, 40)) : [],
    patch,
  });
  if (result.error) {
    res.status(result.error === "That template was not found." ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/admin/template-builder/clients/:clientId/templates/:templateId/excel", requireAuth, requireAdmin, acceptExcel, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const templateId = Number(req.params.templateId);
  if (!builderTemplateView(clientId, templateId)) {
    res.status(404).json({ error: "That template was not found." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Choose an Excel file." });
    return;
  }
  const parsed = await parseWorkbook(req.file.buffer);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!req.body.mapping) {
    res.json({ tabs: previewTabs(parsed.tabs) });
    return;
  }
  let mapping;
  try {
    mapping = JSON.parse(String(req.body.mapping));
  } catch {
    res.status(400).json({ error: "The tab mapping could not be read." });
    return;
  }
  if (!Array.isArray(mapping)) {
    res.status(400).json({ error: "The tab mapping could not be read." });
    return;
  }
  const built = sectionsFromMapping(parsed.tabs, mapping);
  if (built.error) {
    res.status(400).json({ error: built.error });
    return;
  }
  const saved = replaceBuilderSections(clientId, templateId, built.sections);
  if (saved.error) {
    res.status(saved.error === "That template was not found." ? 404 : 400).json({ error: saved.error });
    return;
  }
  res.json(saved);
});

app.post("/api/admin/invites", requireAuth, requireAdmin, async (req, res) => {
  const label = clean(req.body.label, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const days = req.body.expiresInDays;
  const approveOnUse = req.body.approveOnUse === false ? 0 : 1;
  const newTemplate = req.body.templateId === "new";
  const templateId = Number(req.body.templateId);
  const template = !newTemplate && Number.isInteger(templateId)
    ? db.prepare("SELECT id, name FROM client_templates WHERE id = ?").get(templateId)
    : null;
  if (!label) {
    res.status(400).json({ error: "Say who this key is for." });
    return;
  }
  if (!newTemplate && !template) {
    res.status(400).json({ error: "Choose a client template." });
    return;
  }
  const sendEmail = req.body.sendEmail === true;
  if (email && !isEmail(email)) {
    res.status(400).json({ error: "Enter a valid email, or leave it blank." });
    return;
  }
  if (sendEmail && !email) {
    res.status(400).json({ error: "Enter the email address to send the key to." });
    return;
  }
  if (sendEmail && !mailConfigured()) {
    res.status(400).json({ error: "Email sending is not set up yet. The key was not created." });
    return;
  }
  let expiresAt = null;
  if (days !== "" && days !== null && days !== undefined) {
    const count = Number(days);
    if (!Number.isInteger(count) || count < 1 || count > 365) {
      res.status(400).json({ error: "Choose an expiry between 1 and 365 days." });
      return;
    }
    expiresAt = new Date(Date.now() + count * 24 * 60 * 60 * 1000).toISOString();
  }
  const code = newInviteCode();
  const ts = nowIso();
  const created = db.prepare(
    `INSERT INTO invites (code_hash, code_hint, label, email, approve_on_use, status, expires_at, created_by, created_at, template_id, new_template)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  ).run(
    hashCode(code),
    codeHint(code),
    label,
    email || null,
    approveOnUse,
    expiresAt,
    req.user.id,
    ts,
    newTemplate ? null : template.id,
    newTemplate ? 1 : 0,
  );
  let emailSent = false;
  let emailError = "";
  if (sendEmail) {
    try {
      await sendInviteKeyEmail({ to: email, code, label, expiresInDays: expiresAt ? Number(days) : null });
      emailSent = true;
    } catch (error) {
      console.error("Invite email failed.", error instanceof Error ? error.message : error);
      emailError = "The key was created, but the email could not be sent.";
    }
  }
  res.status(201).json({
    code,
    emailSent,
    emailError,
    invite: {
      id: Number(created.lastInsertRowid),
      label,
      email: email || null,
      codeHint: codeHint(code),
      approveOnUse: Boolean(approveOnUse),
      status: "active",
      expiresAt,
      createdAt: ts,
      templateId: newTemplate ? null : Number(template.id),
      templateName: newTemplate ? "New client template" : template.name,
      newTemplate,
    },
  });
});

app.post("/api/admin/invites/:id/revoke", requireAuth, requireAdmin, (req, res) => {
  const invite = db.prepare("SELECT * FROM invites WHERE id = ?").get(req.params.id);
  if (!invite) {
    res.status(404).json({ error: "That key was not found." });
    return;
  }
  if (invite.status !== "active") {
    res.status(400).json({ error: "Only an unused key can be revoked." });
    return;
  }
  db.prepare("UPDATE invites SET status = 'revoked' WHERE id = ?").run(invite.id);
  res.json({ ok: true });
});

app.get("/api/admin/requests", requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(
    `SELECT build_requests.*, users.name AS user_name, users.business_name, users.email AS user_email
     FROM build_requests
     JOIN users ON users.id = build_requests.user_id
     ORDER BY build_requests.id DESC`,
  ).all();
  res.json({ requests: rows.map(publicRequest) });
});

const requestStatuses = new Set(["submitted", "reviewing", "in_progress", "done", "declined"]);

app.patch("/api/admin/requests/:id", requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM build_requests WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "That request was not found." });
    return;
  }
  const status = clean(req.body.status ?? row.status, 20);
  const adminNote = clean(req.body.adminNote ?? row.admin_note, 1000);
  if (!requestStatuses.has(status)) {
    res.status(400).json({ error: "Choose a valid status." });
    return;
  }
  const ts = nowIso();
  db.prepare("UPDATE build_requests SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?").run(
    status,
    adminNote,
    ts,
    row.id,
  );
  const next = db.prepare(
    `SELECT build_requests.*, users.name AS user_name, users.business_name, users.email AS user_email
     FROM build_requests
     JOIN users ON users.id = build_requests.user_id
     WHERE build_requests.id = ?`,
  ).get(row.id);
  res.json({ request: publicRequest(next) });
});

app.use("/uploads", express.static(uploadsDir, { index: false, dotfiles: "deny" }));
app.use("/uploads", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDist = path.join(serverDir, "..", "client", "dist");
const siteRoot = [path.join(serverDir, "..", ".."), path.join(serverDir, "..", "site")].find((dir) =>
  fs.existsSync(path.join(dir, "index.html")),
);
const marketingFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/integrations.html": "integrations.html",
  "/integrations-booking-calendar.html": "integrations-booking-calendar.html",
  "/logo.png": "logo.png",
};

function sendManagementReportPdf(res, user, month) {
  const report = readManagementReport(user.id, month);
  if (!report) {
    res.status(404).json({ error: "That report was not found." });
    return;
  }
  renderManagementReportPdf(report, user)
    .then((pdf) => {
      const filename = reportPdfFilename(user.business_name, report.month);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdf);
    })
    .catch((error) => {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: "Could not prepare the PDF." });
    });
}

function isAppPath(pathname) {
  const name = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return name === "/login"
    || name === "/dashboard"
    || name === "/register"
    || name === "/billing"
    || name === "/request"
    || name === "/business"
    || name === "/reports"
    || name.startsWith("/reports/")
    || name === "/statements"
    || name === "/admin"
    || name.startsWith("/admin/");
}

if (siteRoot) {
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    const fileName = marketingFiles[req.path];
    if (!fileName) {
      next();
      return;
    }
    const filePath = path.join(siteRoot, fileName);
    if (!fs.existsSync(filePath)) {
      next();
      return;
    }
    res.sendFile(filePath);
  });
}

if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist, { index: false, dotfiles: "deny" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      next();
      return;
    }
    if (!isAppPath(req.path)) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

const admin = seedAdmin();
seedWealthTechTemplate();
seedPurpleHatDemoTemplate();
shortenWealthTechTemplateName();
linkClientsToTemplates();
seedBuilderCatalog();
const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Thinking Hat API on http://localhost:${port}`);
  console.log(`Admin email: ${admin.email}`);
  console.log(`Data directory: ${path.dirname(uploadsDir)}`);
});
