import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(repoRoot, "thinking-hat", "client");
process.chdir(clientRoot);

await build({
  root: clientRoot,
  configFile: path.join(clientRoot, "vite.config.js"),
});

await import(pathToFileURL(path.join(repoRoot, "thinking-hat", "scripts", "copy-site.mjs")).href);
