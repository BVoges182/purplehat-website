import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSrc = path.join(root, "thinking-hat", "server", "src");
const packagePath = path.join(root, "thinking-hat", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const dependencies = new Set(Object.keys(packageJson.dependencies || {}));
const builtins = new Set(builtinModules);

function packageName(specifier) {
  if (specifier.startsWith("node:")) return "";
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const specifierPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const missing = new Set();

for (const file of walk(serverSrc)) {
  const text = fs.readFileSync(file, "utf8");
  specifierPattern.lastIndex = 0;
  let match = specifierPattern.exec(text);
  while (match) {
    const specifier = match[1] || match[2] || match[3];
    const name = specifier && !specifier.startsWith(".") && !specifier.startsWith("/") ? packageName(specifier) : "";
    if (name && !builtins.has(name) && !dependencies.has(name)) {
      missing.add(`${path.relative(root, file)}: ${name}`);
    }
    match = specifierPattern.exec(text);
  }
}

if (missing.size) {
  console.error("Bare imports missing from thinking-hat/package.json dependencies:");
  for (const line of [...missing].sort()) console.error(line);
  process.exit(1);
}

console.log("Production dependencies cover server imports.");
