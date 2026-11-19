import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { annualHeaderName, annualPdfFilename } from "./annualPrint.js";
import { parseAnnualWorkbook } from "./annualWorkbook.js";

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
    ["auditor", pagesText.findIndex((text) => text.includes("We have audited")) + 1],
    ["balance-sheet", balancePage + 1],
    ["operations", pagesText.findIndex((text) => text.includes("STATEMENTS OF OPERATIONS")) + 1],
    ["cash-flows", pagesText.findIndex((text) => text.includes("STATEMENTS OF CASH FLOWS")) + 1],
    ["notes", pagesText.findIndex((text) => /1\.\s+NATURE OF BUSINESS/.test(text)) + 1],
  ];
  for (const [name, page] of wanted) {
    assert.ok(page > 0, name);
    run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "80", "-singlefile", file, path.join(previewDir, name)]);
  }

  const phrase = "Illustrative demo: fictitious entity";
  assert.equal(pagesText[0].split(phrase).length - 1, 1);
  pagesText.slice(1).forEach((text, index) => assert.equal(text.includes(phrase), false, `page ${index + 2}`));
  const receivableAt = pagesText.findIndex((text) => text.includes("4. ACCOUNTS RECEIVABLE"));
  assert.ok(receivableAt >= 0);
  const receivablePage = `${pagesText[receivableAt]}\n${pagesText[receivableAt + 1] || ""}`;
  for (const amount of ["10,600", "1,700", "8,500", "1,300", "12,500", "10,000"]) {
    assert.ok(receivablePage.includes(amount), amount);
  }
  const parsed = await parseAnnualWorkbook(workbook);
  for (const note of parsed.notes) {
    for (const block of note.blocks) {
      if (block.type !== "table") continue;
      for (const row of block.rows) {
        assert.ok(row.values.some((value) => value != null), `${note.number} ${row.label}`);
        for (const value of row.values) {
          const rounded = Math.round(Number(value));
          if (!Number.isFinite(rounded) || Math.abs(rounded) < 100) continue;
          const shown = Math.abs(rounded).toLocaleString("en-US");
          assert.ok(whole.includes(shown), `note ${note.number} ${row.label} ${shown}`);
        }
      }
    }
  }

  const boxes = run("pdftotext", ["-bbox", file, "-"]);
  const boxedPages = boxes.split(/<page /).slice(1).map((chunk) => {
    const words = [];
    const pattern = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
    let match = pattern.exec(chunk);
    while (match) {
      words.push({
        xMin: Number(match[1]),
        yMin: Number(match[2]),
        xMax: Number(match[3]),
        yMax: Number(match[4]),
        text: match[5],
      });
      match = pattern.exec(chunk);
    }
    return words;
  });
  function span(words) {
    const body = words.filter((word) => word.yMin >= 68 && word.yMax <= 730 && word.text.trim());
    return {
      min: Math.min(...body.map((word) => word.xMin)),
      max: Math.max(...body.map((word) => word.xMax)),
    };
  }
  const widePages = [
    ["index", pagesText.findIndex((text) => text.includes("INDEX TO FINANCIAL STATEMENTS"))],
    ["auditor", pagesText.findIndex((text) => text.includes("We have audited"))],
    ["balance", pagesText.findIndex((text) => text.includes("BALANCE SHEETS") && text.includes("Total assets"))],
    ["operations", pagesText.findIndex((text) => text.includes("STATEMENTS OF OPERATIONS"))],
    ["equity", pagesText.findIndex((text) => text.includes("STATEMENTS OF CHANGES IN MEMBER'S EQUITY"))],
    ["cash", pagesText.findIndex((text) => text.includes("STATEMENTS OF CASH FLOWS"))],
  ];
  for (const [name, index] of widePages) {
    assert.ok(index >= 0, name);
    const range = span(boxedPages[index]);
    assert.ok(range.min <= 90 && range.max >= 522, `${name} x ${range.min.toFixed(1)}-${range.max.toFixed(1)}`);
  }
  pagesText.forEach((text, index) => {
    const lines = text.split(/\n/).map((line) => line.trim()).filter((line) => line && line !== "Purple Hat Demo LLC" && !/^F-\d+$/.test(line));
    const last = lines.at(-1) || "";
    assert.equal(/^\d+\.\s+[A-Z]/.test(last), false, `orphaned heading on page ${index + 1}: ${last}`);
  });

  const round3 = path.join(previewDir, "round3");
  fs.mkdirSync(round3, { recursive: true });
  for (let page = 1; page <= pages; page += 1) {
    const name = `page-${String(page).padStart(2, "0")}`;
    run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "80", "-singlefile", file, path.join(round3, name)]);
  }
});
