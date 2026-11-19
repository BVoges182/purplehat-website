import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
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
  assert.ok(pages >= 18 && pages <= 26, `expected 18 to 26 pages, got ${pages}`);

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

  const note6Title = parsed.notes.find((note) => note.number === 6).title;
  const note6At = pagesText.findIndex((text) => text.split(/\n/).some((line) => line.trim().toUpperCase().startsWith(note6Title.toUpperCase())));
  assert.ok(note6At >= 0, note6Title);
  const note6Text = pagesText.slice(note6At, note6At + 3).join("\n");
  for (const amount of ["18,000", "15,000", "24,000", "21,000", "42,000", "(6,000)"]) {
    assert.ok(note6Text.includes(amount), amount);
  }
  const note6Flat = note6Text.replace(/\s+/g, " ");
  assert.match(note6Flat, /Depreciation expense was \$6,000 in 2026 and nil in 2025/);
  assert.match(note6Flat, /Additions of \$6,000 in 2026 and \$36,000 in 2025 were paid in cash/);
  function median(values) {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function bodyHeight(words) {
    const heights = words
      .filter((word) => word.yMin >= 68 && word.yMax <= 740 && /[A-Za-z]/.test(word.text))
      .map((word) => word.yMax - word.yMin);
    return median(heights);
  }
  const fontPages = [
    ["index", pagesText.findIndex((text) => text.includes("INDEX TO FINANCIAL STATEMENTS"))],
    ["auditor", pagesText.findIndex((text) => text.includes("We have audited"))],
    ["balance", pagesText.findIndex((text) => text.includes("BALANCE SHEETS") && text.includes("Total assets"))],
    ["operations", pagesText.findIndex((text) => text.includes("STATEMENTS OF OPERATIONS"))],
    ["note6", note6At],
  ];
  const heights = {};
  for (const [name, index] of fontPages) {
    assert.ok(index >= 0, name);
    heights[name] = bodyHeight(boxedPages[index]);
  }
  for (const [name, height] of Object.entries(heights)) {
    assert.ok(Math.abs(height - heights.auditor) <= 1, `${name} ${height.toFixed(2)} vs auditor ${heights.auditor.toFixed(2)}`);
  }
  assert.match(run("pdffonts", [file]), /Tinos|Times/);

  const round3 = path.join(previewDir, "round3");
  fs.mkdirSync(round3, { recursive: true });
  for (let page = 1; page <= pages; page += 1) {
    const name = `page-${String(page).padStart(2, "0")}`;
    run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "80", "-singlefile", file, path.join(round3, name)]);
  }
  const round4 = path.join(previewDir, "round4");
  fs.mkdirSync(round4, { recursive: true });
  for (let page = 1; page <= pages; page += 1) {
    const name = `page-${String(page).padStart(2, "0")}`;
    run("pdftoppm", ["-f", String(page), "-l", String(page), "-png", "-r", "80", "-singlefile", file, path.join(round4, name)]);
  }
});

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

