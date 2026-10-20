import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { ecommerceInsight, ecommerceSeries, insightMonthName } from "../../client/src/reportMoney.js";
import db, { nowIso } from "./db.js";
import { arrangeReportSections } from "./templateSections.js";

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
  if (format === "percent" || format === "percent2") {
    const digits = format === "percent2" ? 2 : 0;
    const pct = roundHalfAway(number * 100, digits);
    const text = `${grouped(Math.abs(pct), digits)}%`;
    return pct < 0 ? `(${text})` : text;
  }
  if (format === "number" || format === "number2") {
    const digits = format === "number2" ? 2 : 0;
    const rounded = roundHalfAway(number, digits);
    const text = grouped(Math.abs(rounded), digits);
    return rounded < 0 ? `(${text})` : text;
  }
  const digits = format === "money2" ? 2 : 0;
  const rounded = roundHalfAway(number, digits);
  const text = grouped(Math.abs(rounded), digits);
  return rounded < 0 ? `(${text})` : text;
}

const DEMO_DONUT_COLOURS = [
  "#2a1548",
  "#31135f",
  "#3c1778",
  "#4c1d95",
  "#5b21b6",
  "#6d28d9",
  "#7c3aed",
  "#8b5cf6",
  "#9674f8",
  "#a78bfa",
  "#b09afc",
  "#c4b5fd",
];

