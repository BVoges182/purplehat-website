import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { normalizePdf } from "./pdfNormalize.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function redact(text) {
  return String(text || "").replace(/password[^\s]*/gi, "[redacted]");
}

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

if (process.env.MGMT_PDF_CHILD === "1") {
  const { renderManagementReportPdf } = await import("./managementReports.js");
  const report = {
    title: "Management report",
    periodLabel: "December 2026",
    entityName: "Purple Hat Demo LLC",
    customOrder: true,
    sections: [],
  };
  const user = { business_name: "Purple Hat Demo LLC", name: "Demo", report_template: "purple-hat-demo" };
  const first = Buffer.from(await renderManagementReportPdf(report, user));
  const second = Buffer.from(await renderManagementReportPdf({ ...report, theme: "dark" }, { ...user, theme: "dark" }));
  fs.writeFileSync(process.argv[2], JSON.stringify({
    arity: renderManagementReportPdf.length,
    first: first.toString("base64"),
    second: second.toString("base64"),
  }));
  process.exit(0);
}

test("the management report PDF is light Ledger Navy in every theme", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-mgmt-pdf-"));
  const outFile = path.join(dataDir, "pdf.json");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), outFile], {
    cwd: here,
    env: {
      ...process.env,
      MGMT_PDF_CHILD: "1",
      DATA_DIR: dataDir,
      DEMO_AUTO_RESET: "",
      ADMIN_EMAIL: "mgmt-pdf-test@example.com",
      ADMIN_PASSWORD: "mgmt-pdf-test-admin",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on("close", resolve));
  const payload = code === 0 ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.equal(code, 0, redact(stderr).slice(-500));
  assert.equal(payload.arity, 2);
  const first = Buffer.from(payload.first, "base64");
  const second = Buffer.from(payload.second, "base64");
  const left = createHash("sha256").update(normalizePdf(first)).digest("hex");
  const right = createHash("sha256").update(normalizePdf(second)).digest("hex");
  assert.equal(left, right);
  const text = pdfText(first);
  assert.match(text, /Barlow/);
  assert.match(text, /0\.12156862745098039 0\.2196078431372549 0\.39215686274509803/);
});
