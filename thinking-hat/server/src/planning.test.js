import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cashMonthPack,
  cashPosition,
  cashWeekPack,
  isPlanningClient,
  loadPlanning,
  missingRedReasons,
  ragFor,
  recalcTotals,
  redLinesFor,
  variance,
  variancePack,
} from "./planning.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverEntry = path.join(repoRoot, "thinking-hat", "server", "src", "index.js");
const demoPassword = randomBytes(18).toString("base64url");
const adminPassword = randomBytes(18).toString("base64url");

function line(rows, key) {
  return rows.find((item) => item.key === key);
}

test("stored totals are recalculated from the input lines", () => {
  const { budget2026 } = loadPlanning("purple-hat-demo");
  const source = { ...budget2026.actuals.monthActual, net_revenue: 1, net_income: 1, gross_profit: 1 };
  const totals = recalcTotals(budget2026.lines, source);
  assert.equal(totals.net_revenue, 86700);
  assert.equal(totals.net_income, 7760);
  assert.equal(totals.gross_profit, totals.net_revenue - totals.cogs);
  const returns = variance("returns_and_refunds", -3600, -3700);
  assert.equal(returns.dollars, 100);
  assert.ok(Math.abs(returns.pct - (100 / 3700)) < 1e-9);
});

test("December 2026 and year-to-date control totals", () => {
  const pack = variancePack();
  const monthRevenue = line(pack.month.rows, "net_revenue");
  const monthIncome = line(pack.month.rows, "net_income");
  const ytdRevenue = line(pack.ytd.rows, "net_revenue");
  const ytdIncome = line(pack.ytd.rows, "net_income");
  assert.equal(monthRevenue.actual, 86700);
  assert.equal(monthIncome.actual, 7760);
  assert.equal(monthRevenue.budget, 92900);
  assert.equal(monthIncome.budget, 11040);
  assert.equal(ytdRevenue.actual, 712800);
  assert.equal(ytdIncome.actual, 19070);
  assert.equal(ytdRevenue.budget, 734200);
  assert.equal(ytdIncome.budget, 30640);
  assert.deepEqual(pack.month.kpis.redLines.map((item) => item.key), ["online_product_sales"]);
  assert.equal(line(pack.month.rows, "shipping_income").rag, "green");
  assert.equal(line(pack.month.rows, "office").rag, "green");
  assert.equal(line(pack.month.rows, "marketing").rag, "amber");
  assert.equal(line(pack.month.rows, "wages").rag, "amber");
  assert.equal(missingRedReasons(redLinesFor(pack.month), pack.seedLineReasons).length, 0);
  assert.equal(missingRedReasons(redLinesFor(pack.month), {}).length, 1);
});

test("FY2027 budget versions keep the approved and draft totals", () => {
  const { budget2026, budget2027 } = loadPlanning("purple-hat-demo");
  const fy2026 = budget2026.versions[0];
  const approved = budget2027.versions.find((version) => version.id === "fy2027-v1");
  const draft = budget2027.versions.find((version) => version.id === "fy2027-q1-rf");
  assert.equal(fy2026.status, "approved");
  assert.equal(fy2026.locked, true);
  assert.equal(fy2026.ytdThrough["2026-12"].net_revenue, 734200);
  assert.equal(fy2026.ytdThrough["2026-12"].net_income, 30640);
  assert.equal(fy2026.fyTotal, null);
  assert.equal(approved.status, "approved");
  assert.equal(approved.locked, true);
  assert.equal(approved.fyTotal.net_revenue, 769910);
  assert.equal(approved.fyTotal.net_income, 22170);
  assert.equal(draft.status, "draft");
  assert.equal(draft.locked, false);
  assert.equal(draft.fyTotal.net_revenue, 768910);
  assert.equal(draft.fyTotal.net_income, 21930);
});

test("RAG stays green at 2 percent, amber at 5 percent, and red only past both gates", () => {
  assert.equal(ragFor(-600, -0.02), "green");
  assert.equal(ragFor(-600, -0.05), "amber");
  assert.equal(ragFor(-1001, -0.05), "amber");
  assert.equal(ragFor(-499, -0.1), "green");
  assert.equal(ragFor(-501, -0.1), "amber");
  assert.equal(ragFor(-1000, -0.1), "amber");
  assert.equal(ragFor(-1001, -0.05001), "red");
  assert.equal(ragFor(5000, -0.2), "green");
  assert.equal(ragFor(1, 0.5), "green");
});

