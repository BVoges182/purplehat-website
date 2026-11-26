import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { extractAfsStatementCss } from "./afsCssSnapshot.js";
import { renderAnnualPdfLib } from "./annualPdfLib.js";
import { parseAnnualWorkbook } from "./annualWorkbook.js";
import { normalizePdf } from "./pdfNormalize.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "PurpleHatDemo_Audited_FS_FY2026.xlsx");

function pdfText(buffer) {
  const raw = Buffer.from(buffer).toString("latin1");
  let decoded = raw;
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded += zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      // Uncompressed objects are already in the raw text.
    }
  }
  return decoded;
}

test("the annual statements PDF stays Times Roman, navy, and banded", async () => {
  const document = await parseAnnualWorkbook(fs.readFileSync(fixture));
  const statement = { document, year: "2026" };
  const first = Buffer.from(await renderAnnualPdfLib(statement));
  const second = Buffer.from(await renderAnnualPdfLib(statement));
  const left = normalizePdf(first);
  const right = normalizePdf(second);
  const digest = createHash("sha256").update(left).digest("hex");
  assert.equal(digest, createHash("sha256").update(right).digest("hex"));
  const baseline = fs.readFileSync(path.join(path.dirname(fixture), "afs-pdf-baseline.sha256"), "utf8").trim();
  assert.equal(digest, baseline);
  const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "src", "index.css");
  const cssBaseline = fs.readFileSync(path.join(path.dirname(fixture), "afs-css-baseline.css"), "utf8");
  const sameLines = (value) => value.replace(/\r\n/g, "\n");
  assert.equal(sameLines(extractAfsStatementCss(fs.readFileSync(cssPath, "utf8"))), sameLines(cssBaseline));
  const text = pdfText(first);
  assert.match(text, /Times-Roman/);
  assert.match(text, /Times-Bold/);
  assert.doesNotMatch(text, /Barlow/);
  assert.match(text, /0\.12156862745098039 0\.2196078431372549 0\.39215686274509803/);
  assert.match(text, /0\.8 0\.9333333333333333 1/);
});
