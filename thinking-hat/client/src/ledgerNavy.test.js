import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkContrast } from "../../../scripts/check-contrast.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const purple = /#(f6f3ff|f7f4ff|f5f0ff|f5f3ff|efe6ff|ede9fe|ddd6fe|c4b5fd|a78bfa|8b5cf6|7c3aed|6d28d9|5b21b6|4c1d95|2a1548|3b2468|4c4560|5c5470|7c7394|d4d0e0)|rgba\((109, ?40, ?217|76, ?29, ?149|167, ?139, ?250|196, ?181, ?253)|Nunito|Outfit|violet-|purple-|fuchsia-|indigo-/i;
const neutral = /text-neutral-9|bg-neutral-100|text-black|text-neutral-|bg-neutral-|border-neutral-/;

function filesUnder(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, predicate, out);
    else if (!entry.name.endsWith(".test.js") && predicate(entry.name)) out.push(full);
  }
  return out;
}

function scanLines(file, pattern) {
  const hits = [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const stripped = line.replace(/purple-hat/gi, "").replace(/purplehat/gi, "").replace(/purple hat/gi, "").replace(/logo\.png/gi, "");
    if (pattern.test(stripped)) hits.push(`${path.relative(repo, file)}:${index + 1}: ${line.trim()}`);
  });
  return hits;
}

function fontDisplaySetsColor(css) {
  const hits = [];
  function walk(source) {
    let i = 0;
    while (i < source.length) {
      while (i < source.length && /\s/.test(source[i])) i += 1;
      if (source.startsWith("/*", i)) {
        const end = source.indexOf("*/", i + 2);
        i = end < 0 ? source.length : end + 2;
        continue;
      }
      const open = source.indexOf("{", i);
      if (open < 0) break;
      const prelude = source.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source.startsWith("/*", j)) {
          const end = source.indexOf("*/", j + 2);
          j = end < 0 ? source.length : end + 2;
          continue;
        }
        if (source[j] === "{") depth += 1;
        else if (source[j] === "}") depth -= 1;
        j += 1;
      }
      const body = source.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(prelude)) walk(body);
      else if (prelude.includes(".font-display") && /(?:^|[;{])\s*color\s*:/.test(`{${body}}`)) hits.push(prelude);
      i = j;
    }
  }
  walk(css);
  return hits;
}

test("Ledger Navy contrast tokens pass WCAG AA", () => {
  const failures = checkContrast();
  assert.deepEqual(failures, []);
});

test("font-display does not set a text colour", () => {
  const indexCss = fs.readFileSync(path.join(repo, "thinking-hat", "client", "src", "index.css"), "utf8");
  const siteCss = fs.readFileSync(path.join(repo, "assets", "site.css"), "utf8");
  assert.deepEqual(fontDisplaySetsColor(indexCss), []);
  assert.deepEqual(fontDisplaySetsColor(siteCss), []);
});

test("shared button and navigation classes use the semantic tokens", () => {
  const ui = fs.readFileSync(path.join(repo, "thinking-hat", "client", "src", "components", "ui.jsx"), "utf8");
  assert.match(ui, /export function navItemClass/);
  assert.match(ui, /--btn-bg/);
  assert.match(ui, /--btn-text/);
  assert.match(ui, /--btn-bg-hover/);
  assert.match(ui, /--btn-disabled-bg/);
  assert.match(ui, /--btn-disabled-text/);
  assert.match(ui, /--btn-secondary-border/);
  assert.match(ui, /--nav-active-bg/);
  assert.match(ui, /--nav-active-text/);
  assert.match(ui, /--nav-active-bar/);
});

test("report UI has no leftover purple or hard-coded neutral text", () => {
  const paths = [
    ...filesUnder(path.join(repo, "thinking-hat", "client", "src"), (name) => /\.(js|jsx|css)$/.test(name)),
    ...fs.readdirSync(repo).filter((name) => name.endsWith(".html")).map((name) => path.join(repo, name)),
    ...filesUnder(path.join(repo, "assets"), (name) => /\.(js|css|html)$/.test(name)),
  ];
  const purpleHits = paths.flatMap((file) => scanLines(file, purple));
  const neutralHits = paths.flatMap((file) => scanLines(file, neutral));
  const blackHits = [];
  const indexCss = path.join(repo, "thinking-hat", "client", "src", "index.css");
  for (const file of paths) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const afsAt = file === indexCss ? lines.findIndex((line) => line.includes(".afs-shell {")) : -1;
    lines.forEach((line, index) => {
      if (!line.includes("#000")) return;
      if (file === indexCss && afsAt >= 0 && index >= afsAt) return;
      blackHits.push(`${path.relative(repo, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(purpleHits, [], purpleHits.join("\n"));
  assert.deepEqual(neutralHits, [], neutralHits.join("\n"));
  assert.deepEqual(blackHits, [], blackHits.join("\n"));
});
