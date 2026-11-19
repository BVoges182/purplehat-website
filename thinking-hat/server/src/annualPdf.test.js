import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { annualHeaderName, annualPdfFilename } from "./annualPrint.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const previewDir = path.join(repoRoot, "docs", "afs-pdf-preview");

function envValue(file, key) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === key) return trimmed.slice(eq + 1);
  }
  return "";
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" });
}

test("the PDF name uses the entity and year", () => {
  const name = annualPdfFilename({
    year: "2026",
    document: { cover: { lines: [{ text: "PURPLE HAT DEMO LLC" }] } },
  });
  assert.equal(annualHeaderName("PURPLE HAT DEMO LLC"), "Purple Hat Demo LLC");
  assert.equal(name, "PurpleHatDemo_Audited_FS_FY2026.pdf");
});

test("the published FY2026 PDF is a laid-out SEC statement", { timeout: 180000 }, async () => {
  const password = envValue(path.join(repoRoot, "thinking-hat", "server", ".env"), "DEMO_PASSWORD");
  const login = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@purplehat.fun", password }),
  });
  const session = await login.json();
  assert.equal(login.status, 200);
  const headers = { Authorization: `Bearer ${session.token}` };
  const excel = await fetch("http://127.0.0.1:8787/api/me/annual-statements/2026/xlsx", { headers });
  assert.equal(excel.status, 200);
  const workbook = Buffer.from(await excel.arrayBuffer());
  assert.equal(workbook.subarray(0, 2).toString("utf8"), "PK");

  const response = await fetch("http://127.0.0.1:8787/api/me/annual-statements/2026/pdf", { headers });
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, pdf.toString("utf8").slice(0, 180));
  assert.match(response.headers.get("content-disposition") || "", /PurpleHatDemo_Audited_FS_FY2026\.pdf/);
  const file = path.join(os.tmpdir(), "purplehat-demo-afs.pdf");
  fs.writeFileSync(file, pdf);

  const info = run("pdfinfo", [file]);
  const pages = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
  assert.ok(pages >= 18 && pages <= 24, `expected 18 to 24 pages, got ${pages}`);

  const pagesText = [];
  for (let page = 1; page <= pages; page += 1) {
    pagesText.push(run("pdftotext", ["-f", String(page), "-l", String(page), "-layout", file, "-"]));
  }
  const whole = pagesText.join("\n");
  assert.equal(whole.includes("\uFFFD"), false);
  for (const text of pagesText) {
    const body = text
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== "Purple Hat Demo LLC" && !/^F-\d+$/.test(line))
      .join(" ");
    assert.ok(body.length > 40, `blank page:\n${text.slice(0, 200)}`);
  }
  assert.match(whole, /Independent Auditor's Report/);
  assert.match(whole, /Benjamin Voges CA\(SA\)/);
  for (const title of ["BALANCE SHEETS", "STATEMENTS OF OPERATIONS", "STATEMENTS OF CHANGES IN MEMBER'S EQUITY", "STATEMENTS OF CASH FLOWS"]) {
    assert.ok(whole.includes(title), title);
  }
  for (let note = 1; note <= 14; note += 1) assert.match(whole, new RegExp(`\\b${note}\\.\\s`));
  const balancePage = pagesText.findIndex((text) => text.includes("BALANCE SHEETS") && text.includes("Total assets"));
  assert.ok(balancePage >= 0);
  const balance = pagesText[balancePage];
  assert.match(balance, /December 31,/);
  assert.match(balance, /2026/);
  assert.match(balance, /2025/);
  const assets = balance.split(/\n/).find((line) => line.includes("Total assets"));
  assert.ok(assets, "Total assets line");
  assert.ok(assets.indexOf("174,470") !== -1 && assets.indexOf("174,470") < assets.indexOf("172,000"), assets);

  fs.mkdirSync(previewDir, { recursive: true });
  const wanted = [
    ["01-cover", 1],
    ["03-page-3", 3],
    ["auditor", pagesText.findIndex((text) => text.includes("Independent Auditor's Report")) + 1],
    ["balance-sheet", balancePage + 1],
    ["operations", pagesText.findIndex((text) => text.includes("STATEMENTS OF OPERATIONS")) + 1],
    ["cash-flows", pagesText.findIndex((text) => text.includes("STATEMENTS OF CASH FLOWS")) + 1],
    ["notes", pagesText.findIndex((text) => /1\.\s+NATURE OF BUSINESS/.test(text)) + 1],
  ];
  for (const [name, page] of wanted) {
    assert.ok(page > 0, name);
    run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "80", "-singlefile", file, path.join(previewDir, name)]);
  }
});
