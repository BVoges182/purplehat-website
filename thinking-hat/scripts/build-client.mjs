import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(appRoot, "client");
process.chdir(clientRoot);

await build({
  root: clientRoot,
  configFile: path.join(clientRoot, "vite.config.js"),
});

await import(pathToFileURL(path.join(appRoot, "scripts", "copy-site.mjs")).href);
