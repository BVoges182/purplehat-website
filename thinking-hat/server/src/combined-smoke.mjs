import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..", "..");
const indexPath = path.join(repoRoot, "thinking-hat", "server", "src", "index.js");
const assetHtml = fs.readFileSync(path.join(repoRoot, "vendor", "purplehat-trader", "dist", "index.html"), "utf8");
const assetMatch = assetHtml.match(/\/trader\/assets\/index-[^"]+\.js/);
const assetPath = assetMatch ? assetMatch[0] : "";
const homeMarker = "Online accounting for nomads and digital businesses";

if (process.argv.includes("--serve")) {
  process.env.THINKING_HAT_NO_LISTEN = "1";
  process.env.TRADER_WARMUP = "0";
  const { app, closeTrader } = await import("./index.js");
  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address();
    console.log(`ready ${address.port}`);
  });
  let shutting = false;
  const shutdown = () => {
    if (shutting) return;
    shutting = true;
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    server.close(() => {
      closeTrader();
      process.exit(0);
    });
    setTimeout(() => {
      closeTrader();
      process.exit(0);
    }, 1000).unref();
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    if (String(chunk).includes("stop")) shutdown();
  });
} else {
  const failures = [];
  const secrets = [];
  const redact = (value) => secrets.reduce((text, secret) => (secret ? text.split(secret).join("[redacted]") : text), String(value ?? ""));
  const check = (name, ok, detail = "") => {
    if (ok) {
      console.log(`ok ${name}`);
      return;
    }
    const line = `${name}${detail ? `: ${redact(detail)}` : ""}`;
    failures.push(line);
    console.error(`FAIL ${line}`);
  };

  function verifyPin() {
    const pin = JSON.parse(fs.readFileSync(path.join(repoRoot, "trader.pin.json"), "utf8"));
    check("pin commit", pin.commit === "603b207ffa18cc151701bd79659967bff9779584", pin.commit);
    for (const [file, hash] of Object.entries(pin.files || {})) {
      const full = path.join(repoRoot, "vendor", "purplehat-trader", file);
      const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      check(`pin ${file}`, actual === hash, "hash drifted");
    }
    check("built asset", Boolean(assetPath), "dist index has no asset");
  }

  function listen(port) {
    const stub = http.createServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 500;
        res.end("stub");
      }, 300);
    });
    return new Promise((resolve) => {
      stub.listen(port, "127.0.0.1", () => resolve(stub));
    });
  }

  async function startStub() {
    const stub = await listen(0);
    return { stub, url: `http://127.0.0.1:${stub.address().port}` };
  }

  function serverEnv(dataDir, stubUrl, password) {
    const adminPassword = crypto.randomBytes(18).toString("hex");
    const jwt = crypto.randomBytes(24).toString("hex");
    secrets.push(adminPassword, jwt, password);
    return {
      ...process.env,
      PURPLEHAT_STAGING: "1",
      THINKING_HAT_NO_LISTEN: "1",
      TRADER_WARMUP: "0",
      JWT_SECRET: jwt,
      ADMIN_PASSWORD: adminPassword,
      ADMIN_EMAIL: "smoke-admin@purplehat.fun",
      BASIC_AUTH_USER: "purplehat",
      BASIC_AUTH_PASSWORD: password,
      DATA_DIR: dataDir,
      APP_URL: "http://127.0.0.1:9",
      EMAIL_API_KEY: "",
      EMAIL_FROM: "",
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_PASS: "",
      SMTP_FROM: "",
      GOOGLE_DRIVE_API_KEY: "",
      GOOGLE_API_KEY: "",
      DATABASE_URL: "",
      BINANCE_API_BASE: stubUrl,
      HYPERLIQUID_API_BASE: stubUrl,
      OKX_API_BASE: stubUrl,
      BINANCE_FAPI_BASE: stubUrl,
      BYBIT_API_BASE: stubUrl,
      ALERTS_ENABLED: "false",
      ALERTS_CRON_ENABLED: "false",
      EVAL_JOB_SECRET: "",
    };
  }

  function startServer(password, stubUrl, dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "purplehat-combined-"))) {
    const env = serverEnv(dataDir, stubUrl, password);
    const child = spawn(process.execPath, [scriptPath, "--serve"], {
      cwd: repoRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    let settled = false;
    const ready = new Promise((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`server did not start\n${redact(stderr).slice(-2000)}`));
      }, 20000);
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(/ready (\d+)/);
        if (!match || settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Number(match[1]));
      });
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`server exited ${code}\n${redact(stderr).slice(-2000)}`));
      });
    });
    return { child, dataDir, password, ready, stderr: () => redact(stderr) };
  }

  function stopServer(child) {
    return new Promise((resolve) => {
      if (!child || child.exitCode != null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 4000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.write("stop\n");
    });
  }

  async function ask(port, target, { method = "GET", headers = {}, body, forwarded } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${target}`, {
      method,
      headers: {
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const text = await response.text();
    const type = response.headers.get("content-type") || "";
    let json = null;
    if (type.includes("json")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return {
      status: response.status,
      text,
      json,
      type,
      auth: response.headers.get("www-authenticate"),
    };
  }

  function basic(password) {
    return `Basic ${Buffer.from(`purplehat:${password}`).toString("base64")}`;
  }

  async function exercise(port, password) {
    const auth = { authorization: basic(password) };
    const home = await ask(port, "/");
    check("homepage", home.status === 200 && home.text.includes(homeMarker) && !home.auth, String(home.status));
    const logo = await ask(port, "/logo.png");
    check("logo", logo.status === 200 && logo.type.includes("image"), `${logo.status} ${logo.type}`);
    const integrations = await ask(port, "/integrations.html");
    check("integrations", integrations.status === 200 && integrations.text.includes("<html"), String(integrations.status));
    for (const page of ["/about", "/contact", "/privacy", "/terms", "/disclaimer"]) {
      const response = await ask(port, page);
      check(`page ${page}`, response.status === 200 && response.type.includes("html") && !response.auth, String(response.status));
    }
    const loginPage = await ask(port, "/login");
    check("login page", loginPage.status === 200 && loginPage.text.includes("Thinking Hat") && !loginPage.auth, String(loginPage.status));
    const contact = await ask(port, "/api/contact", { method: "POST", body: {} });
    check("contact empty", contact.status === 400 && contact.json?.error === "Please check the form." && !contact.auth, contact.json?.error || String(contact.status));
    const forgot = await ask(port, "/api/auth/forgot-password", { method: "POST", body: { email: "not-an-email" } });
    check("forgot invalid email", forgot.status === 400 && forgot.json?.error === "Enter a valid email." && !forgot.auth, forgot.json?.error || String(forgot.status));
    const reset = await ask(port, "/api/auth/reset-password");
    check("reset without token", reset.status === 400 && reset.json?.error === "This reset link is invalid or has expired." && !reset.auth, reset.json?.error || String(reset.status));
    const health = await ask(port, "/api/health");
    check("website health", health.status === 200 && health.json?.ok === true && health.json.version == null && !health.auth, String(health.status));
    const invoices = await ask(port, "/api/me/invoices");
    check("website invoices", invoices.status === 401 && invoices.json?.error === "Sign in to continue." && !invoices.auth, invoices.json?.error || String(invoices.status));
    const missingApi = await ask(port, "/api/invoices");
    check("website unknown api", missingApi.status === 404 && missingApi.type.includes("json") && !missingApi.text.includes("Purple Hat Trading"), String(missingApi.status));
    const login = await ask(port, "/api/auth/login", {
      method: "POST",
      body: { email: "not-a-user@example.com", password: "not-the-admin-password" },
    });
    check("website login", login.status === 401 && login.json?.error === "Email or password is incorrect." && !login.auth, login.json?.error || String(login.status));

    const traderClosed = await ask(port, "/trader/");
    check("trader requires auth", traderClosed.status === 401 && traderClosed.type.includes("json") && Boolean(traderClosed.auth) && !traderClosed.text.includes(homeMarker), String(traderClosed.status));
    const traderOpen = await ask(port, "/trader/", { headers: auth });
    check("trader page", traderOpen.status === 200 && traderOpen.text.includes(assetPath), String(traderOpen.status));
    const deep = await ask(port, "/trader/trading/BTC", { headers: auth });
    check("trader deep link", deep.status === 200 && deep.text.includes(assetPath), String(deep.status));
    const deepClosed = await ask(port, "/trader/trading/BTC");
    check("deep link requires auth", deepClosed.status === 401 && deepClosed.type.includes("json"), String(deepClosed.status));
    const asset = await ask(port, assetPath, { headers: auth });
    check("trader asset", asset.status === 200 && !asset.text.includes("<!doctype html") && !asset.text.includes("<html"), `${asset.status} ${asset.type}`);

    const traderHealth = await ask(port, "/trader/api/health");
    check("trader health", traderHealth.status === 200 && traderHealth.json?.ok === true && traderHealth.json?.db === "up" && traderHealth.json?.version === "phase-5" && !traderHealth.auth, JSON.stringify(traderHealth.json));
    const coinsClosed = await ask(port, "/trader/api/coins");
    check("trader coins locked", coinsClosed.status === 401 && coinsClosed.type.includes("json"), String(coinsClosed.status));
    const coins = await ask(port, "/trader/api/coins", { headers: auth, forwarded: "203.0.113.10" });
    check("trader coins", coins.status === 200 && Array.isArray(coins.json?.coins), String(coins.status));
    const unknown = await ask(port, "/trader/api/not-a-route", { headers: auth, forwarded: "203.0.113.10" });
    check("trader unknown api", unknown.status === 404 && unknown.type.includes("json") && unknown.json?.error === "Not found", unknown.json?.error || String(unknown.status));
    const bare = await ask(port, "/trader/api/candles/refresh", { headers: auth, forwarded: "203.0.113.30" });
    check("refresh requires one symbol", bare.status === 400 && bare.json?.error === "Refresh one symbol at a time.", bare.json?.error || String(bare.status));
    const many = await ask(port, "/trader/api/candles/refresh?symbol=BTCUSDT&symbol=ETHUSDT", { headers: auth, forwarded: "203.0.113.30" });
    check("refresh rejects two symbols", many.status === 400, String(many.status));
    const joined = await ask(port, "/trader/api/candles/refresh?symbol=BTCUSDT,ETHUSDT", { headers: auth, forwarded: "203.0.113.30" });
    check("refresh rejects a list", joined.status === 400, String(joined.status));

    let burstStatus = 0;
    for (let i = 0; i < 30; i += 1) {
      const hit = await ask(port, "/trader/api/coins", { headers: auth, forwarded: "203.0.113.20" });
      burstStatus = hit.status;
      if (hit.status !== 200) break;
    }
    check("api allowance", burstStatus === 200, String(burstStatus));
    const limited = await ask(port, "/trader/api/coins", { headers: auth, forwarded: "203.0.113.20" });
    check("api rate limit", limited.status === 429 && limited.json?.error === "Too many Trader API requests." && limited.auth == null, limited.json?.error || String(limited.status));
    const spoofedSame = await ask(port, "/trader/api/coins", { headers: auth, forwarded: "198.51.100.9, 203.0.113.20" });
    check("proxy uses the nearest forwarded client", spoofedSame.status === 429, String(spoofedSame.status));
    const spoofedOther = await ask(port, "/trader/api/coins", { headers: auth, forwarded: "203.0.113.20, 198.51.100.8" });
    check("proxy ignores a spoofed leftmost address", spoofedOther.status === 200, String(spoofedOther.status));

    for (let i = 0; i < 3; i += 1) {
      const extra = await ask(port, "/trader/api/candles/refresh", { headers: auth, forwarded: "203.0.113.30" });
      if (extra.status !== 400) check("refresh budget setup", false, String(extra.status));
    }
    const refreshLimited = await ask(port, "/trader/api/candles/refresh", { headers: auth, forwarded: "203.0.113.30" });
    check("refresh rate limit", refreshLimited.status === 429 && refreshLimited.json?.error === "Too many refresh requests.", refreshLimited.json?.error || String(refreshLimited.status));

    const first = ask(port, "/trader/api/candles/refresh?symbol=BTCUSDT", { headers: auth, forwarded: "203.0.113.40" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await ask(port, "/trader/api/scanner", { headers: auth, forwarded: "203.0.113.40" });
    check("one scan at a time", second.status === 429 && second.json?.error === "A scan is already running.", second.json?.error || String(second.status));
    const finished = await first;
    check("busy scan finishes", finished.status === 502 || finished.status === 200, String(finished.status));
    const homeAgain = await ask(port, "/");
    check("homepage after trader traffic", homeAgain.status === 200 && !homeAgain.auth, String(homeAgain.status));
  }

  async function exerciseClosed(port) {
    const home = await ask(port, "/");
    check("closed homepage", home.status === 200 && home.text.includes(homeMarker) && !home.auth, String(home.status));
    const health = await ask(port, "/api/health");
    check("closed website health", health.status === 200 && health.json?.ok === true && !health.auth, String(health.status));
    const trader = await ask(port, "/trader/trading/BTC");
    check("closed trader", trader.status === 503 && trader.json?.error === "Trader is not configured." && !trader.auth && !trader.text.includes(homeMarker), trader.json?.error || String(trader.status));
    const traderApi = await ask(port, "/trader/api/health");
    check("closed trader api", traderApi.status === 503 && !traderApi.auth, String(traderApi.status));
  }

  function directoryStamp(target) {
    if (!fs.existsSync(target)) return "absent";
    const stat = fs.statSync(target);
    return `${stat.mtimeMs}:${stat.size}`;
  }

  async function expectRefusal(label, overrides, phrase, createdPath, watch = []) {
    const live = path.join(os.homedir(), "thinking-hat-data");
    const local = path.join(repoRoot, "thinking-hat", "server", "data");
    const beforeLive = directoryStamp(live);
    const beforeLocal = directoryStamp(local);
    const watched = new Map(watch.map((target) => [target, directoryStamp(target)]));
    const child = spawn(process.execPath, [indexPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PURPLEHAT_STAGING: "1",
        TRADER_WARMUP: "0",
        THINKING_HAT_NO_LISTEN: "1",
        JWT_SECRET: crypto.randomBytes(24).toString("hex"),
        ADMIN_PASSWORD: crypto.randomBytes(18).toString("hex"),
        ADMIN_EMAIL: "smoke-admin@purplehat.fun",
        BASIC_AUTH_PASSWORD: "",
        DATA_DIR: "",
        APP_URL: "http://127.0.0.1:9",
        EMAIL_API_KEY: "",
        SMTP_PASSWORD: "",
        SMTP_PASS: "",
        GOOGLE_DRIVE_API_KEY: "",
        GOOGLE_API_KEY: "",
        DATABASE_URL: "",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    const exited = new Promise((resolve) => child.on("exit", resolve));
    const code = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000)),
    ]);
    if (code === "timeout") {
      child.kill();
      await exited;
    }
    const untouched = directoryStamp(live) === beforeLive && directoryStamp(local) === beforeLocal;
    if (beforeLive === "absent" && fs.existsSync(live)) fs.rmSync(live, { recursive: true, force: true });
    let created = false;
    if (createdPath && fs.existsSync(createdPath)) {
      created = true;
      fs.rmSync(createdPath, { recursive: true, force: true });
    }
    for (const [target, stamp] of watched) {
      const changed = directoryStamp(target) !== stamp;
      if (changed && stamp === "absent") fs.rmSync(target, { recursive: true, force: true });
      if (changed) created = true;
    }
    check(
      label,
      code !== 0 && code !== "timeout" && output.includes(phrase) && untouched && !created,
      `code ${code}`,
    );
  }

  async function refuseStaging() {
    await expectRefusal("staging refuses a missing DATA_DIR", {}, "Staging requires an absolute DATA_DIR.");
    await expectRefusal(
      "staging refuses the live data directory",
      { DATA_DIR: path.join(os.homedir(), "thinking-hat-data") },
      "Staging DATA_DIR must not be the live data directory.",
    );
    await expectRefusal(
      "staging refuses the account home",
      { DATA_DIR: os.homedir() },
      "Staging DATA_DIR must not be the live data directory.",
      null,
      [path.join(os.homedir(), "data"), path.join(os.homedir(), "uploads")],
    );
    const relativeRoot = path.join(repoRoot, "staging-data");
    await expectRefusal(
      "staging refuses a relative DATA_DIR",
      { DATA_DIR: "staging-data" },
      "Staging requires an absolute DATA_DIR.",
      relativeRoot,
    );
    const warmupDir = path.join(os.tmpdir(), `purplehat-refuse-${crypto.randomBytes(4).toString("hex")}`);
    await expectRefusal(
      "staging refuses warmup",
      { DATA_DIR: warmupDir, TRADER_WARMUP: "1" },
      "Staging requires TRADER_WARMUP=0.",
      warmupDir,
    );
    const blocked = path.join(os.tmpdir(), `purplehat-refuse-${crypto.randomBytes(4).toString("hex")}`);
    await expectRefusal(
      "staging refuses hbuilds",
      { DATA_DIR: path.join(blocked, "hbuilds", "site") },
      "Staging DATA_DIR must sit outside hbuilds and public_html.",
      blocked,
    );
    await expectRefusal(
      "staging refuses public_html",
      { DATA_DIR: path.join(blocked, "public_html", "site") },
      "Staging DATA_DIR must sit outside hbuilds and public_html.",
      blocked,
    );
  }

  async function main() {
    verifyPin();
    await refuseStaging();
    const { stub, url } = await startStub();
    const password = crypto.randomBytes(18).toString("hex");
    secrets.push(password);
    const running = startServer(password, url);
    let port = 0;
    try {
      port = await running.ready;
      check("temp data dir", running.dataDir.startsWith(os.tmpdir()), "database is not in a temp directory");
      await exercise(port, password);
      const traderFile = path.join(running.dataDir, "data", "trader.sqlite");
      const websiteFile = path.join(running.dataDir, "data", "thinking-hat.sqlite");
      check("sqlite files", fs.existsSync(traderFile) && fs.existsSync(websiteFile), "expected both database files");
      await stopServer(running.child);
      const markerDb = new DatabaseSync(traderFile);
      markerDb.exec("CREATE TABLE IF NOT EXISTS smoke_marker (id INTEGER PRIMARY KEY, note TEXT)");
      markerDb.prepare("INSERT INTO smoke_marker (note) VALUES (?)").run("restart");
      markerDb.close();
      const restarted = startServer(password, url, running.dataDir);
      const restartPort = await restarted.ready;
      const health = await ask(restartPort, "/trader/api/health");
      check("restart health", health.status === 200 && health.json?.db === "up", String(health.status));
      await stopServer(restarted.child);
      const saved = new DatabaseSync(traderFile);
      const note = saved.prepare("SELECT note FROM smoke_marker").get();
      saved.close();
      check("sqlite survives process restart", note?.note === "restart", note?.note || "missing");

      const closed = startServer("", url);
      const closedPort = await closed.ready;
      await exerciseClosed(closedPort);
      await stopServer(closed.child);
      fs.rmSync(closed.dataDir, { recursive: true, force: true });

      const shortPassword = crypto.randomBytes(4).toString("hex");
      const short = startServer(shortPassword, url);
      const shortPort = await short.ready;
      const shortHome = await ask(shortPort, "/");
      const shortTrader = await ask(shortPort, "/trader/");
      check("short password keeps homepage", shortHome.status === 200 && !shortHome.auth, String(shortHome.status));
      check("short password closes trader", shortTrader.status === 503 && !shortTrader.auth, String(shortTrader.status));
      await stopServer(short.child);
      fs.rmSync(short.dataDir, { recursive: true, force: true });

      async function staysListening(entry) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "purplehat-combined-"));
        const child = spawn(process.execPath, [entry], {
          cwd: repoRoot,
          env: { ...serverEnv(dir, url, password), THINKING_HAT_NO_LISTEN: "0", PORT: "0", TRADER_WARMUP: "0" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          output += chunk.toString();
        });
        const code = await Promise.race([
          new Promise((resolve) => child.on("exit", resolve)),
          new Promise((resolve) => setTimeout(() => resolve("up"), 4000)),
        ]);
        if (code === "up") child.kill();
        await new Promise((resolve) => child.once("exit", resolve));
        fs.rmSync(dir, { recursive: true, force: true });
        return { code, output: redact(output) };
      }
      const direct = await staysListening(indexPath);
      check("production entry listens", direct.code === "up" && direct.output.includes("Thinking Hat API"), direct.output.slice(-500));
      const shim = await staysListening(path.join(repoRoot, "thinking-hat", "thinking-hat", "server", "src", "index.js"));
      check("hostinger shim listens", shim.code === "up" && shim.output.includes("Thinking Hat API"), shim.output.slice(-500));

      const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "purplehat-combined-"));
      const probe = spawn(process.execPath, [indexPath], {
        cwd: repoRoot,
        env: serverEnv(probeDir, url, password),
        stdio: ["ignore", "ignore", "pipe"],
      });
      let probeErr = "";
      probe.stderr.on("data", (chunk) => {
        probeErr += chunk.toString();
      });
      const probeCode = await Promise.race([
        new Promise((resolve) => probe.on("exit", resolve)),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000)),
      ]);
      if (probeCode === "timeout") probe.kill();
      check("entry does not listen during import", probeCode === 0, `${probeCode} ${redact(probeErr).slice(-500)}`);
      fs.rmSync(probeDir, { recursive: true, force: true });
      fs.rmSync(running.dataDir, { recursive: true, force: true });
    } catch (error) {
      check("combined smoke", false, error instanceof Error ? error.message : String(error));
      await stopServer(running.child);
    } finally {
      await new Promise((resolve) => stub.close(resolve));
    }
    if (failures.length) {
      console.error(`${failures.length} combined checks failed`);
      process.exit(1);
    }
    console.log("combined smoke ok");
  }

  await main();
}
