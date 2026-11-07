import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor", "purplehat-trader");
if (!fs.existsSync(path.join(vendor, "package-lock.json"))) {
  console.error("Pinned Trader package is missing at vendor/purplehat-trader.");
  process.exit(1);
}

const args = ["ci", "--omit=dev", "--ignore-scripts"];
const npmCli = process.env.npm_execpath
  || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
if (!fs.existsSync(npmCli)) {
  console.error("npm could not be found for the Trader install.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: vendor, stdio: "inherit" });

if (result.status !== 0) process.exit(result.status ?? 1);
