import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "release", "purplehat-combined");
const pin = JSON.parse(fs.readFileSync(path.join(root, "trader.pin.json"), "utf8"));
if (pin.commit !== "603b207ffa18cc151701bd79659967bff9779584") {
  console.error("trader.pin.json is not the prepared Trader commit.");
  process.exit(1);
}

for (const [file, hash] of Object.entries(pin.files)) {
  const body = fs.readFileSync(path.join(root, "vendor", "purplehat-trader", file));
  const actual = crypto.createHash("sha256").update(body).digest("hex");
  if (actual !== hash) {
    console.error(`Pinned file drifted: ${file}`);
    process.exit(1);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

const skipNames = new Set(["node_modules", ".git", "release"]);
function excluded(source) {
  const rel = path.relative(root, source);
  if (!rel) return false;
  const parts = rel.split(path.sep);
  if (parts.some((part) => skipNames.has(part))) return true;
  const base = path.basename(source);
  if (base === ".env" || base.endsWith(".sqlite") || base.endsWith(".sqlite-wal") || base.endsWith(".sqlite-shm")) return true;
  const normalized = rel.split(path.sep).join("/");
  if (normalized === "thinking-hat/server/uploads" || normalized.startsWith("thinking-hat/server/uploads/")) return true;
  if (normalized === "thinking-hat/server/data" || normalized.startsWith("thinking-hat/server/data/")) return true;
  return false;
}

fs.cpSync(root, dest, {
  recursive: true,
  filter: (source) => !excluded(source),
});

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const manifest = {
  name: "purplehat-combined",
  createdAt: new Date().toISOString(),
  website: {
    repository: "https://github.com/BVoges182/purplehat-website.git",
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: git(["rev-parse", "HEAD"]),
    mainRollback: "eb946b9af71371aac7efafd9aae46114f670a8e0",
  },
  trader: {
    repository: pin.repository,
    commit: pin.commit,
    branch: pin.branch,
    package: pin.package,
    mountPath: pin.mountPath,
    apiPath: pin.apiPath,
    tradingMainRollback: "b0e96af2573dcaa3cbd819b970c70cc9d2320857",
  },
  persistence: {
    websiteSqlite: "data/thinking-hat.sqlite under DATA_DIR, or under ~/thinking-hat-data when the process path contains hbuilds",
    traderSqlite: "data/trader.sqlite in that same directory",
    hostingerRedeployVerified: false,
  },
};
fs.writeFileSync(path.join(dest, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const leaked = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") leaked.push(full);
      else walk(full);
      continue;
    }
    if (entry.name === ".env" || entry.name.endsWith(".sqlite") || entry.name.endsWith(".sqlite-wal") || entry.name.endsWith(".sqlite-shm")) {
      leaked.push(full);
    }
  }
}
walk(dest);
if (leaked.length) {
  console.error("Combined release contains secrets, databases, or installed modules.");
  process.exit(1);
}

console.log(`combined release: ${dest}`);
console.log(`website commit: ${manifest.website.commit}`);
console.log(`trader commit: ${manifest.trader.commit}`);
