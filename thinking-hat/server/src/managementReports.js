import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import db, { nowIso } from "./db.js";

const fontDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fonts");

function roundHalfAway(value, digits) {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

function grouped(value, digits) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function reportMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const formatted = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

export function reportFigure(value, format) {
  if (!format) return reportMoney(value);
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (format === "percent") {
    const pct = roundHalfAway(number * 100, 0);
    const text = `${grouped(Math.abs(pct), 0)}%`;
    return pct < 0 ? `(${text})` : text;
  }
  const digits = format === "money2" ? 2 : 0;
  const rounded = roundHalfAway(number, digits);
  const text = grouped(Math.abs(rounded), digits);
  return rounded < 0 ? `(${text})` : text;
}

const DONUT_COLOURS = [
  "#c4b5fd",
  "#b09afc",
  "#a78bfa",
  "#9674f8",
  "#8b5cf6",
  "#7c3aed",
  "#6d28d9",
  "#5b21b6",
  "#4c1d95",
  "#3c1778",
  "#31135f",
  "#2a1548",
];

export function reportPdfFilename(businessName, month) {
  const slug = String(businessName || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  return `${slug}-management-report-${month}.pdf`;
}

function listRow(row) {
  return {
    month: row.month,
    title: row.title,
    periodLabel: row.period_label,
    entityName: row.entity_name,
  };
}

export function reportPeriodFor(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;
  const title = new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const ended = new Date(Date.UTC(year, monthIndex - 1, lastDay)).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    title,
    periodLabel: `Management report · Month ended ${ended}`,
  };
}

export function listManagementReports(userId) {
  const rows = db.prepare(
    "SELECT month, title, period_label, entity_name FROM management_reports WHERE user_id = ? ORDER BY month DESC",
  ).all(userId);
  return rows.map(listRow);
}

export function listAllManagementReports() {
  const rows = db.prepare(
    `SELECT management_reports.month, management_reports.title, management_reports.period_label, management_reports.entity_name,
            users.id AS user_id, users.business_name, users.name, users.email
     FROM management_reports
     JOIN users ON users.id = management_reports.user_id
     ORDER BY management_reports.month DESC, users.business_name COLLATE NOCASE, users.name COLLATE NOCASE`,
  ).all();
  return rows.map((row) => ({
    ...listRow(row),
    userId: Number(row.user_id),
    businessName: row.business_name,
    name: row.name,
    email: row.email,
  }));
}

export function saveManagementReport({ userId, month, entityName, sections, replace }) {
  const period = reportPeriodFor(month);
  if (!period) return { error: "Choose a report month." };
  const existing = db.prepare(
    "SELECT id, title FROM management_reports WHERE user_id = ? AND month = ?",
  ).get(userId, month);
  if (existing && !replace) return { exists: true, title: existing.title };
  const json = JSON.stringify({ sections });
  if (existing) {
    db.prepare(
      "UPDATE management_reports SET title = ?, period_label = ?, entity_name = ?, content_json = ? WHERE id = ?",
    ).run(period.title, period.periodLabel, entityName || "", json, existing.id);
  } else {
    db.prepare(
      `INSERT INTO management_reports (user_id, month, title, period_label, entity_name, content_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, month, period.title, period.periodLabel, entityName || "", json, nowIso());
  }
  return {
    exists: Boolean(existing),
    replaced: Boolean(existing),
    report: listRow(db.prepare(
      "SELECT month, title, period_label, entity_name FROM management_reports WHERE user_id = ? AND month = ?",
    ).get(userId, month)),
  };
}

export function deleteManagementReport(userId, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return false;
  const result = db.prepare("DELETE FROM management_reports WHERE user_id = ? AND month = ?").run(userId, month);
  return Number(result.changes) > 0;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shiftMonth(month, offset) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function columnIndexForMonth(columns, month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!match || !columns?.length) return 0;
  const name = SHORT_MONTHS[Number(match[2]) - 1];
  const index = columns.findIndex((column) => {
    const text = String(column || "");
    return text.includes(match[1]) && new RegExp(`\\b${name}\\b`, "i").test(text);
  });
  return index >= 0 ? index : 0;
}

function sectionAmount(section, label, index) {
  const wanted = label.toLowerCase();
  const row = (section?.rows || []).find((item) => String(item.label || "").trim().toLowerCase() === wanted);
  const value = row?.values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function wholePounds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return roundHalfAway(value, 0);
}

export function dashboardFigures(userId) {
  const rows = db.prepare(
    "SELECT month, content_json FROM management_reports WHERE user_id = ? ORDER BY month",
  ).all(userId);
  const points = rows.map((row) => {
    const content = JSON.parse(row.content_json);
    const sections = Array.isArray(content.sections) ? content.sections : [];
    const executive = sections.find((section) => /executive summary/i.test(section.title || ""));
    const balance = sections.find((section) => /balance sheet/i.test(section.title || ""));
    const execIndex = columnIndexForMonth(executive?.columns, row.month);
    const balanceIndex = columnIndexForMonth(balance?.columns, row.month);
    const cost = sectionAmount(executive, "Cost of Sales", execIndex);
    const overhead = sectionAmount(executive, "Expenses", execIndex);
    return {
      month: row.month,
      cash: wholePounds(sectionAmount(executive, "Closing bank balance", execIndex)),
      revenue: wholePounds(sectionAmount(executive, "Income", execIndex)),
      expenses: typeof cost === "number" && typeof overhead === "number" ? wholePounds(cost + overhead) : null,
      receivables: wholePounds(sectionAmount(balance, "Accounts Receivable", balanceIndex)),
      payables: wholePounds(sectionAmount(balance, "Accounts Payable", balanceIndex)),
    };
  });
  const latest = points.length ? points[points.length - 1] : null;
  const end = latest?.month || new Date().toISOString().slice(0, 7);
  const chart = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const month = shiftMonth(end, offset);
    const point = points.find((item) => item.month === month);
    chart.push({
      month,
      revenue: point ? point.revenue : null,
      expenses: point ? point.expenses : null,
    });
  }
  return { latest, chart, months: points };
}

export function readManagementReport(userId, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return null;
  const row = db.prepare(
    "SELECT * FROM management_reports WHERE user_id = ? AND month = ?",
  ).get(userId, month);
  if (!row) return null;
  const content = JSON.parse(row.content_json);
  return {
    ...listRow(row),
    sections: Array.isArray(content.sections) ? content.sections : [],
  };
}

function registerFonts(doc) {
  doc.registerFont("Nunito", path.join(fontDir, "Nunito-Regular.ttf"));
  doc.registerFont("Nunito-ExtraBold", path.join(fontDir, "Nunito-ExtraBold.ttf"));
  doc.registerFont("Outfit", path.join(fontDir, "Outfit-Regular.ttf"));
  doc.registerFont("Outfit-SemiBold", path.join(fontDir, "Outfit-SemiBold.ttf"));
}

export function renderManagementReportPdf(report, user) {
  const businessName = user.business_name || user.name || "Client";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 16, left: 40, right: 40 },
      bufferPages: true,
      info: {
        Title: report.periodLabel,
        Author: "Purple Hat",
        Subject: `${businessName} ${report.title}`,
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      registerFonts(doc);
      drawReport(doc, report, businessName);
      const range = doc.bufferedPageRange();
      for (let page = range.start; page < range.start + range.count; page += 1) {
        doc.switchToPage(page);
        const label = `${page - range.start + 1} / ${range.count}`;
        doc.font("Outfit").fontSize(8).fillColor("#6b6b6b");
        doc.text(label, 40, doc.page.height - 34, {
          width: doc.page.width - 80,
          align: "right",
          lineBreak: false,
        });
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

const PAGE_FOOTER = 56;

const STATEMENT_STYLES = [
  { fontSize: 8, rowPad: 6, minRow: 14, headingRow: 18, headerFont: 7.5, titleSize: 14, noteSize: 9, headerBand: 28, unitOffset: 10 },
  { fontSize: 7.5, rowPad: 4, minRow: 12, headingRow: 15, headerFont: 7, titleSize: 13, noteSize: 8, headerBand: 24, unitOffset: 9 },
  { fontSize: 7, rowPad: 3, minRow: 11, headingRow: 14, headerFont: 6.5, titleSize: 12, noteSize: 8, headerBand: 22, unitOffset: 8 },
  { fontSize: 6.5, rowPad: 2, minRow: 10, headingRow: 13, headerFont: 6, titleSize: 12, noteSize: 7.5, headerBand: 20, unitOffset: 7 },
];

function pageLimit(doc) {
  return doc.page.height - PAGE_FOOTER;
}

function ownsPage(section) {
  const title = String(section.title || "").toLowerCase();
  return title.includes("profit and loss") || title.includes("balance sheet") || title.includes("cash flow");
}

function sectionNote(section) {
  return String(section.note || "").split(" · ").filter((part) => !/grouped into other/i.test(part)).join(" · ");
}

function labelColumnWidth(section, width) {
  const columns = section.columns || [];
  return Math.min(230, width * (columns.length > 3 ? 0.36 : 0.42));
}

function contactFrame(width) {
  const chartWidth = 190;
  const gap = 14;
  const tableWidth = width - chartWidth - gap;
  const amountWidth = 70;
  return {
    chartWidth,
    gap,
    tableWidth,
    amountWidth,
    contactWidth: tableWidth - amountWidth,
  };
}

function isPeriodContact(section) {
  const title = String(section.title || "");
  return /year to date/i.test(title) || /april\s*[–—-]/i.test(title);
}

function isSeptemberExpenses(section) {
  const title = String(section.title || "");
  return section.presentation === "contacts" && /expense/i.test(title) && !isPeriodContact(section);
}

function displayTitle(section) {
  const title = String(section.title || "").replace(/\s+by\s+contact\b/gi, "").replace(/\s+/g, " ").trim();
  if (section.presentation !== "contacts") return String(section.title || "");
  if (/[—–]\s*top\s+(expenses|income)\s*$/i.test(title)) return title;
  const kind = /income/i.test(title) ? "income" : /expense/i.test(title) ? "expenses" : "";
  if (!kind) return title;
  const range = title.match(/April\s*[–—-]\s*[A-Za-z]+(?:\s+\d{4})?/i);
  if (range || /year to date/i.test(title)) {
    let period = range ? range[0].replace(/\s*[–—-]\s*/, "–") : "";
    if (period && !/\d{4}/.test(period)) {
      const year = title.match(/\d{4}/);
      if (year) period = `${period} ${year[0]}`;
    }
    return period ? `${period} — Top ${kind}` : `Top ${kind}`;
  }
  const month = title.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i);
  if (month) {
    const formatted = month[0].charAt(0).toUpperCase() + month[0].slice(1);
    return `${formatted} — Top ${kind}`;
  }
  return title;
}

function isFollowingContact(section) {
  return section.presentation === "contacts" && !isSeptemberExpenses(section);
}

function contactContent(section) {
  const rows = (section.rows || []).filter((row) => row.kind === "total" || !isOtherLabel(row.label));
  const slices = (section.slices || []).filter((slice) => !isOtherLabel(slice.label));
  return { rows, slices };
}

function prepareContact(doc, section, width, style) {
  const frame = contactFrame(width);
  const { rows, slices } = contactContent(section);
  const legendWidth = frame.chartWidth - 16;
  doc.font("Outfit").fontSize(style.fontSize);
  const legend = slices.map((slice) => {
    const textHeight = doc.heightOfString(slice.label || "", { width: legendWidth });
    return Math.max(style.fontSize + 2, textHeight);
  });
  const heights = rows.map((row) => measureRow(doc, row, frame.contactWidth, style));
  const header = style.headerBand + 2;
  let cursor = header;
  const tops = heights.map((height) => {
    const top = cursor;
    cursor += height;
    return top;
  });
  const totalTop = tops.length ? tops[tops.length - 1] : header;
  const beforeLast = legend.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const last = legend[legend.length - 1] || 0;
  const oneLine = doc.heightOfString("Ag", { width: legendWidth });
  const lastExtra = Math.max(0, last - oneLine);
  const chartGap = 8;
  const legendStart = Math.max(chartGap, totalTop - beforeLast - lastExtra);
  const diameter = Math.max(0, Math.min(frame.chartWidth - 8, legendStart - chartGap));
  return {
    frame,
    rows,
    slices,
    legend,
    heights,
    header,
    tableHeight: cursor,
    totalTop,
    legendStart,
    legendWidth,
    radius: diameter / 2,
  };
}

function measureRow(doc, row, labelWidth, style) {
  if (row.kind === "heading") return style.headingRow;
  doc.font(row.kind === "line" ? "Outfit" : "Nunito-ExtraBold").fontSize(style.fontSize);
  const textHeight = doc.heightOfString(row.label || "", { width: Math.max(10, labelWidth - 8) });
  return Math.max(style.minRow, textHeight + style.rowPad);
}

function measureChrome(doc, section, width, style) {
  doc.font("Nunito-ExtraBold").fontSize(style.titleSize);
  let height = doc.heightOfString(displayTitle(section), { width }) + 6;
  const note = sectionNote(section);
  if (note) {
    doc.font("Outfit").fontSize(style.noteSize);
    height += doc.heightOfString(note, { width }) + 8;
  }
  return height;
}

function measureStatementBody(doc, section, width, style) {
  const labelWidth = labelColumnWidth(section, width);
  let height = style.headerBand + 2;
  for (const row of section.rows || []) height += measureRow(doc, row, labelWidth, style);
  return height;
}

function measureContactsBody(doc, section, width, style) {
  const layout = prepareContact(doc, section, width, style);
  const legendBottom = layout.legendStart + layout.legend.reduce((sum, value) => sum + value, 0);
  return Math.max(layout.tableHeight, legendBottom);
}

function measureSection(doc, section, width, style) {
  const body = section.presentation === "contacts"
    ? measureContactsBody(doc, section, width, style)
    : measureStatementBody(doc, section, width, style);
  return measureChrome(doc, section, width, style) + body;
}

function styleFor(doc, section, width, y) {
  const styles = ownsPage(section) ? STATEMENT_STYLES : [STATEMENT_STYLES[0]];
  let chosen = styles[styles.length - 1];
  for (const style of styles) {
    chosen = style;
    if (measureSection(doc, section, width, style) <= pageLimit(doc) - y) break;
  }
  return chosen;
}

function paintSection(doc, section, y, left, width, style) {
  doc.font("Nunito-ExtraBold").fontSize(style.titleSize).fillColor("#1c1c1c");
  doc.text(displayTitle(section), left, y, { width });
  y = doc.y + 6;
  const note = sectionNote(section);
  if (note) {
    doc.font("Outfit").fontSize(style.noteSize).fillColor("#6b6b6b");
    doc.text(note, left, y, { width });
    y = doc.y + 8;
  }
  return section.presentation === "contacts"
    ? drawContacts(doc, section, y, left, width, style)
    : drawTable(doc, section, y, left, width, style);
}

function bannerHeight(continued) {
  return (continued ? 58 : 108) + 16;
}

function groupHeight(doc, sections, width, style, gapSize) {
  return sections.reduce((sum, section, index) => sum + (index ? gapSize : 0) + measureSection(doc, section, width, style), 0);
}

function drawReport(doc, report, businessName) {
  const left = 40;
  const width = doc.page.width - 80;
  let y = drawBanner(doc, report, businessName, false);
  let contentStart = y;
  const sections = report.sections || [];
  const laterContacts = sections.filter(isFollowingContact);
  const opening = sections.filter((section) => !isFollowingContact(section) && !ownsPage(section));
  const laterRoom = pageLimit(doc) - bannerHeight(true);
  let laterStyle = STATEMENT_STYLES[STATEMENT_STYLES.length - 1];
  for (const style of STATEMENT_STYLES) {
    laterStyle = style;
    if (groupHeight(doc, laterContacts, width, style, 10) <= laterRoom) break;
  }
  const openingRoom = pageLimit(doc) - y;
  let openingStyle = STATEMENT_STYLES[STATEMENT_STYLES.length - 1];
  for (const style of STATEMENT_STYLES) {
    openingStyle = style;
    if (groupHeight(doc, opening, width, style, 16) <= openingRoom) break;
  }
  let contactGroupOpen = false;

  const freshPage = () => {
    doc.addPage();
    y = drawBanner(doc, report, businessName, true);
    contentStart = y;
  };

  sections.forEach((section) => {
    const following = isFollowingContact(section);
    if (ownsPage(section) && y > contentStart + 4) freshPage();
    if (following && !contactGroupOpen) {
      freshPage();
      contactGroupOpen = true;
    }
    if (!following) contactGroupOpen = false;
    const style = following
      ? laterStyle
      : ownsPage(section)
        ? styleFor(doc, section, width, y)
        : openingStyle;
    const gapSize = following ? 10 : 16;
    if (y > contentStart + 4) y += gapSize;
    y = paintSection(doc, section, y, left, width, style);
  });
}

function drawBanner(doc, report, businessName, continued) {
  const band = continued ? 58 : 108;
  doc.save();
  doc.rect(0, 0, doc.page.width, band).fill("#f4f4f4");
  doc.restore();
  doc.font("Nunito-ExtraBold").fontSize(continued ? 9 : 11).fillColor("#1c1c1c");
  doc.text("Purple Hat", 40, continued ? 14 : 22, { lineBreak: false });
  doc.font("Outfit").fontSize(8).fillColor("#5c5c5c");
  doc.text("Thinking Hat", 40, continued ? 26 : 36, { lineBreak: false });
  doc.font("Nunito-ExtraBold").fontSize(continued ? 10 : 13).fillColor("#1c1c1c");
  doc.text(report.periodLabel, 40, continued ? 38 : 66, {
    width: doc.page.width - 80,
    lineBreak: false,
  });
  if (!continued) {
    doc.font("Outfit-SemiBold").fontSize(9).fillColor("#3a3a3a");
    doc.text(businessName, 40, 84, { width: doc.page.width - 80, lineBreak: false });
  }
  return band + 16;
}

function drawTable(doc, section, startY, left, width, style) {
  const columns = section.columns || [];
  const labelWidth = labelColumnWidth(section, width);
  const valueWidth = columns.length ? (width - labelWidth) / columns.length : width;
  let y = startY;
  const units = section.units || [];
  const headerHeight = units.some(Boolean) ? style.headerBand : Math.max(16, style.headerFont + 8);
  doc.save();
  doc.rect(left, y - 3, width, headerHeight).fill("#f3f3f3");
  doc.restore();
  doc.font("Outfit-SemiBold").fontSize(style.headerFont).fillColor("#5c5c5c");
  if (section.labelHeader) {
    doc.text(section.labelHeader, left + 4, y, { width: labelWidth - 8, lineBreak: false });
  }
  columns.forEach((column, index) => {
    const x = left + labelWidth + valueWidth * index;
    doc.font("Outfit-SemiBold").fontSize(style.headerFont).fillColor("#5c5c5c");
    const headerWidth = doc.widthOfString(column);
    doc.text(column, x, y, {
      width: valueWidth - 4,
      align: "right",
      lineBreak: false,
    });
    if (units[index]) {
      doc.fillColor("#3a3a3a");
      const symbolWidth = doc.widthOfString(units[index]);
      const textRight = x + valueWidth - 4;
      doc.text(units[index], textRight - (headerWidth + symbolWidth) / 2, y + style.unitOffset, { lineBreak: false });
    }
  });
  y += headerHeight + 2;

  for (const row of section.rows || []) {
    const rowHeight = measureRow(doc, row, labelWidth, style);
    if (row.kind === "total") {
      doc.save();
      doc.rect(left, y - 2, width, rowHeight).fill("#f3f3f3");
      doc.restore();
    }
    doc.font(row.kind === "line" ? "Outfit" : "Nunito-ExtraBold").fontSize(style.fontSize).fillColor("#1c1c1c");
    doc.text(row.label || "", left + 4, y, { width: labelWidth - 8 });
    if (row.kind !== "heading") {
      columns.forEach((_, index) => {
        const value = (row.values || [])[index];
        const text = reportFigure(value, row.formats?.[index]);
        doc.font(row.kind === "total" ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize);
        doc.fillColor(text === "—" ? "#6b6b6b" : "#1c1c1c");
        doc.text(text, left + labelWidth + valueWidth * index, y, {
          width: valueWidth - 4,
          align: "right",
          lineBreak: false,
        });
      });
    }
    y += rowHeight;
  }
  return y;
}

const KAPPA = 0.5522847498307936;

function traceArc(doc, cx, cy, radius, startAngle, endAngle) {
  const halfPi = Math.PI / 2;
  let delta = endAngle - startAngle;
  if (delta < 0) delta += Math.PI * 2;
  if (delta > Math.PI * 2) delta = Math.PI * 2;
  const segments = Math.max(1, Math.ceil(delta / halfPi - 1e-9));
  const segment = delta / segments;
  const handle = (segment / halfPi) * KAPPA * radius;
  let angle = startAngle;
  let x = cx + Math.cos(angle) * radius;
  let y = cy + Math.sin(angle) * radius;
  doc.lineTo(x, y);
  for (let index = 0; index < segments; index += 1) {
    const controlX = x - Math.sin(angle) * handle;
    const controlY = y + Math.cos(angle) * handle;
    angle += segment;
    const nextX = cx + Math.cos(angle) * radius;
    const nextY = cy + Math.sin(angle) * radius;
    const deltaX = -Math.sin(angle) * handle;
    const deltaY = Math.cos(angle) * handle;
    doc.bezierCurveTo(controlX, controlY, nextX - deltaX, nextY - deltaY, nextX, nextY);
    x = nextX;
    y = nextY;
  }
}

function fillWedge(doc, cx, cy, radius, startAngle, endAngle, colour) {
  doc.save();
  doc.fillColor(colour);
  doc.moveTo(cx, cy);
  traceArc(doc, cx, cy, radius, startAngle, endAngle);
  doc.closePath();
  doc.fill();
  doc.restore();
}

function donutColour(slices, index) {
  const rank = slices
    .map((slice, sliceIndex) => ({ sliceIndex, amount: Math.abs(Number(slice.value) || 0) }))
    .sort((a, b) => b.amount - a.amount || a.sliceIndex - b.sliceIndex)
    .findIndex((item) => item.sliceIndex === index);
  return DONUT_COLOURS[(DONUT_COLOURS.length - 1 - rank + DONUT_COLOURS.length) % DONUT_COLOURS.length];
}

function drawDonut(doc, slices, cx, cy, radius) {
  const amounts = slices.map((slice) => Math.abs(Number(slice.value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (!total) return;
  let angle = -Math.PI / 2;
  slices.forEach((slice, index) => {
    const portion = Math.abs(Number(slice.value) || 0) / total;
    if (!portion) return;
    const end = angle + portion * Math.PI * 2;
    fillWedge(doc, cx, cy, radius, angle, end, donutColour(slices, index));
    angle = end;
  });
  doc.save();
  doc.circle(cx, cy, radius * 0.58).fill("#ffffff");
  doc.restore();
}

function isOtherLabel(label) {
  return /^other$/i.test(String(label || "").trim());
}

function drawContacts(doc, section, startY, left, width, style) {
  const layout = prepareContact(doc, section, width, style);
  const { frame, rows, slices } = layout;
  const chartLeft = left + frame.tableWidth + frame.gap;
  let y = startY;
  doc.save();
  doc.rect(left, y - 3, frame.tableWidth, style.headerBand).fill("#f3f3f3");
  doc.restore();
  doc.font("Outfit-SemiBold").fontSize(style.headerFont).fillColor("#5c5c5c");
  doc.text("Contact", left + 4, y, { width: frame.contactWidth - 8, lineBreak: false });
  const amountHeader = section.amountHeader || "Amount";
  doc.font("Outfit-SemiBold").fontSize(style.headerFont);
  const headerWidth = doc.widthOfString(amountHeader);
  doc.text(amountHeader, left + frame.contactWidth, y, {
    width: frame.amountWidth - 4,
    align: "right",
    lineBreak: false,
  });
  doc.fillColor("#3a3a3a");
  const symbol = section.currency || "£";
  const symbolWidth = doc.widthOfString(symbol);
  const textRight = left + frame.contactWidth + frame.amountWidth - 4;
  doc.text(symbol, textRight - (headerWidth + symbolWidth) / 2, y + style.unitOffset, { lineBreak: false });
  y += style.headerBand + 2;

  rows.forEach((row, index) => {
    const rowHeight = layout.heights[index];
    if (row.kind === "total") {
      doc.save();
      doc.rect(left, y - 2, frame.tableWidth, rowHeight).fill("#f3f3f3");
      doc.restore();
    }
    doc.fillColor("#1c1c1c").font(row.kind === "total" ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize);
    doc.text(row.label || "", left + 4, y, { width: frame.contactWidth - 8 });
    const text = reportFigure(row.value, "money");
    doc.fillColor("#1c1c1c").font(row.kind === "total" ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize);
    doc.text(text, left + frame.contactWidth, y, {
      width: frame.amountWidth - 4,
      align: "right",
      lineBreak: false,
    });
    y += rowHeight;
  });

  const cx = chartLeft + frame.chartWidth / 2;
  const cy = startY + layout.radius;
  drawDonut(doc, slices, cx, cy, layout.radius);
  let legendY = startY + layout.legendStart;
  slices.forEach((slice, index) => {
    const colour = donutColour(slices, index);
    doc.save();
    doc.roundedRect(chartLeft, legendY + 1, 7, 7, 2).fill(colour);
    doc.restore();
    doc.fillColor(colour).font("Outfit").fontSize(style.fontSize);
    doc.text(slice.label || "", chartLeft + 12, legendY, { width: layout.legendWidth });
    legendY += layout.legend[index];
  });
  return Math.max(y, legendY);
}