test("cash scenarios and the monthly bridge match the control totals", () => {
  const week = cashWeekPack();
  const base = week.positions.base;
  const downside = week.positions.downside;
  const upside = week.positions.upside;
  assert.equal(week.openingCash, 71970);
  assert.equal(week.minimumCash, 50000);
  assert.equal(base.week13Closing, 58930);
  assert.equal(base.low.amount, 55550);
  assert.equal(base.low.week, 11);
  assert.equal(downside.low.amount, 39139);
  assert.equal(downside.low.week, 11);
  assert.equal(downside.week13Closing, 40459);
  assert.equal(upside.week13Closing, 65566);
  assert.equal(upside.low.amount, 61156);
  assert.equal(upside.low.week, 11);
  const { cash13 } = loadPlanning("purple-hat-demo");
  const direct = cashPosition(cash13, "upside");
  assert.equal(direct.weeks[8].closing, 89392);
  assert.equal(direct.weeks[10].closing, 61156);
  const ageing = (rows) => Object.values(rows).reduce((sum, row) => (
    sum + row.current + row["30"] + row["60"] + row["90"]
  ), 0);
  assert.equal(ageing(week.arAgingOpening.rows), 12500);
  assert.equal(ageing(week.apAgingOpening.rows), 8400);

  const month = cashMonthPack();
  assert.equal(month.low.amount, 38092);
  assert.equal(month.low.period, "2027-10");
  assert.equal(month.yearEnd, 68841);
  assert.deepEqual(month.tieOut.map((item) => item.weekForecast), [84050, 78780, 58930]);
  assert.equal(month.tieOut[0].difference, month.tieOut[0].monthlyClosing - 84050);
  const closing = month.rows.find((item) => item.key === "closing").values;
  assert.equal(closing[0], month.openingCash + month.rows.find((item) => item.key === "netCashFlow").values[0]);
});

test("the planning gate matches the demo template and ignores a wealth-tech name", () => {
  assert.equal(isPlanningClient({ report_template: "purple-hat-demo", business_name: "Other" }), true);
  assert.equal(isPlanningClient({ report_template: "wealth-tech", business_name: "Purple Hat Demo LLC" }), false);
  assert.equal(isPlanningClient({ reportTemplate: "wealth-tech", businessName: "PurpleHat Demo, LLC" }), false);
  assert.equal(isPlanningClient({ business_name: "PurpleHat Demo, LLC" }), true);
  assert.equal(isPlanningClient({ business_name: "Purple Hat" }), false);
});

function freePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => {
      if (start > 9100) reject(new Error("No free port for the planning test."));
      else resolve(freePort(start + 1));
    });
    server.listen(start, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(text) {
  return String(text).split(demoPassword).join("[redacted]").split(adminPassword).join("[redacted]").replace(/password[^\n]*/gi, "[redacted]");
}

function startServer(port, dataDir) {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(repoRoot, "thinking-hat"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: "planning-route-test-secret",
      ADMIN_PASSWORD: adminPassword,
      ADMIN_EMAIL: "probe@example.com",
      DEMO_PASSWORD: demoPassword,
      DEMO_AUTO_RESET: "",
      CHROME_PATH: "",
      PUPPETEER_EXECUTABLE_PATH: "",
      TRADER_WARMUP: "0",
      BASIC_AUTH_PASSWORD: "",
      PURPLEHAT_STAGING: "",
      THINKING_HAT_NO_LISTEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log = `${log}${chunk}`.slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    log = `${log}${chunk}`.slice(-4000);
  });
  return { child, log: () => redact(log) };
}

async function waitHealth(port, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode != null) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200) return true;
    } catch {
      // The process is still opening its port.
    }
    await sleep(250);
  }
  return false;
}

function stop(child) {
  if (child.exitCode != null) return Promise.resolve();
  child.kill();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function login(port, email, password) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, token: body.token || "" };
}

