import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const source = path.join(repoRoot, "index.html");
if (!fs.existsSync(source)) process.exit(0);

const dest = path.join(appRoot, "site");
fs.mkdirSync(dest, { recursive: true });
for (const name of ["index.html", "integrations.html", "integrations-booking-calendar.html", "privacy.html", "terms.html", "about.html", "contact.html", "disclaimer.html", "logo.png"]) {
  const from = path.join(repoRoot, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, name));
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, target);
    else if (entry.isFile()) fs.copyFileSync(src, target);
  }
}
copyDir(path.join(repoRoot, "images"), path.join(dest, "images"));
