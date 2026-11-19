import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverEntry = path.join(repoRoot, "thinking-hat", "server", "src", "index.js");
const originalPassword = "demo-client-original";
const changedPassword = "demo-client-changed";
const adminPassword = "demo-admin-original";

function freePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => {
      if (start > 8990) reject(new Error("No free port for the demo password test."));
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

function startServer(port, dataDir, extra) {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(repoRoot, "thinking-hat"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: "demo-password-test-secret",
      ADMIN_PASSWORD: adminPassword,
      ADMIN_EMAIL: "probe@example.com",
      DEMO_PASSWORD: originalPassword,
      DEMO_AUTO_RESET: "",
      CHROME_PATH: "",
      PUPPETEER_EXECUTABLE_PATH: "",
      TRADER_WARMUP: "0",
      BASIC_AUTH_PASSWORD: "",
      PURPLEHAT_STAGING: "",
      THINKING_HAT_NO_LISTEN: "",
      ...extra,
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
  return {
    child,
    safeLog() {
      return log.replace(/password[^\n]*/gi, "[redacted]");
    },
  };
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
  return { status: response.status, token: body.token || "", id: body.user?.id || 0 };
}

test("an admin change to the demo password survives a restart", { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-demo-password-"));
  try {
    const firstPort = await freePort(8931);
    const first = startServer(firstPort, dataDir);
    try {
      assert.equal(await waitHealth(firstPort, first.child), true, first.safeLog());
      const admin = await login(firstPort, "probe@example.com", adminPassword);
      assert.equal(admin.status, 200);
      const listed = await fetch(`http://127.0.0.1:${firstPort}/api/admin/users`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      const users = await listed.json();
      const demo = (users.users || []).find((user) => user.email === "demo@purplehat.fun");
      assert.ok(demo, "demo client was not created");
      const saved = await fetch(`http://127.0.0.1:${firstPort}/api/admin/users/${demo.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${admin.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: changedPassword }),
      });
      assert.equal(saved.status, 200);
      assert.equal((await login(firstPort, "demo@purplehat.fun", changedPassword)).status, 200);
      assert.equal((await login(firstPort, "demo@purplehat.fun", originalPassword)).status, 401);
    } finally {
      await stop(first.child);
    }

    const secondPort = await freePort(firstPort + 1);
    const second = startServer(secondPort, dataDir);
    try {
      assert.equal(await waitHealth(secondPort, second.child), true, second.safeLog());
      assert.equal((await login(secondPort, "demo@purplehat.fun", changedPassword)).status, 200);
      assert.equal((await login(secondPort, "demo@purplehat.fun", originalPassword)).status, 401);
    } finally {
      await stop(second.child);
    }

    const thirdPort = await freePort(secondPort + 1);
    const third = startServer(thirdPort, dataDir, { DEMO_AUTO_RESET: "true" });
    try {
      assert.equal(await waitHealth(thirdPort, third.child), true, third.safeLog());
      assert.equal((await login(thirdPort, "demo@purplehat.fun", originalPassword)).status, 200);
      assert.equal((await login(thirdPort, "demo@purplehat.fun", changedPassword)).status, 401);
    } finally {
      await stop(third.child);
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