function markDemoTemplate(dataDir) {
  const file = path.join(dataDir, "data", "thinking-hat.sqlite");
  if (!fs.existsSync(file)) return false;
  const database = new DatabaseSync(file);
  try {
    const row = database.prepare(
      "SELECT id FROM users WHERE lower(trim(email)) = 'demo@purplehat.fun'",
    ).get();
    if (!row) return false;
    database.prepare(
      "UPDATE users SET report_template = 'purple-hat-demo' WHERE lower(trim(email)) = 'demo@purplehat.fun'",
    ).run();
    return true;
  } finally {
    database.close();
  }
}

test("planning routes are demo-only and approval needs a reason on every red input line", { timeout: 90000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-planning-"));
  const port = await freePort(8941);
  const server = startServer(port, dataDir);
  try {
    assert.equal(await waitHealth(port, server.child), true, server.log());
    let demo = { status: 0, token: "" };
    for (let attempt = 0; attempt < 30 && demo.status !== 200; attempt += 1) {
      markDemoTemplate(dataDir);
      demo = await login(port, "demo@purplehat.fun", demoPassword);
      if (demo.status !== 200) await sleep(300);
    }
    assert.equal(demo.status, 200, "demo client did not sign in");
    assert.equal(markDemoTemplate(dataDir), true);
    const admin = await login(port, "probe@example.com", adminPassword);
    assert.equal(admin.status, 200, "admin did not sign in");

    const demoHeaders = { Authorization: `Bearer ${demo.token}` };
    const adminHeaders = { Authorization: `Bearer ${admin.token}` };
    const statusFor = async (headers) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/me/planning/status`, { headers });
      return { status: response.status, body: await response.json() };
    };
    assert.deepEqual(await statusFor(demoHeaders), { status: 200, body: { available: true } });
    assert.deepEqual(await statusFor(adminHeaders), { status: 200, body: { available: false } });

    const hidden = await fetch(`http://127.0.0.1:${port}/api/me/planning/budgets/2027`, { headers: adminHeaders });
    assert.equal(hidden.status, 404);
    const shown = await fetch(`http://127.0.0.1:${port}/api/me/planning/budgets/2027`, { headers: demoHeaders });
    assert.equal(shown.status, 200);
    const budgets = await shown.json();
    const approved = budgets.detail.find((version) => version.id === "fy2027-v1");
    assert.equal(approved.fyTotal.net_revenue, 769910);
    assert.equal(approved.fyTotal.net_income, 22170);

    const badScenario = await fetch(`http://127.0.0.1:${port}/api/me/planning/cash/13-week?scenario=panic`, { headers: demoHeaders });
    assert.equal(badScenario.status, 400);

    const commentaryResponse = await fetch(`http://127.0.0.1:${port}/api/me/planning/commentary/2026-12`, { headers: demoHeaders });
    assert.equal(commentaryResponse.status, 200);
    const commentary = await commentaryResponse.json();
    assert.equal(commentary.status, "draft");
    assert.ok(String(commentary.lineReasons.online_product_sales || "").trim());
    const approvedResponse = await fetch(`http://127.0.0.1:${port}/api/me/planning/commentary/2026-12/approve`, {
      method: "POST",
      headers: demoHeaders,
    });
    assert.equal(approvedResponse.status, 200);
    const approvedCommentary = await approvedResponse.json();
    assert.equal(approvedCommentary.status, "approved");
    assert.equal(approvedCommentary.approvedBy, "Purple Hat Demo");

    const cleared = await fetch(`http://127.0.0.1:${port}/api/me/planning/commentary/2026-12`, {
      method: "PUT",
      headers: { ...demoHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        paragraphs: commentary.paragraphs,
        lineReasons: { ...commentary.lineReasons, online_product_sales: "" },
      }),
    });
    assert.equal(cleared.status, 200);
    const blocked = await fetch(`http://127.0.0.1:${port}/api/me/planning/commentary/2026-12/approve`, {
      method: "POST",
      headers: demoHeaders,
    });
    assert.equal(blocked.status, 400);
  } finally {
    await stop(server.child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