test("statement text is one size and the download buttons match management reports", { timeout: 120000 }, async () => {
  const password = envValue(path.join(repoRoot, "thinking-hat", "server", ".env"), "DEMO_PASSWORD");
  const executablePath = chromeExecutable();
  assert.ok(executablePath, "Chrome is required for the on-screen check");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.type('input[type="email"]', "demo@purplehat.fun");
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname !== "/login", { timeout: 30000 });
    await page.goto("http://localhost:5173/statements", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#note-6 tbody tr", { timeout: 30000 });
    await page.addStyleTag({ content: "header { position: static !important; }" });
    const measured = await page.evaluate(() => {
      function sample(selector) {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
        };
      }
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Download PDF");
      const buttonStyle = button ? getComputedStyle(button) : null;
      return {
        index: sample("#index li"),
        auditor: sample("#auditor p"),
        balance: sample("#balance-sheets tbody th"),
        operations: sample("#operations tbody td"),
        note: sample("#note-6 p"),
        indexTitle: sample("#index h2"),
        auditorTitle: sample("#auditor h2"),
        balanceTitle: sample("#balance-sheets h2"),
        noteTitle: sample("#note-6 h2"),
        kicker: sample("#index .afs-kicker"),
        footer: sample("#balance-sheets .afs-footer"),
        fpage: sample("#balance-sheets .afs-fpage"),
        button: buttonStyle ? {
          fontFamily: buttonStyle.fontFamily,
          fontSize: buttonStyle.fontSize,
          fontWeight: buttonStyle.fontWeight,
          borderRadius: buttonStyle.borderRadius,
          minHeight: buttonStyle.minHeight,
          paddingTop: buttonStyle.paddingTop,
          paddingBottom: buttonStyle.paddingBottom,
          paddingLeft: buttonStyle.paddingLeft,
          paddingRight: buttonStyle.paddingRight,
          borderTopWidth: buttonStyle.borderTopWidth,
          borderTopColor: buttonStyle.borderTopColor,
          backgroundColor: buttonStyle.backgroundColor,
          color: buttonStyle.color,
        } : null,
      };
    });
    for (const name of ["index", "auditor", "balance", "operations", "note"]) {
      assert.ok(measured[name], name);
      assert.equal(measured[name].fontSize, measured.auditor.fontSize, name);
      assert.match(measured[name].fontFamily, /Tinos|Times/);
    }
    const bodyPx = Number.parseFloat(measured.auditor.fontSize);
    const linePx = Number.parseFloat(measured.auditor.lineHeight);
    assert.ok(Math.abs(linePx / bodyPx - 1.3) < 0.08, `line height ${linePx} / ${bodyPx}`);
    assert.equal(measured.index.paddingTop, measured.balance.paddingTop);
    assert.equal(measured.index.paddingBottom, measured.balance.paddingBottom);
    for (const name of ["indexTitle", "auditorTitle", "balanceTitle", "noteTitle"]) {
      assert.equal(measured[name].fontSize, measured.indexTitle.fontSize, name);
      assert.ok(Number.parseFloat(measured[name].fontSize) > bodyPx, name);
    }
    assert.equal(measured.kicker.fontSize, measured.auditor.fontSize);
    assert.ok(Number.parseFloat(measured.kicker.fontWeight) >= 700);
    assert.ok(Number.parseFloat(measured.footer.fontSize) < bodyPx);
    assert.equal(measured.footer.fontSize, measured.fpage.fontSize);
    const round4 = path.join(previewDir, "round4");
    fs.mkdirSync(round4, { recursive: true });
    await page.$("#index").then((node) => node.screenshot({ path: path.join(round4, "screen-index.png") }));
    await page.$("#auditor").then((node) => node.screenshot({ path: path.join(round4, "screen-auditor.png") }));
    await page.$("#note-6").then((node) => node.screenshot({ path: path.join(round4, "screen-note-6.png") }));
    const statementsButton = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Download PDF")?.closest("section"));
    await statementsButton.asElement().screenshot({ path: path.join(round4, "screen-buttons-statements.png") });
    await page.goto("http://localhost:5173/reports", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((node) => node.textContent.trim() === "Download PDF"), { timeout: 30000 });
    const reports = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Download PDF");
      const style = getComputedStyle(button);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        borderRadius: style.borderRadius,
        minHeight: style.minHeight,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        borderTopWidth: style.borderTopWidth,
      };
    });
    const reportsButton = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Download PDF")?.closest("section"));
    await reportsButton.asElement().screenshot({ path: path.join(round4, "screen-buttons-reports.png") });
    for (const key of ["fontFamily", "fontSize", "fontWeight", "borderRadius", "minHeight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "borderTopWidth"]) {
      assert.equal(measured.button[key], reports[key], key);
    }
    assert.match(measured.button.fontFamily, /Nunito/);
    assert.equal(measured.button.borderTopColor, "rgb(31, 56, 100)");
    assert.equal(measured.button.backgroundColor, "rgb(255, 255, 255)");
    assert.equal(measured.button.color, "rgb(31, 56, 100)");
    assert.doesNotMatch(measured.button.fontFamily, /Tinos|Times/);
  } finally {
    await browser.close();
  }
});
