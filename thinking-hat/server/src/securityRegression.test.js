import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverEntry = path.join(repoRoot, "thinking-hat", "server", "src", "index.js");

function freePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => {
      if (start > 8940) reject(new Error("No free port for the security regression test."));
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

function abortMultipart(port, token) {
  return new Promise((resolve) => {
    const boundary = "----purplehat-security";
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/admin/reports",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
    });
    req.on("error", () => resolve());
    req.on("response", (response) => {
      response.resume();
      resolve();
    });
    req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="report.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`);
    req.write(Buffer.alloc(32 * 1024, 7));
    setTimeout(() => {
      req.destroy();
      resolve();
    }, 30);
  });
}

test("oversized arrays, aborted uploads, and gzip trailing bytes stay non-fatal", { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sec-"));
  const port = await freePort(8901);
  const adminPassword = "security-regression-admin";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(repoRoot, "thinking-hat"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: "security-regression-secret",
      ADMIN_PASSWORD: adminPassword,
      ADMIN_EMAIL: "probe@example.com",
      DEMO_PASSWORD: "",
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
    assert.equal(healthy, true, `security server did not answer /api/health ${safeLog.slice(-400)}`);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "probe@example.com", password: adminPassword }),
    });
    assert.equal(login.status, 200, "admin login failed");
    const session = await login.json();
    const token = session.token;
    const userId = session.user.id;

    const months = Array.from({ length: 1001 }, () => ({ month: "2024-01", revenue: 1, expenses: 1 }));
    const oversized = await fetch(`${base}/api/admin/users/${userId}/finances`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cash: 0, revenue: 0, expenses: 0, receivables: 0, payables: 0, months }),
    });
    assert.equal(oversized.status, 400);

    await abortMultipart(port, token);
    await sleep(200);
    assert.equal(child.exitCode, null, "aborted upload stopped the server");
    const afterAbort = await fetch(`${base}/api/health`);
    assert.equal(afterAbort.status, 200);

    const gzip = zlib.gzipSync(Buffer.from(JSON.stringify({ email: "probe@example.com", password: "x" })));
    const trailing = Buffer.concat([gzip, Buffer.from([0, 1, 2, 3, 4])]);
    const compressed = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: trailing,
    });
    assert.ok(compressed.status >= 400 && compressed.status < 500, `gzip trailing bytes returned ${compressed.status}`);
    await sleep(200);
    assert.equal(child.exitCode, null, "gzip trailing bytes stopped the server");
    const afterGzip = await fetch(`${base}/api/health`);
    assert.equal(afterGzip.status, 200);
    assert.equal((await afterGzip.json()).ok, true);
  } finally {
    if (child.exitCode == null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(2000).then(() => child.kill("SIGKILL")),
      ]);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
