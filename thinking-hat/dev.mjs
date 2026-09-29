import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const env = {
  ...process.env,
  Path: `C:\\Program Files\\nodejs;${process.env.Path || process.env.PATH || ""}`,
};

const server = spawn(process.execPath, ["src/index.js"], {
  cwd: path.join(root, "server"),
  stdio: "inherit",
  env,
});

const client = spawn("npm", ["run", "dev"], {
  cwd: path.join(root, "client"),
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

function stop() {
  if (!server.killed) server.kill();
  if (!client.killed) client.kill();
}

server.on("exit", (code) => {
  if (code) {
    stop();
    process.exit(code);
  }
});

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
