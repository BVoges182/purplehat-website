import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverEntry = path.join(repoRoot, "thinking-hat", "server", "src", "index.js");

function envValue(file, key) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === key) return trimmed.slice(eq + 1);
  }
  return "";
}

function freePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => {
      if (start > 8810) reject(new Error("No free port for the production PDF test."));
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

test("the production PDF endpoint works without Chromium", { timeout: 120000 }, async () => {
  const password = envValue(path.join(repoRoot, "thinking-hat", "server", ".env"), "DEMO_PASSWORD");
  assert.ok(password.length >= 8, "DEMO_PASSWORD is missing from server/.env");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "afs-pdf-prod-"));
  const port = await freePort(8794);
  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(repoRoot, "thinking-hat"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: "production-pdf-test-secret",
      ADMIN_PASSWORD: "production-pdf-test-admin",
      ADMIN_EMAIL: "probe@example.com",
      DEMO_PASSWORD: password,
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
  const base = `http://127.0.0.1:${port}`;
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode != null) break;
      try {
        const health = await fetch(`${base}/api/health`);
        if (health.status === 200) {
          healthy = true;
          break;
        }
      } catch {
        // The process is still opening its port.
      }
      await sleep(250);
    }
    const safeLog = log.replace(/password[^\n]*/gi, "[redacted]");
    assert.equal(healthy, true, `production server did not answer /api/health ${safeLog.slice(-400)}`);

    let token = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "demo@purplehat.fun", password }),
      });
      if (login.status === 200) {
        token = (await login.json()).token;
        break;
      }
      await sleep(250);
    }
    assert.ok(token, "demo login did not succeed");

    let response;
    const started = Date.now();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      response = await fetch(`${base}/api/me/annual-statements/2026/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 200) break;
      await sleep(250);
    }
    const pdf = Buffer.from(await response.arrayBuffer());
    const elapsed = Date.now() - started;
    assert.equal(response.status, 200, pdf.toString("utf8").slice(0, 180));
    assert.ok(elapsed < 10000, `PDF took ${elapsed}ms`);
    assert.match(response.headers.get("content-type") || "", /application\/pdf/);
    assert.match(response.headers.get("content-disposition") || "", /filename="PurpleHatDemo_Audited_FS_FY2026\.pdf"/);
    assert.equal(Number(response.headers.get("content-length")), pdf.length);
    assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");

    const file = path.join(dataDir, "statement.pdf");
    fs.writeFileSync(file, pdf);
    const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const pages = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
    assert.ok(pages > 15, `expected more than 15 pages, got ${pages}`);
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    for (const figure of ["174,470", "12,500", "10,600", "42,000", "19,070"]) {
      assert.ok(text.includes(figure), figure);
    }
    assert.equal(text.split("Illustrative demo: fictitious entity").length - 1, 1);
  } finally {
    child.kill();
    await sleep(200);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