const CLASSIC_DONUT_COLOURS = [
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

function savedTemplateOrder(userId) {
  const user = db.prepare("SELECT template_id FROM users WHERE id = ?").get(userId);
  if (!user?.template_id) return null;
  const template = db.prepare(
    "SELECT sections_json, layout_saved FROM client_templates WHERE id = ?",
  ).get(user.template_id);
  if (!template || Number(template.layout_saved) !== 1) return null;
  try {
    const parsed = JSON.parse(template.sections_json || "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readManagementReport(userId, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return null;
  const row = db.prepare(
    "SELECT * FROM management_reports WHERE user_id = ? AND month = ?",
  ).get(userId, month);
  if (!row) return null;
  const content = JSON.parse(row.content_json);
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const templateSections = savedTemplateOrder(userId);
  if (!templateSections) return { ...listRow(row), sections, customOrder: false };
  const arranged = arrangeReportSections(sections, templateSections, { customOrder: true });
  return { ...listRow(row), sections: arranged.sections, customOrder: true };
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
      doc.reportTemplate = user.report_template === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech";
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

function cashFlowFollowsBalance(sections) {
  const items = [...(sections || [])];
  const cashIndex = items.findIndex((section) => /cash flow/i.test(String(section.title || "")));
  if (cashIndex < 0) return items;
  const [cash] = items.splice(cashIndex, 1);
  const balanceIndex = items.findIndex((section) => /balance sheet/i.test(String(section.title || "")));
  items.splice(balanceIndex < 0 ? cashIndex : balanceIndex + 1, 0, cash);
  return items;
}

function ownsPage(section) {
  const title = String(section.title || "").toLowerCase();
  return title.includes("profit and loss") || title.includes("balance sheet") || title.includes("cash flow") || section.presentation === "ecommerce";
}

function sectionNote(section) {
  const note = String(section.note || "").split(" · ").filter((part) => !/grouped into other/i.test(part)).join(" · ");
  const subtitle = String(section.subtitle || "").trim();
  return [subtitle, note].filter(Boolean).join(" · ");
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
  return /year to date/i.test(title) || /[A-Za-z]+\s*[–—-]\s*[A-Za-z]+\s+\d{4}/.test(title);
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

function contactContent(section, doc) {
  const rows = section.rows || [];
  const total = [...rows].reverse().find((row) => row.kind === "total");
  const lines = rows.filter((row) => row.kind !== "total");
  if (doc?.reportTemplate !== "purple-hat-demo") {
    const shown = lines.filter((row) => !isOtherLabel(row.label));
    return {
      rows: total ? [...shown, total] : shown,
      slices: (section.slices || []).filter((slice) => !isOtherLabel(slice.label)),
    };
  }
  const other = lines.find((row) => isOtherLabel(row.label));
  const named = lines.filter((row) => !isOtherLabel(row.label)).slice(0, 5);
  const shown = other ? [...named, other] : named;
  return {
    rows: total ? [...shown, total] : shown,
    slices: shown.map((row) => ({ label: row.label, value: row.value })),
  };
}

function prepareContact(doc, section, width, style) {
  const frame = contactFrame(width);
  const { rows, slices } = contactContent(section, doc);
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
  doc.font(row.kind === "heading" || emphasizedRow(row) ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize);
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

function demoContactMetrics() {
  return { fontSize: 9, rowHeight: 18, totalHeight: 22 };
}

function measureDemoContacts(section, doc) {
  const { rows } = contactContent(section, doc);
  const { rowHeight, totalHeight } = demoContactMetrics();
  const lines = rows.filter((row) => row.kind !== "total").length;
  return lines * rowHeight + (rows.some((row) => row.kind === "total") ? totalHeight : 0);
}

function measureContactsBody(doc, section, width, style) {
  if (doc?.reportTemplate === "purple-hat-demo") return measureDemoContacts(section, doc);
  const layout = prepareContact(doc, section, width, style);
  const legendBottom = layout.legendStart + layout.legend.reduce((sum, value) => sum + value, 0);
  return Math.max(layout.tableHeight, legendBottom);
}

function ecommerceColumns(section) {
  const wanted = [/ad spend/i, /sessions/i, /orders/i, /revenue/i, /conversion/i, /^roas$/i, /^aov$/i];
  return wanted
    .map((pattern) => (section.columns || []).findIndex((label) => pattern.test(String(label || ""))))
    .filter((index) => index >= 0);
}

function measureEcommerceBody(doc, section, width, style) {
  const rows = section.rows || [];
  const notes = section.notes || [];
  let height = 78;
  height += (rows.length + 1) * (style.minRow + 2);
  if (notes.length) {
    doc.font("Outfit").fontSize(8);
    height += 10 + notes.reduce((sum, note) => sum + doc.heightOfString(note, { width }) + 2, 0);
  }
  return height;
}

function measureSection(doc, section, width, style) {
  const body = section.presentation === "contacts"
    ? measureContactsBody(doc, section, width, style)
    : section.presentation === "ecommerce"
      ? measureEcommerceBody(doc, section, width, style)
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
  const demoContact = doc.reportTemplate === "purple-hat-demo" && section.presentation === "contacts";
  doc.font("Nunito-ExtraBold").fontSize(style.titleSize).fillColor(demoContact ? "#2a1548" : "#1c1c1c");
  doc.text(displayTitle(section), left, y, { width });
  y = doc.y + 6;
  const note = sectionNote(section);
  if (note) {
    doc.font("Outfit").fontSize(style.noteSize).fillColor("#6b6b6b");
    doc.text(note, left, y, { width });
    y = doc.y + 8;
  }
  if (section.presentation === "contacts") return drawContacts(doc, section, y, left, width, style);
  if (section.presentation === "ecommerce") return drawEcommerce(doc, section, y, left, width, style);
  return drawTable(doc, section, y, left, width, style);
}

function bannerHeight(continued) {
  return (continued ? 58 : 108) + 16;
}

function groupHeight(doc, sections, width, style, gapSize) {
  return sections.reduce((sum, section, index) => sum + (index ? gapSize : 0) + measureSection(doc, section, width, style), 0);
}

function groupedContact(section, demo) {
  return demo ? section.presentation === "contacts" : isFollowingContact(section);
}

function drawReport(doc, report, businessName) {
  const left = 40;
  const width = doc.page.width - 80;
  let y = drawBanner(doc, report, businessName, false);
  let contentStart = y;
  const demo = doc.reportTemplate === "purple-hat-demo";
  const ordered = report.customOrder ? (report.sections || []) : cashFlowFollowsBalance(report.sections);
  const sections = ordered.filter((section) => (
    !section?.hidden && (demo || (section.presentation !== "aging" && section.presentation !== "ecommerce"))
  ));
  const laterContacts = sections.filter((section) => groupedContact(section, demo));
  const opening = sections.filter((section) => !groupedContact(section, demo) && !ownsPage(section) && section.presentation !== "aging");
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

  sections.forEach((section, index) => {
    const following = groupedContact(section, demo);
    const aging = section.presentation === "aging";
    if (ownsPage(section) && y > contentStart + 4) freshPage();
    if (aging && sections[index - 1]?.presentation !== "aging" && y > contentStart + 4) freshPage();
    if (following && !contactGroupOpen) {
      freshPage();
      contactGroupOpen = true;
    }
    if (!following) contactGroupOpen = false;
    const style = following
      ? laterStyle
      : ownsPage(section) || aging
        ? styleFor(doc, section, width, y)
        : openingStyle;
    if (section.presentation === "ecommerce") {
      const points = ecommerceSeries([section]);
      if (points?.length) {
        drawEcommerceOverview(doc, points, y, left, width);
        freshPage();
      }
    }
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
    if (emphasizedRow(row)) {
      doc.save();
      doc.rect(left, y - 2, width, rowHeight).fill("#f3f3f3");
      doc.restore();
    }
    const indent = (row.indent || 0) * 14;
    doc.font(row.kind === "heading" || emphasizedRow(row) ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize).fillColor("#1c1c1c");
    doc.text(row.label || "", left + 4 + indent, y, { width: Math.max(10, labelWidth - 8 - indent) });
    if (row.kind !== "heading") {
      columns.forEach((_, index) => {
        const value = (row.values || [])[index];
        const text = reportFigure(value, row.formats?.[index]);
        doc.font(emphasizedRow(row) ? "Nunito-ExtraBold" : "Outfit").fontSize(style.fontSize);
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

const OVERVIEW_PURPLE = "#6d28d9";
const OVERVIEW_GREEN = "#059669";
const OVERVIEW_INK = "#2a1548";
const OVERVIEW_MUTE = "#5c5470";
const OVERVIEW_ROSE = "#be123c";
const OVERVIEW_EMERALD = "#047857";
const OVERVIEW_WASH = "#f6f3ff";

function overviewChange(current, prior) {
  if (typeof current !== "number" || typeof prior !== "number" || !Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function overviewChangeText(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const text = `${Math.abs(pct).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (pct >= 0.05) return `+${text}`;
  if (pct <= -0.05) return `−${text}`;
  return "0.0%";
}

function overviewTone(value, lowerIsBetter) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.0005) return OVERVIEW_MUTE;
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? OVERVIEW_EMERALD : OVERVIEW_ROSE;
}

function overviewUsd(value, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function overviewCompactUsd(value) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
}

function overviewDomain(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return { min: 0, max: 1 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.16;
  return { min: min - pad, max: max + pad };
}

function overviewTicks(min, max, count) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => max - step * index);
}

function overviewShortMonth(label) {
  const name = insightMonthName(label);
  return name ? name.slice(0, 3) : String(label || "");
}

function drawOverviewArrow(doc, x, y, up, color) {
  doc.save();
  doc.fillColor(color);
  if (up) doc.moveTo(x, y - 3.5).lineTo(x - 3.2, y + 2.2).lineTo(x + 3.2, y + 2.2);
  else doc.moveTo(x, y + 3.5).lineTo(x - 3.2, y - 2.2).lineTo(x + 3.2, y - 2.2);
  doc.closePath().fill();
  doc.restore();
}

function drawChangeLine(doc, x, y, value, priorLabel, lowerIsBetter) {
  if (value === null) {
    doc.font("Outfit").fontSize(8).fillColor(OVERVIEW_MUTE);
    doc.text("No prior month", x, y, { lineBreak: false });
    return;
  }
  const color = overviewTone(value, lowerIsBetter);
  let textX = x;
  if (value > 0.0005 || value < -0.0005) {
    drawOverviewArrow(doc, x + 3, y + 5, value > 0, color);
    textX = x + 10;
  }
  doc.font("Outfit-SemiBold").fontSize(8).fillColor(color);
  doc.text(`${overviewChangeText(value)} vs ${priorLabel}`, textX, y, { lineBreak: false });
}

function drawOverviewPanel(doc, x, y, panelWidth, panelHeight) {
  doc.save();
  doc.roundedRect(x, y, panelWidth, panelHeight, 8).lineWidth(0.8).strokeColor("#efe9ff").stroke();
  doc.restore();
}

function drawLegendDot(doc, x, y, color, label) {
  doc.circle(x + 4, y + 4, 3.5).fill(color);
  doc.font("Outfit-SemiBold").fontSize(8).fillColor(OVERVIEW_MUTE);
  doc.text(label, x + 12, y, { lineBreak: false });
  return 12 + doc.widthOfString(label);
}

function drawRoasChart(doc, points, x, y, chartWidth, chartHeight) {
  const leftAxis = 26;
  const rightAxis = 30;
  const bottom = 16;
  const plotX = x + leftAxis;
  const plotY = y;
  const plotW = chartWidth - leftAxis - rightAxis;
  const plotH = chartHeight - bottom;
  const roasDomain = overviewDomain(points.map((point) => point.roas));
  const conversionDomain = overviewDomain(points.map((point) => (typeof point.conversion === "number" ? point.conversion * 100 : null)));
  const roasTicks = overviewTicks(roasDomain.min, roasDomain.max, 3);
  const conversionTicks = overviewTicks(conversionDomain.min, conversionDomain.max, 3);
  const mapX = (index) => {
    if (points.length <= 1) return plotX + plotW / 2;
    const pad = plotW * 0.04;
    return plotX + pad + (index / (points.length - 1)) * (plotW - pad * 2);
  };
  const mapY = (value, min, max) => {
    if (max === min) return plotY + plotH / 2;
    const pad = plotH * 0.1;
    return plotY + pad + ((max - value) / (max - min)) * (plotH - pad * 2);
  };
  doc.save();
  doc.strokeColor("#ede9fe").lineWidth(0.6);
  roasTicks.forEach((tick) => {
    const lineY = mapY(tick, roasDomain.min, roasDomain.max);
    doc.moveTo(plotX, lineY).lineTo(plotX + plotW, lineY).stroke();
  });
  doc.restore();
  const strokeLine = (key, min, max, scale, color) => {
    const coords = points.flatMap((point, index) => (
      typeof point[key] === "number" ? [[mapX(index), mapY(point[key] * scale, min, max)]] : []
    ));
    if (coords.length < 2) return;
    doc.save();
    doc.strokeColor(color).lineWidth(1.8).lineJoin("round").lineCap("round");
    doc.moveTo(coords[0][0], coords[0][1]);
    coords.slice(1).forEach(([px, py]) => doc.lineTo(px, py));
    doc.stroke();
    doc.restore();
  };
  strokeLine("conversion", conversionDomain.min, conversionDomain.max, 100, OVERVIEW_GREEN);
  strokeLine("roas", roasDomain.min, roasDomain.max, 1, OVERVIEW_PURPLE);
  points.forEach((point, index) => {
    const px = mapX(index);
    if (typeof point.conversion === "number") {
      const py = mapY(point.conversion * 100, conversionDomain.min, conversionDomain.max);
      doc.circle(px, py, 3.2).fill("#ffffff");
      doc.circle(px, py, 2.1).fill(OVERVIEW_GREEN);
    }
    if (typeof point.roas === "number") {
      const py = mapY(point.roas, roasDomain.min, roasDomain.max);
      doc.circle(px, py, 3.2).fill("#ffffff");
      doc.circle(px, py, 2.1).fill(OVERVIEW_PURPLE);
    }
  });
  doc.font("Outfit").fontSize(6.5).fillColor(OVERVIEW_MUTE);
  roasTicks.forEach((tick) => {
    doc.text(tick.toFixed(1), x, mapY(tick, roasDomain.min, roasDomain.max) - 3, { width: leftAxis - 3, align: "right", lineBreak: false });
  });
  conversionTicks.forEach((tick) => {
    doc.text(`${tick.toFixed(1)}%`, plotX + plotW + 3, mapY(tick, conversionDomain.min, conversionDomain.max) - 3, { width: rightAxis - 4, lineBreak: false });
  });
  points.forEach((point, index) => {
    const label = overviewShortMonth(point.month);
    doc.font("Outfit").fontSize(6).fillColor(OVERVIEW_MUTE);
    const labelWidth = doc.widthOfString(label);
    doc.text(label, mapX(index) - labelWidth / 2, plotY + plotH + 4, { lineBreak: false, width: labelWidth + 1 });
  });
}

function drawSpendChart(doc, points, x, y, chartWidth, chartHeight) {
  const leftAxis = 28;
  const bottom = 16;
  const plotX = x + leftAxis;
  const plotY = y;
  const plotW = chartWidth - leftAxis;
  const plotH = chartHeight - bottom;
  const max = Math.max(1, ...points.flatMap((point) => [point.spend || 0, point.revenue || 0]));
  const slot = plotW / points.length;
  doc.save();
  doc.strokeColor("#ede9fe").lineWidth(0.8);
  doc.moveTo(plotX, plotY + plotH).lineTo(plotX + plotW, plotY + plotH).stroke();
  doc.restore();
  points.forEach((point, index) => {
    const barW = Math.min(7, slot * 0.28);
    const baseX = plotX + slot * index + (slot - barW * 2 - 2) / 2;
    const spendH = ((point.spend || 0) / max) * (plotH - 4);
    const revenueH = ((point.revenue || 0) / max) * (plotH - 4);
    doc.save();
    doc.rect(plotX, plotY, plotW, plotH).clip();
    if (spendH > 0) doc.roundedRect(baseX, plotY + plotH - spendH, barW, spendH + 3, 1.5).fill(OVERVIEW_PURPLE);
    if (revenueH > 0) doc.roundedRect(baseX + barW + 2, plotY + plotH - revenueH, barW, revenueH + 3, 1.5).fill(OVERVIEW_GREEN);
    doc.restore();
    const label = overviewShortMonth(point.month);
    doc.font("Outfit").fontSize(6).fillColor(OVERVIEW_MUTE);
    const labelWidth = doc.widthOfString(label);
    doc.text(label, plotX + slot * index + (slot - labelWidth) / 2, plotY + plotH + 4, { lineBreak: false, width: labelWidth + 1 });
  });
  doc.font("Outfit").fontSize(6.5).fillColor(OVERVIEW_MUTE);
  [max, max / 2, 0].forEach((tick, index) => {
    const lineY = plotY + (plotH - 4) * (index / 2);
    doc.text(overviewCompactUsd(tick), x, lineY - 3, { width: leftAxis - 3, align: "right", lineBreak: false });
  });
}

function drawEcommerceOverview(doc, points, y, left, width) {
  const cursorX = doc.x;
  const cursorY = doc.y;
  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : null;
  const priorLabel = prior ? overviewShortMonth(prior.month) : "";
  const roasChange = prior ? overviewChange(latest.roas, prior.roas) : null;
  const cpaChange = prior ? overviewChange(latest.cpa, prior.cpa) : null;
  const revenueChange = prior ? overviewChange(latest.revenue, prior.revenue) : null;
  const latestName = insightMonthName(latest.month) || "Latest";
  doc.font("Nunito-ExtraBold").fontSize(16).fillColor(OVERVIEW_INK);
  doc.text("E-commerce Performance Overview", left, y, { width, lineBreak: false });
  doc.font("Outfit").fontSize(9).fillColor(OVERVIEW_MUTE);
  doc.text("Trend-focused insights", left, y + 22, { width, lineBreak: false });

  const rowY = y + 46;
  const gap = 10;
  const leftWidth = (width - gap) * 0.62;
  const rightWidth = width - gap - leftWidth;
  const rightX = left + leftWidth + gap;
  doc.font("Outfit-SemiBold").fontSize(8).fillColor(OVERVIEW_PURPLE);
  doc.text("CURRENT MONTH HIGHLIGHTS", left, rowY, { width: leftWidth, lineBreak: false });
  doc.font("Outfit").fontSize(9).fillColor(OVERVIEW_MUTE);
  doc.text(latest.month || "", left, rowY + 14, { width: leftWidth, lineBreak: false });
  const boxY = rowY + 32;
  const boxW = (leftWidth - 8) / 2;
  const boxH = 78;
  [
    ["ROAS", reportFigure(latest.roas, "number2"), roasChange, false],
    ["CPA", overviewUsd(latest.cpa, 2), cpaChange, true],
  ].forEach((item, index) => {
    const boxX = left + index * (boxW + 8);
    doc.save();
    doc.roundedRect(boxX, boxY, boxW, boxH, 8).fill(OVERVIEW_WASH);
    doc.restore();
    doc.font("Outfit-SemiBold").fontSize(8).fillColor(OVERVIEW_PURPLE);
    doc.text(item[0], boxX + 12, boxY + 10, { lineBreak: false });
    doc.font("Nunito-ExtraBold").fontSize(22).fillColor(OVERVIEW_INK);
    doc.text(item[1], boxX + 12, boxY + 26, { lineBreak: false });
    drawChangeLine(doc, boxX + 12, boxY + 54, item[2], priorLabel, item[3]);
  });
  doc.save();
  doc.roundedRect(rightX, rowY, rightWidth, boxY + boxH - rowY, 8).lineWidth(0.8).strokeColor("#efe9ff").stroke();
  doc.restore();
  doc.font("Outfit-SemiBold").fontSize(8).fillColor(OVERVIEW_PURPLE);
  doc.text("GROWTH VS PRIOR PERIOD", rightX + 12, rowY + 12, { width: rightWidth - 24, lineBreak: false });
  [
    ["ROAS", roasChange, false],
    ["REVENUE", revenueChange, false],
  ].forEach((item, index) => {
    const itemX = rightX + 12 + index * ((rightWidth - 24) / 2);
    doc.font("Outfit-SemiBold").fontSize(7).fillColor(OVERVIEW_MUTE);
    doc.text(item[0], itemX, rowY + 32, { lineBreak: false });
    doc.font("Nunito-ExtraBold").fontSize(16).fillColor(overviewTone(item[1], item[2]));
    doc.text(overviewChangeText(item[1]), itemX, rowY + 46, { lineBreak: false });
    doc.font("Outfit").fontSize(8).fillColor(OVERVIEW_MUTE);
    doc.text(priorLabel ? `vs ${priorLabel}` : "No prior month", itemX, rowY + 68, { lineBreak: false });
  });

  const chartY = boxY + boxH + 16;
  const chartW = (width - gap) / 2;
  const chartH = 168;
  drawOverviewPanel(doc, left, chartY, chartW, chartH + 36);
  drawOverviewPanel(doc, left + chartW + gap, chartY, chartW, chartH + 36);
  doc.font("Nunito-ExtraBold").fontSize(11).fillColor(OVERVIEW_INK);
  doc.text("ROAS & Conversion Rate Trend", left + 12, chartY + 10, { width: chartW - 24, lineBreak: false });
  doc.text("Ad Spend vs Revenue", left + chartW + gap + 12, chartY + 10, { width: chartW - 24, lineBreak: false });
  let legendX = left + 12;
  legendX += drawLegendDot(doc, legendX, chartY + 30, OVERVIEW_PURPLE, "ROAS") + 12;
  drawLegendDot(doc, legendX, chartY + 30, OVERVIEW_GREEN, "Conversion rate");
  legendX = left + chartW + gap + 12;
  legendX += drawLegendDot(doc, legendX, chartY + 30, OVERVIEW_PURPLE, "Ad spend") + 12;
  drawLegendDot(doc, legendX, chartY + 30, OVERVIEW_GREEN, "Revenue");
  drawRoasChart(doc, points, left + 10, chartY + 50, chartW - 20, chartH - 20);
  drawSpendChart(doc, points, left + chartW + gap + 10, chartY + 50, chartW - 20, chartH - 20);

  const insightY = chartY + chartH + 48;
  const insightH = 58;
  doc.save();
  doc.roundedRect(left, insightY, width, insightH, 8).fill(OVERVIEW_WASH);
  doc.restore();
  const badgeW = 92;
  doc.save();
  doc.roundedRect(left + width - badgeW - 10, insightY + 8, badgeW, insightH - 16, 8).fill("#ffffff");
  doc.restore();
  doc.font("Outfit").fontSize(8.5).fillColor(OVERVIEW_INK);
  doc.text(ecommerceInsight(points), left + 12, insightY + 12, { width: width - badgeW - 34 });
  doc.font("Outfit-SemiBold").fontSize(7).fillColor(OVERVIEW_PURPLE);
  doc.text(`${latestName.toUpperCase()} ROAS`, left + width - badgeW - 2, insightY + 16, { width: badgeW - 8, align: "center", lineBreak: false });
  doc.font("Nunito-ExtraBold").fontSize(16).fillColor(OVERVIEW_INK);
  doc.text(reportFigure(latest.roas, "number2"), left + width - badgeW - 2, insightY + 30, { width: badgeW - 8, align: "center", lineBreak: false });
  doc.x = cursorX;
  doc.y = cursorY;
}

function drawEcommerce(doc, section, startY, left, width, style) {
  const rows = section.rows || [];
  const latest = rows[rows.length - 1];
  const highlights = [/ad spend/i, /sessions/i, /conversion/i, /^roas$/i, /revenue/i, /^cpa$/i, /^aov$/i]
    .map((pattern) => {
      const index = (section.columns || []).findIndex((label) => pattern.test(String(label || "")));
      if (index < 0 || !latest) return null;
      return {
        label: section.columns[index],
        text: reportFigure(latest.values?.[index], latest.formats?.[index]),
      };
    })
    .filter(Boolean);
  let y = startY;
  const boxWidth = (width - 16) / 3;
  highlights.forEach((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = left + column * (boxWidth + 8);
    const top = y + row * 36;
    doc.save();
    doc.roundedRect(x, top, boxWidth, 30, 6).fill("#f3f3f3");
    doc.restore();
    doc.font("Outfit-SemiBold").fontSize(7).fillColor("#5c5c5c");
    doc.text(item.label, x + 8, top + 4, { width: boxWidth - 16, lineBreak: false });
    doc.font("Nunito-ExtraBold").fontSize(11).fillColor("#1c1c1c");
    doc.text(item.text, x + 8, top + 15, { width: boxWidth - 16, lineBreak: false });
  });
  y += Math.ceil(highlights.length / 3) * 36 + 8;
  if (latest?.month) {
    doc.font("Outfit").fontSize(8).fillColor("#6b6b6b");
    doc.text(latest.month, left, y, { width, lineBreak: false });
    y += 16;
  }
  const indexes = ecommerceColumns(section);
  const labels = ["Month", ...indexes.map((index) => section.columns[index])];
  const colWidth = width / labels.length;
  doc.font("Outfit-SemiBold").fontSize(style.headerFont).fillColor("#5c5c5c");
  labels.forEach((label, index) => {
    doc.text(label, left + colWidth * index, y, {
      width: colWidth - 4,
      align: index === 0 ? "left" : "right",
      lineBreak: false,
    });
  });
  y += style.minRow + 4;
  rows.forEach((row) => {
    doc.font("Outfit").fontSize(style.fontSize).fillColor("#1c1c1c");
    doc.text(row.month || "", left, y, { width: colWidth - 4, lineBreak: false });
    indexes.forEach((valueIndex, index) => {
      doc.text(reportFigure(row.values?.[valueIndex], row.formats?.[valueIndex]), left + colWidth * (index + 1), y, {
        width: colWidth - 4,
        align: "right",
        lineBreak: false,
      });
    });
    y += style.minRow;
  });
  const notes = section.notes || [];
  if (notes.length) {
    y += 8;
    doc.font("Outfit").fontSize(8).fillColor("#6b6b6b");
    notes.forEach((note) => {
      doc.text(note, left, y, { width });
      y = doc.y + 2;
    });
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

function demoDonutColour(count, index) {
  const last = DEMO_DONUT_COLOURS.length - 1;
  if (count <= 1) return DEMO_DONUT_COLOURS[0];
  const slot = Math.round((Math.max(0, index) / (count - 1)) * last);
  return DEMO_DONUT_COLOURS[Math.min(last, slot)];
}

function donutInk(colour) {
  const hex = String(colour || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luma > 0.55 ? "#2a1548" : "#ffffff";
}

function donutColour(slices, index, doc) {
  if (doc?.reportTemplate === "purple-hat-demo") return demoDonutColour(slices.length, index);
  const rank = slices
    .map((slice, sliceIndex) => ({ sliceIndex, amount: Math.abs(Number(slice.value) || 0) }))
    .sort((a, b) => b.amount - a.amount || a.sliceIndex - b.sliceIndex)
    .findIndex((item) => item.sliceIndex === index);
  const safeRank = Math.max(0, rank);
  return CLASSIC_DONUT_COLOURS[(CLASSIC_DONUT_COLOURS.length - 1 - safeRank + CLASSIC_DONUT_COLOURS.length) % CLASSIC_DONUT_COLOURS.length];
}

function drawDonut(doc, slices, cx, cy, radius) {
  const amounts = slices.map((slice) => Math.abs(Number(slice.value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (!total) return;
  let angle = -Math.PI / 2;
  const labels = [];
  slices.forEach((slice, index) => {
    const portion = Math.abs(Number(slice.value) || 0) / total;
    if (!portion) return;
    const start = angle;
    const end = angle + portion * Math.PI * 2;
    const colour = donutColour(slices, index, doc);
    fillWedge(doc, cx, cy, radius, start, end, colour);
    const percent = Math.round(portion * 100);
    if (doc?.reportTemplate === "purple-hat-demo" && percent > 0 && portion >= 0.04) {
      const mid = portion > 0.98 ? -Math.PI / 2 : (start + end) / 2;
      const labelRadius = portion > 0.98 ? 0 : radius * 0.79;
      labels.push({
        text: `${percent}%`,
        x: cx + Math.cos(mid) * labelRadius,
        y: cy + Math.sin(mid) * labelRadius,
        colour,
      });
    }
    angle = end;
  });
  doc.save();
  doc.circle(cx, cy, radius * 0.58).fill("#ffffff");
  doc.restore();
  if (!labels.length) return;
  const cursorX = doc.x;
  const cursorY = doc.y;
  const fontSize = Math.max(7, Math.min(11, radius * 0.13));
  labels.forEach((label) => {
    doc.font("Outfit-SemiBold").fontSize(fontSize).fillColor(donutInk(label.colour));
    const textWidth = doc.widthOfString(label.text);
    const textHeight = doc.currentLineHeight();
    doc.text(label.text, label.x - textWidth / 2, label.y - textHeight / 2, {
      lineBreak: false,
      width: textWidth + 1,
    });
  });
  doc.x = cursorX;
  doc.y = cursorY;
}

function drawDemoDonut(doc, slices, cx, cy, radius) {
  const amounts = slices.map((slice) => Math.abs(Number(slice.value) || 0));
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (!total) return;
  const innerRatio = 56 / 90;
  let angle = -Math.PI / 2;
  const labels = [];
  slices.forEach((slice, index) => {
    const portion = Math.abs(Number(slice.value) || 0) / total;
    if (!portion) return;
    const start = angle;
    const end = angle + portion * Math.PI * 2;
    const colour = demoDonutColour(slices.length, index);
    doc.save();
    doc.fillColor(colour).strokeColor("#ffffff").lineWidth(Math.max(1.8, radius * 0.045)).lineJoin("round");
    doc.moveTo(cx, cy);
    traceArc(doc, cx, cy, radius, start, end);
    doc.closePath();
    doc.fillAndStroke();
    doc.restore();
    const percent = Math.round(portion * 100);
    if (percent > 0 && portion >= 0.04) {
      const mid = portion > 0.98 ? -Math.PI / 2 : (start + end) / 2;
      const labelRadius = portion > 0.98 ? 0 : radius * ((1 + innerRatio) / 2);
      labels.push({
        text: `${percent}%`,
        x: cx + Math.cos(mid) * labelRadius,
        y: cy + Math.sin(mid) * labelRadius,
        colour,
      });
    }
    angle = end;
  });
  doc.save();
  doc.circle(cx, cy, radius * innerRatio).fill("#ffffff");
  doc.restore();
  if (!labels.length) return;
  const cursorX = doc.x;
  const cursorY = doc.y;
  const fontSize = Math.max(7, Math.min(11, radius * 0.16));
  labels.forEach((label) => {
    doc.font("Outfit-SemiBold").fontSize(fontSize).fillColor(donutInk(label.colour));
    const textWidth = doc.widthOfString(label.text);
    const textHeight = doc.currentLineHeight();
    doc.text(label.text, label.x - textWidth / 2, label.y - textHeight / 2, {
      lineBreak: false,
      width: textWidth + 1,
    });
  });
  doc.x = cursorX;
  doc.y = cursorY;
}

function drawDemoContacts(doc, section, startY, left, width) {
  const { rows, slices } = contactContent(section, doc);
  const lines = rows.filter((row) => row.kind !== "total");
  const total = rows.find((row) => row.kind === "total");
  const { fontSize, rowHeight, totalHeight } = demoContactMetrics();
  const showChart = section.chart !== false;
  const diameter = showChart ? Math.max(78, lines.length * rowHeight - 2) : 0;
  const gap = showChart ? 18 : 0;
  const listWidth = width - diameter - gap;
  const amountWidth = 72;
  const numberWidth = 14;
  const nameX = left + numberWidth + 16;
  const nameWidth = Math.max(40, listWidth - amountWidth - numberWidth - 20);
  let y = startY;
  lines.forEach((row, index) => {
    const colour = demoDonutColour(lines.length, index);
    const textY = y + (rowHeight - fontSize) / 2 - 1;
    doc.font("Outfit").fontSize(fontSize).fillColor("#5c5470");
    doc.text(String(index + 1), left, textY, { width: numberWidth, lineBreak: false });
    doc.circle(left + numberWidth + 6, y + rowHeight / 2, 3.1).fill(colour);
    doc.font("Outfit").fontSize(fontSize).fillColor("#2a1548");
    doc.text(row.label || "", nameX, textY, { width: nameWidth, lineBreak: false });
    doc.text(reportFigure(row.value, "money"), left + listWidth - amountWidth, textY, {
      width: amountWidth,
      align: "right",
      lineBreak: false,
    });
    doc.save();
    doc.strokeColor("#efe8ff").lineWidth(0.7);
    doc.moveTo(left, y + rowHeight - 0.6).lineTo(left + listWidth, y + rowHeight - 0.6).stroke();
    doc.restore();
    y += rowHeight;
  });
  if (total) {
    const textY = y + (totalHeight - fontSize - 1) / 2;
    doc.font("Nunito-ExtraBold").fontSize(fontSize + 1).fillColor("#2a1548");
    doc.text(total.label || "Total", nameX, textY, { width: nameWidth, lineBreak: false });
    doc.text(reportFigure(total.value, "money"), left + listWidth - amountWidth, textY, {
      width: amountWidth,
      align: "right",
      lineBreak: false,
    });
    y += totalHeight;
  }
  if (showChart) {
    drawDemoDonut(doc, slices, left + listWidth + gap + diameter / 2, startY + (lines.length * rowHeight) / 2, diameter / 2);
  }
  return y;
}

function isOtherLabel(label) {
  return /^other$/i.test(String(label || "").trim());
}

function emphasizedRow(row) {
  if (row?.kind !== "total") return false;
  return !/^(warehouse equipment|retained earnings|member drawings)$/i.test(String(row.label || "").trim());
}

function drawContacts(doc, section, startY, left, width, style) {
  if (doc?.reportTemplate === "purple-hat-demo") return drawDemoContacts(doc, section, startY, left, width);
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

  if (section.chart === false) return y;
  const cx = chartLeft + frame.chartWidth / 2;
  const cy = startY + layout.radius;
  drawDonut(doc, slices, cx, cy, layout.radius);
  let legendY = startY + layout.legendStart;
  slices.forEach((slice, index) => {
    const colour = donutColour(slices, index, doc);
    doc.save();
    doc.roundedRect(chartLeft, legendY + 1, 7, 7, 2).fill(colour);
    doc.restore();
    doc.fillColor(colour).font("Outfit").fontSize(style.fontSize);
    doc.text(slice.label || "", chartLeft + 12, legendY, { width: layout.legendWidth });
    legendY += layout.legend[index];
  });
  return Math.max(y, legendY);
}
