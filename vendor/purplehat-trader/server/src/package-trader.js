import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseRoot = path.join(root, "release");
const packDir = path.join(releaseRoot, "purplehat-trader");

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyFiltered(fromDir, toDir, keep) {
  if (!fs.existsSync(fromDir)) return;
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const source = path.join(fromDir, entry.name);
    const target = path.join(toDir, entry.name);
    if (!keep(source, entry)) continue;
    if (entry.isDirectory()) copyFiltered(source, target, keep);
    else if (entry.isFile()) copyFile(source, target);
  }
}

const build = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--config", "client/vite.config.js"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status || 1);

fs.rmSync(packDir, { recursive: true, force: true });
fs.mkdirSync(packDir, { recursive: true });
for (const name of ["package.json", "package-lock.json", ".env.example"]) {
  copyFile(path.join(root, name), path.join(packDir, name));
}
copyFiltered(path.join(root, "dist"), path.join(packDir, "dist"), (_source, entry) => entry.name !== ".env");
copyFiltered(path.join(root, "shared"), path.join(packDir, "shared"), (source, entry) => {
  if (entry.name === "node_modules" || entry.name.endsWith(".sqlite")) return false;
  return true;
});
copyFiltered(path.join(root, "server"), path.join(packDir, "server"), (source, entry) => {
  if (entry.name === "node_modules" || entry.name === "fixtures" || entry.name === "data") return false;
  if (entry.name.endsWith(".test.js") || entry.name.endsWith(".sqlite")) return false;
  return !source.includes(`${path.sep}data${path.sep}`);
});
copyFile(path.join(root, "docs", "trader-hosting.md"), path.join(packDir, "docs", "trader-hosting.md"));
copyFile(path.join(root, "docs", "examples", "mount-trader.mjs"), path.join(packDir, "docs", "examples", "mount-trader.mjs"));

const archive = path.join(releaseRoot, "purplehat-trader.tar.gz");
fs.rmSync(archive, { force: true });
const tar = spawnSync("tar", ["-czf", archive, "-C", releaseRoot, "purplehat-trader"], { cwd: root, stdio: "inherit" });
if (tar.status !== 0) {
  console.error("The directory was written, but tar failed.");
  process.exit(tar.status || 1);
}
console.log(packDir);
console.log(archive);
