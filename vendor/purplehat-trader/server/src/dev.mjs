import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const children = [];

function start(args) {
  const child = spawn(node, args, { cwd: root, env: process.env, stdio: "inherit" });
  children.push(child);
  return child;
}

start(["--watch-path=server/src", "--watch-path=shared", "server/src/index.js"]);
start(["node_modules/vite/bin/vite.js", "--config", "client/vite.config.js", "--port", "5176"]);

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
