import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexFile = path.join(root, "dist", "index.html");
if (!fs.existsSync(indexFile)) {
  console.error("dist/index.html is missing. Run npm run build first.");
  process.exit(1);
}
const html = fs.readFileSync(indexFile, "utf8");
if (!html.includes("/trader/assets/")) {
  console.error("Built index.html does not reference /trader/assets/.");
  process.exit(1);
}
const assetMatch = html.match(/\/trader\/assets\/[^"']+/);
if (!assetMatch) {
  console.error("Built index.html has no trader asset URL.");
  process.exit(1);
}

const database = path.join(os.tmpdir(), `pht-smoke-${process.pid}.sqlite`);
fs.rmSync(database, { force: true });
const port = 8877;
const child = spawn(process.execPath, ["server/src/serve.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATABASE_URL: database,
    TRADER_WARMUP: "0",
    ALERTS_ENABLED: "false",
    ALERTS_CRON_ENABLED: "false",
    BASIC_AUTH_PASSWORD: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

async function stop() {
  if (child.exitCode == null && child.signalCode == null) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${database}${suffix}`, { force: true });
    } catch {
      // The process may still be releasing the sqlite file.
    }
  }
}

const timer = setTimeout(() => {
  console.error("Production server did not answer in time.");
  stop();
  process.exit(1);
}, 20000);

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/trader/api/health`);
      if (response.ok) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(last || "health did not respond");
}

try {
  await waitForHealth();
  const base = `http://127.0.0.1:${port}`;
  const rootPage = await fetch(`${base}/`, { redirect: "manual" });
  const location = rootPage.headers.get("location") || "";
  if (![301, 302].includes(rootPage.status) || !location.endsWith("/trader/")) {
    throw new Error(`Expected / to redirect to /trader/, got ${rootPage.status} ${location}`);
  }
  const landing = await fetch(`${base}/trader/`);
  const landingText = await landing.text();
  if (landing.status !== 200 || !landingText.includes('id="root"')) {
    throw new Error(`Landing failed: ${landing.status}`);
  }
  const nested = await fetch(`${base}/trader/trading/BTC`);
  const nestedType = nested.headers.get("content-type") || "";
  const nestedText = await nested.text();
  if (nested.status !== 200 || !nestedType.includes("html") || !nestedText.includes('id="root"')) {
    throw new Error(`Nested route failed: ${nested.status} ${nestedType}`);
  }
  const asset = await fetch(`${base}${assetMatch[0]}`);
  const assetType = asset.headers.get("content-type") || "";
  if (asset.status !== 200 || assetType.includes("html")) {
    throw new Error(`Asset failed: ${asset.status} ${assetType}`);
  }
  const missing = await fetch(`${base}/trader/api/does-not-exist`);
  const missingType = missing.headers.get("content-type") || "";
  const missingBody = await missing.json();
  if (missing.status !== 404 || !missingType.includes("json") || missingBody.error !== "Not found") {
    throw new Error(`Unknown API failed: ${missing.status} ${missingType}`);
  }
  const site = await fetch(`${base}/api/invoices`);
  const siteText = await site.text();
  if (siteText.includes('id="root"')) {
    throw new Error("A non-trader API path returned the Trader page.");
  }
  console.log("production smoke ok");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await stop();
}
