import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sliceBlock(css, marker, from = 0) {
  const start = css.indexOf(marker, from);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unclosed ${marker}`);
}

function readVars(block) {
  const out = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})/g)) {
    out[match[1]] = match[2].toUpperCase();
  }
  return out;
}

function themeVars(css) {
  const light = readVars(sliceBlock(css, ":root"));
  const media = sliceBlock(css, "@media (prefers-color-scheme: dark)");
  const darkMedia = readVars(sliceBlock(media, 'html:not([data-theme="light"])'));
  const darkAttr = readVars(sliceBlock(css, 'html[data-theme="dark"]'));
  return { light, darkMedia, darkAttr };
}

function channel(hex) {
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw.slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
}

function linear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = channel(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(foreground, background) {
  const left = luminance(foreground);
  const right = luminance(background);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

const textPairs = [
  ["text", "bg", "body text on page"],
  ["text-mute", "surface", "muted text on surface"],
  ["btn-text", "btn-bg", "button label"],
  ["nav-active-text", "nav-active-bg", "active navigation"],
  ["row-total-text", "row-total-bg", "total row"],
  ["card-payables-text", "card-payables-bg", "payables card"],
  ["card-receivables-text", "card-receivables-bg", "receivables card"],
  ["cal-available-text", "cal-available-bg", "available day"],
  ["cal-selected-text", "cal-selected-bg", "selected day"],
  ["afs-nav-link", "bg", "AFS menu link"],
  ["afs-nav-active", "bg", "AFS current section"],
  ["rag-green", "rag-green-bg", "green pill"],
  ["rag-amber", "rag-amber-bg", "amber pill"],
  ["rag-red", "rag-red-bg", "red pill"],
  ["illustrative-text", "illustrative-bg", "illustrative chip"],
];

const boundaryPairs = [
  ["heading", "bg", "heading"],
  ["accent", "bg", "focus ring on page"],
  ["accent", "surface", "focus ring on surface"],
  ["nav-active-bar", "nav-active-bg", "navigation marker"],
];

function checkTheme(name, vars, failures) {
  for (const [fg, bg, label] of textPairs) {
    const ratio = contrast(vars[fg], vars[bg]);
    if (ratio < 4.5) failures.push(`${name} ${label} ${vars[fg]} on ${vars[bg]} is ${ratio.toFixed(2)}:1`);
  }
  for (const [fg, bg, label] of boundaryPairs) {
    const ratio = contrast(vars[fg], vars[bg]);
    if (ratio < 3) failures.push(`${name} ${label} ${vars[fg]} on ${vars[bg]} is ${ratio.toFixed(2)}:1`);
  }
  if (vars["btn-disabled-bg"] === vars["btn-bg"] || vars["btn-disabled-text"] === vars["btn-text"]) {
    failures.push(`${name} disabled button does not look different from the enabled button`);
  }
}

function sameTokens(left, right, label, failures) {
  const names = new Set([...Object.keys(left), ...Object.keys(right)].filter((name) => textPairs.some((pair) => pair.includes(name)) || boundaryPairs.some((pair) => pair.includes(name)) || name.startsWith("btn-") || name.startsWith("nav-") || name.startsWith("row-") || name.startsWith("card-") || name.startsWith("cal-") || name.startsWith("afs-nav")));
  for (const name of names) {
    if (!left[name] || !right[name]) failures.push(`${label} missing --${name}`);
    else if (left[name] !== right[name]) failures.push(`${label} --${name} ${left[name]} != ${right[name]}`);
  }
}

export function checkContrast() {
  const indexCss = fs.readFileSync(path.join(repo, "thinking-hat", "client", "src", "index.css"), "utf8");
  const siteCss = fs.readFileSync(path.join(repo, "assets", "site.css"), "utf8");
  const index = themeVars(indexCss);
  const site = themeVars(siteCss);
  const failures = [];
  checkTheme("light", index.light, failures);
  checkTheme("dark", index.darkAttr, failures);
  sameTokens(index.darkMedia, index.darkAttr, "index.css dark blocks", failures);
  sameTokens(index.light, site.light, "light index.css/site.css", failures);
  sameTokens(index.darkAttr, site.darkAttr, "dark index.css/site.css", failures);
  sameTokens(site.darkMedia, site.darkAttr, "site.css dark blocks", failures);
  return failures;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = checkContrast();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("contrast ok: light and dark text pairs >= 4.5:1, large text and UI boundaries >= 3:1");
}
