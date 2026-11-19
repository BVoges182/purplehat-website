import fs from "node:fs";
import jwt from "jsonwebtoken";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import puppeteer from "puppeteer-core";

export function annualHeaderName(entity) {
  const words = String(entity || "").match(/[A-Za-z0-9]+/g) || [];
  return words.map((word) => (/^llc$/i.test(word) ? "LLC" : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join(" ");
}

export function annualPdfFilename(statement) {
  const entity = statement?.document?.cover?.lines?.[0]?.text || "";
  const compact = annualHeaderName(entity).replace(/\bLLC\b/g, "").replace(/[^A-Za-z0-9]+/g, "");
  return `${compact || "Annual"}_Audited_FS_FY${statement?.year || "draft"}.pdf`;
}

export function signAnnualPrint(statement) {
  return jwt.sign(
    {
      sub: Number(statement.userId),
      scope: "annual-print",
      year: String(statement.year),
      statementId: Number(statement.id),
    },
    process.env.JWT_SECRET,
    { expiresIn: "2m" },
  );
}

export function readAnnualPrintToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.scope !== "annual-print") {
    const error = new Error("That link has expired.");
    error.status = 401;
    throw error;
  }
  return payload;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[char]);
}

async function printOrigin() {
  if (process.env.AFS_PRINT_ORIGIN) return String(process.env.AFS_PRINT_ORIGIN).replace(/\/$/, "");
  // Vite on Windows listens on IPv6 localhost, so 127.0.0.1 alone misses the dev server.
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(800) });
      if (response.status < 500) return origin;
    } catch {
      // Try the next dev origin, then the built client on the API port.
    }
  }
  return `http://127.0.0.1:${Number(process.env.PORT || 8787)}`;
}

function headerTemplate(entity) {
  return `<div style="width:100%; font-size:10pt; font-weight:700; text-align:center; font-family:'Times New Roman',Times,serif; color:#000;">${escapeHtml(entity)}</div>`;
}

function footerTemplate() {
  // Chromium numbers a "2-" range from the original page, so the index would be F-2.
  // The footer is stamped after the merge, with F-1 on the index.
  return `<span style="font-size:10pt;"></span>`;
}

async function mergePdf(cover, rest) {
  const merged = await PDFDocument.create();
  const coverDoc = await PDFDocument.load(cover);
  const restDoc = await PDFDocument.load(rest);
  for (const page of await merged.copyPages(coverDoc, coverDoc.getPageIndices())) merged.addPage(page);
  for (const page of await merged.copyPages(restDoc, restDoc.getPageIndices())) merged.addPage(page);
  const font = await merged.embedFont(StandardFonts.TimesRoman);
  const navy = rgb(31 / 255, 56 / 255, 100 / 255);
  const pages = merged.getPages();
  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index];
    const label = `F-${index}`;
    const size = 8;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (page.getWidth() - width) / 2,
      y: 36,
      size,
      font,
      color: navy,
    });
  }
  return Buffer.from(await merged.save());
}

export async function renderAnnualPdf(statement) {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("Install Google Chrome to prepare the PDF.");
  const origin = await printOrigin();
  const token = signAnnualPrint(statement);
  const url = `${origin}/print/financial-statements/${statement.userId}/${statement.year}?token=${encodeURIComponent(token)}`;
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    try {
      await page.waitForFunction(() => window.__AFS_READY__ === true, { timeout: 30000 });
    } catch {
      const text = await page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 240)).catch(() => "");
      throw new Error(`The statement page did not finish loading. ${text}`.trim());
    }
    await page.emulateMediaType("print");
    const entity = statement.document?.cover?.lines?.[0]?.text || "";
    const options = {
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    };
    const cover = await page.pdf({ ...options, pageRanges: "1", displayHeaderFooter: false });
    const rest = await page.pdf({
      ...options,
      pageRanges: "2-",
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(annualHeaderName(entity)),
      footerTemplate: footerTemplate(),
    });
    return mergePdf(cover, rest);
  } finally {
    await browser.close();
  }
}
