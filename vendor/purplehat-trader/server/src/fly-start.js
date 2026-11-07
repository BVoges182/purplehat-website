import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const children = ["server/src/serve.js", "server/src/worker.js"].map((script) => spawn(process.execPath, [path.join(root, script)], {
  stdio: "inherit",
  env: { ...process.env, ALERTS_CRON_ENABLED: "false" },
}));

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (closing) return;
    console.error(`Child exited (${signal || code}). Stopping the other process.`);
    shutdown(code == null ? 1 : code || 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
