// Template editor sections. This module does not open the database.
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { normalizePresentation } from "./templateBuilder.js";

const FORMAT_KEYS = new Set(["", "money", "money2", "percent", "percent2", "number", "number2"]);
const KINDS = new Set(["heading", "line", "total"]);

const statementRows = (columns) => [
  { kind: "heading", label: "Income", indent: 0, values: columns.map(() => null), formats: columns.map(() => "money") },
  { kind: "line", label: "Sales", indent: 0, values: columns.map(() => null), formats: columns.map(() => "money") },
  { kind: "total", label: "Total", indent: 0, values: columns.map(() => null), formats: columns.map(() => "money") },
];

function contactPart(title, subtitle) {
  return {
    title,
    subtitle,
    presentation: "contacts",
    chart: true,
    amountHeader: "Amount",
    currency: "",
    columns: [],
    rows: [
      { kind: "line", label: "Contact", value: null },
      { kind: "total", label: "Total", value: null },
    ],
  };
}

function tablePart(title, columns, labelHeader = "Account") {
  return {
    title,
    subtitle: "",
    presentation: "table",
    chart: false,
    labelHeader,
    columns: [...columns],
    rows: statementRows(columns),
  };
}

export const SECTION_TYPES = [
  {
    key: "executive-summary",
    label: "Executive summary",
    parts: [tablePart("Executive summary", ["Month", "Year to date"], "")],
  },
  {
    key: "top-expenses",
    label: "Top expenses (month and YTD)",
    parts: [contactPart("Top expenses", "Month"), contactPart("Year to date — Top expenses", "Year to date")],
  },
  {
    key: "top-income",
    label: "Top income (month and YTD)",
    parts: [contactPart("Top income", "Month"), contactPart("Year to date — Top income", "Year to date")],
  },
  {
    key: "profit-and-loss",
    label: "Profit and loss",
    parts: [tablePart("Profit and loss", ["Month", "Year to date"])],
  },
  {
    key: "quarterly-pl",
    label: "Quarterly P&L",
    parts: [tablePart("Profit and loss quarterly", ["Q1", "Q2", "Q3", "Q4"])],
  },
  {
    key: "balance-sheet",
    label: "Balance sheet",
    parts: [tablePart("Balance sheet", ["Month"])],
  },
  {
    key: "cash-flows",
    label: "Statement of cash flows",
    parts: [tablePart("Statement of cash flows", ["Month", "Year to date"])],
  },
  {
    key: "aged-receivables",
    label: "Aged receivables",
    parts: [{
      title: "Aged Receivable Summary",
      subtitle: "",
      presentation: "aging",
      chart: false,
      labelHeader: "Contact",
      columns: ["Current", "1–30", "31–60", "61–90", "Older", "Total"],
      rows: [
        { kind: "line", label: "Contact", indent: 0, values: [null, null, null, null, null, null], formats: ["money", "money", "money", "money", "money", "money"] },
        { kind: "total", label: "Total", indent: 0, values: [null, null, null, null, null, null], formats: ["money", "money", "money", "money", "money", "money"] },
      ],
    }],
  },
  {
    key: "aged-payables",
    label: "Aged payables",
    parts: [{
      title: "Aged Payable Summary",
      subtitle: "",
      presentation: "aging",
      chart: false,
      labelHeader: "Contact",
      columns: ["Current", "1–30", "31–60", "61–90", "Older", "Total"],
      rows: [
        { kind: "line", label: "Contact", indent: 0, values: [null, null, null, null, null, null], formats: ["money", "money", "money", "money", "money", "money"] },
        { kind: "total", label: "Total", indent: 0, values: [null, null, null, null, null, null], formats: ["money", "money", "money", "money", "money", "money"] },
      ],
    }],
  },
  {
    key: "ecommerce",
    label: "E-commerce report",
    parts: [{
      title: "E-commerce report",
      subtitle: "",
      presentation: "ecommerce",
      chart: true,
      columns: ["Spend", "Revenue", "ROAS"],
      notes: [],
      rows: [{
        kind: "line",
        label: "Month",
        month: "Month",
        values: [null, null, null],
        formats: ["money", "money", "number2"],
      }],
    }],
  },
  {
    key: "commentary",
    label: "Commentary/notes",
    parts: [{
      title: "Commentary",
      subtitle: "Notes",
      presentation: "table",
      chart: false,
      labelHeader: "",
      columns: [],
      rows: [{ kind: "line", label: "Add a note", indent: 0, values: [], formats: [] }],
    }],
  },
];

const TYPE_KEYS = new Set(SECTION_TYPES.map((item) => item.key));

export function sectionTypeChoices() {
  return SECTION_TYPES.map((item) => ({ key: item.key, label: item.label }));
}

export function sectionType(key) {
  return SECTION_TYPES.find((item) => item.key === key) || null;
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function slug(value) {
  const text = clean(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text || "section";
}

function newId() {
  return `sec-${crypto.randomBytes(4).toString("hex")}`;
}

function numOrNull(value) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function formatOrEmpty(value) {
  const text = String(value || "");
  return FORMAT_KEYS.has(text) ? text : "";
}

function fitList(list, count, fill) {
  return Array.from({ length: count }, (_, index) => (list?.[index] == null ? fill : list[index]));
}

function sameTitle(left, right) {
  return clean(left, 160).toLowerCase() === clean(right, 160).toLowerCase();
}

function isTotalLabel(label) {
  return /^(total|net|gross)\b/i.test(clean(label, 160));
}

function chartDefault(presentation, value) {
  if (value != null) return Boolean(value);
  return presentation === "contacts" || presentation === "ecommerce";
}

function normalizeRow(row, presentation) {
  const source = row && typeof row === "object" ? row : {};
  const kind = KINDS.has(source.kind) ? source.kind : "line";
  const label = clean(source.label ?? source.month ?? "", 160);
  const indent = Math.max(0, Math.min(8, Math.round(Number(source.indent) || 0)));
  const values = Array.isArray(source.values) ? source.values.slice(0, 12).map(numOrNull) : [];
  const formats = Array.isArray(source.formats) ? source.formats.slice(0, 12).map(formatOrEmpty) : [];
  const next = { kind, label, indent, values, formats };
  if (presentation === "contacts") next.value = numOrNull(source.value ?? source.values?.[0]);
  if (presentation === "ecommerce") next.month = clean(source.month || label, 80);
  return next;
}

function normalizeOne(section, index, used) {
  const source = section && typeof section === "object" && !Array.isArray(section) ? section : {};
  const presentation = normalizePresentation(source.presentation);
  let id = clean(source.id, 40);
  if (!/^sec-[a-z0-9-]+$/i.test(id) || used.has(id)) {
    id = `sec-${index + 1}-${slug(source.title)}`;
    let extra = 2;
    while (used.has(id)) {
      id = `sec-${index + 1}-${slug(source.title)}-${extra}`;
      extra += 1;
    }
  }
  used.add(id);
  const columns = Array.isArray(source.columns)
    ? source.columns.slice(0, 12).map((column) => clean(column, 40)).filter(Boolean)
    : [];
  const rows = (Array.isArray(source.rows) ? source.rows : []).slice(0, 400).map((row) => normalizeRow(row, presentation));
  const next = {
    id,
    title: clean(source.title, 160) || "Section",
    subtitle: clean(source.subtitle, 160),
    presentation,
    chart: chartDefault(presentation, source.chart),
    hidden: Boolean(source.hidden),
    note: clean(source.note, 500),
    labelHeader: clean(source.labelHeader, 40),
    columns,
    units: Array.isArray(source.units) ? source.units.slice(0, 12).map((unit) => clean(unit, 12)) : [],
    rows,
  };
  if (presentation === "contacts") {
    next.amountHeader = clean(source.amountHeader, 40) || "Amount";
    next.currency = clean(source.currency, 8);
    next.slices = rows
      .filter((row) => row.kind === "line")
      .map((row) => ({ label: row.label, value: row.value }));
  }
  if (presentation === "ecommerce") {
    next.notes = Array.isArray(source.notes) ? source.notes.slice(0, 20).map((note) => clean(note, 200)).filter(Boolean) : [];
  }
  return next;
}

export function normalizeEditorSections(sections) {
  if (!Array.isArray(sections)) return { error: "Add sections as a list." };
  if (sections.length > 40) return { error: "A template can have up to 40 sections." };
  const used = new Set();
  return { sections: sections.map((section, index) => normalizeOne(section, index, used)) };
}

function withFreshIds(parts) {
  const used = new Set();
  return parts.map((part, index) => normalizeOne({ ...part, id: newId() }, index, used));
}

export function addSections(sections, typeKey) {
  const type = sectionType(typeKey);
  if (!type) return { error: "Choose a section type." };
  const current = normalizeEditorSections(sections);
  if (current.error) return current;
  if (current.sections.length + type.parts.length > 40) return { error: "A template can have up to 40 sections." };
  return { sections: current.sections.concat(withFreshIds(type.parts)) };
}

export function updateSection(sections, id, patch = {}) {
  const current = normalizeEditorSections(sections);
  if (current.error) return current;
  const index = current.sections.findIndex((section) => section.id === id);
  if (index < 0) return { error: "That section was not found." };
  const section = { ...current.sections[index], rows: current.sections[index].rows.map((row) => ({ ...row })) };
  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    const title = clean(patch.title, 160);
    if (!title) return { error: "Name the section." };
    section.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "subtitle")) section.subtitle = clean(patch.subtitle, 160);
  if (Object.prototype.hasOwnProperty.call(patch, "chart")) section.chart = Boolean(patch.chart);
  if (Object.prototype.hasOwnProperty.call(patch, "hidden")) section.hidden = Boolean(patch.hidden);
  if (Object.prototype.hasOwnProperty.call(patch, "columns")) {
    if (!Array.isArray(patch.columns)) return { error: "Enter the comparison columns." };
    const columns = patch.columns.map((column) => clean(column, 40)).filter(Boolean);
    if (columns.length > 12) return { error: "Use 12 comparison columns or fewer." };
    section.columns = columns;
    section.rows = section.rows.map((row) => ({
      ...row,
      values: fitList(row.values, columns.length, null).map(numOrNull),
      formats: fitList(row.formats, columns.length, "").map(formatOrEmpty),
    }));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rows")) {
    if (!Array.isArray(patch.rows)) return { error: "Enter the rows for this section." };
    if (patch.rows.length > 400) return { error: "Use 400 rows or fewer in a section." };
    section.rows = patch.rows.map((row) => normalizeRow(row, section.presentation));
    if (section.presentation === "contacts") {
      section.slices = section.rows
        .filter((row) => row.kind === "line")
        .map((row) => ({ label: row.label, value: row.value }));
    }
  }
  const next = current.sections.slice();
  next[index] = normalizeOne(section, index, new Set(current.sections.filter((_, item) => item !== index).map((item) => item.id)));
  return { sections: next };
}

export function deleteSection(sections, id) {
  const current = normalizeEditorSections(sections);
  if (current.error) return current;
  if (!current.sections.some((section) => section.id === id)) return { error: "That section was not found." };
  return { sections: current.sections.filter((section) => section.id !== id) };
}

export function reorderSections(sections, ids) {
  const current = normalizeEditorSections(sections);
  if (current.error) return current;
  if (!Array.isArray(ids) || ids.length !== current.sections.length) return { error: "Reorder the whole template." };
  const byId = new Map(current.sections.map((section) => [section.id, section]));
  const next = [];
  for (const id of ids) {
    const section = byId.get(id);
    if (!section || next.includes(section)) return { error: "Reorder the whole template." };
    next.push(section);
  }
  return { sections: next };
}

export function applySectionAction(sections, action = {}) {
  const name = String(action.action || "");
  if (name === "add") return addSections(sections, action.sectionType);
  if (name === "update") return updateSection(sections, action.id, action.patch || {});
  if (name === "delete") return deleteSection(sections, action.id);
  if (name === "reorder") return reorderSections(sections, action.ids);
  return { error: "Choose an action." };
}

export function mapTabName(name) {
  const text = String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text === "ecommerce" || /\be ?commerce\b/.test(text)) return "ecommerce";
  if (text === "ar" || /\breceivable/.test(text)) return "aged-receivables";
  if (text === "ap" || /\bpayable/.test(text)) return "aged-payables";
  if (text === "cashflow" || /cash flow/.test(text)) return "cash-flows";
  if (text === "bs" || /balance sheet/.test(text)) return "balance-sheet";
  if (/quarter/.test(text) && (/profit/.test(text) || /\bp and l\b/.test(text) || text === "pl")) return "quarterly-pl";
  if (/income statement/.test(text) || /profit and loss/.test(text) || text === "p and l" || text === "pl" || text === "p l") {
    return "profit-and-loss";
  }
  if (/executive summary/.test(text)) return "executive-summary";
  if (/top expense/.test(text)) return "top-expenses";
  if (/top income/.test(text)) return "top-income";
  if (/commentary/.test(text) || text === "notes") return "commentary";
  return "";
}

function headerText(cell) {
  if (!cell) return "";
  if (typeof cell.v === "string") return cell.v.replace(/\s+/g, " ").trim();
  if (cell.w != null && String(cell.w).trim()) return String(cell.w).trim();
  if (cell.v == null) return "";
  return String(cell.v).trim();
}

function labelFromCell(cell) {
  if (!cell) return { label: "", indent: 0 };
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
    return { label: headerText(cell), indent: 0 };
  }
  const raw = typeof cell.v === "string" ? cell.v : (cell.v == null ? "" : String(cell.v));
  const spaces = raw.match(/^[ ]*/)[0].length;
  return { label: raw.replace(/\s+/g, " ").trim(), indent: Math.floor(spaces / 2) };
}

function cellNumber(cell) {
  if (!cell || cell.t === "d") return null;
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) return cell.v;
  return null;
}

function numberFormat(fmt) {
  const text = String(fmt || "");
  if (!text || text === "General") return "";
  if (text.includes("%")) return /0\.0+%/.test(text) ? "percent2" : "percent";
  if (/[$£€¥]/.test(text) || /\[\$/.test(text) || /#,##0/.test(text)) return /\.0/.test(text) ? "money2" : "money";
  if (/0\.00/.test(text)) return "number2";
  return "number";
}

function sheetCell(sheet, row, column) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })];
}

async function readStyleMap(buffer) {
  const map = new Map();
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    workbook.eachSheet((sheet) => {
      const rows = new Map();
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        let bold = Boolean(row.font?.bold);
        let indent = Number(row.getCell(1).alignment?.indent) || 0;
        row.eachCell({ includeEmpty: false }, (cell, column) => {
          if (cell.font?.bold) bold = true;
          if (column === 1 && Number(cell.alignment?.indent)) indent = Number(cell.alignment.indent);
        });
        rows.set(rowNumber, { bold, indent });
      });
      map.set(sheet.name, rows);
    });
  } catch {
    /* .xls files and workbooks without a style table still parse from values. */
  }
  return map;
}

function parseSheet(sheet, name, index, styles) {
  const suggestedType = mapTabName(name);
  const emptyTab = {
    index,
    name,
    suggestedType,
    rowCount: 0,
    empty: true,
    error: "This tab is empty.",
    labelHeader: "",
    columns: [],
    rows: [],
  };
  if (!sheet || !sheet["!ref"]) return emptyTab;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerRow = range.s.r;
  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    headers.push(headerText(sheetCell(sheet, headerRow, column)));
  }
  while (headers.length > 1 && !headers[headers.length - 1]) headers.pop();
  const width = Math.max(headers.length, 1);
  const columns = [];
  for (let column = 1; column < width; column += 1) columns.push(headers[column] || `Column ${column}`);
  const rows = [];
  for (let rowIndex = headerRow + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const labelCell = sheetCell(sheet, rowIndex, range.s.c);
    const labelled = labelFromCell(labelCell);
    const values = [];
    const formats = [];
    for (let column = 1; column < width; column += 1) {
      const cell = sheetCell(sheet, rowIndex, range.s.c + column);
      values.push(cellNumber(cell));
      formats.push(numberFormat(cell?.z));
    }
    const hasNumber = values.some((value) => value != null);
    if (!labelled.label && !hasNumber) continue;
    const style = styles?.get(rowIndex + 1);
    const bold = Boolean(style?.bold || labelCell?.s?.font?.bold);
    const indent = style?.indent > 0 ? style.indent : labelled.indent;
    let kind = "line";
    if (isTotalLabel(labelled.label) || bold) kind = "total";
    else if (!hasNumber) kind = "heading";
    rows.push({
      kind,
      label: labelled.label,
      indent: Math.max(0, Math.min(8, indent || 0)),
      values,
      formats,
    });
  }
  if (!rows.length) return emptyTab;
  return {
    index,
    name,
    suggestedType,
    rowCount: rows.length,
    empty: false,
    error: "",
    labelHeader: headers[0] || "",
    columns,
    rows,
  };
}

function looksLikeWorkbook(buffer) {
  if (!buffer || buffer.length < 8) return false;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
}

export async function parseWorkbook(buffer) {
  if (!looksLikeWorkbook(buffer)) return { error: "Could not read that Excel file." };
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellNF: true, cellStyles: true, cellDates: false });
  } catch {
    return { error: "Could not read that Excel file." };
  }
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!names.length) return { error: "That workbook has no tabs." };
  const styles = await readStyleMap(buffer);
  const tabs = names.map((name, index) => parseSheet(workbook.Sheets[name], name, index, styles.get(name)));
  if (tabs.every((tab) => tab.empty) && names.every((name) => !workbook.Sheets[name]?.["!ref"])) {
    return { error: "Could not read that Excel file." };
  }
  return { tabs };
}

export function previewTabs(tabs) {
  return (tabs || []).map((tab) => ({
    index: tab.index,
    name: tab.name,
    suggestedType: tab.suggestedType || "",
    rowCount: tab.rowCount,
    empty: Boolean(tab.empty),
    error: tab.error || "",
  }));
}

function firstNumber(values) {
  return (values || []).find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function sectionFromTab(part, tab) {
  const presentation = normalizePresentation(part.presentation);
  const sourceRows = Array.isArray(tab?.rows) ? tab.rows : part.rows;
  let rows;
  if (presentation === "contacts") {
    rows = sourceRows
      .filter((row) => row.kind !== "heading" && clean(row.label, 160))
      .map((row) => ({
        kind: row.kind === "total" || isTotalLabel(row.label) ? "total" : "line",
        label: row.label,
        value: firstNumber(row.values) ?? numOrNull(row.value),
      }));
  } else if (presentation === "ecommerce") {
    rows = sourceRows
      .filter((row) => row.kind !== "heading")
      .map((row) => ({
        kind: row.kind === "total" ? "total" : "line",
        label: row.label,
        month: row.label,
        values: row.values || [],
        formats: row.formats || [],
      }));
  } else {
    rows = sourceRows.map((row) => ({
      kind: row.kind,
      label: row.label,
      indent: row.indent || 0,
      values: row.values || [],
      formats: row.formats || [],
    }));
  }
  return {
    ...part,
    id: newId(),
    presentation,
    columns: presentation === "contacts" ? [] : (tab?.columns || part.columns || []),
    labelHeader: part.labelHeader || tab?.labelHeader || "",
    rows,
    slices: presentation === "contacts"
      ? rows.filter((row) => row.kind === "line").map((row) => ({ label: row.label, value: row.value }))
      : undefined,
  };
}

export function sectionsFromMapping(tabs, choices) {
  if (!Array.isArray(tabs) || !tabs.length) return { error: "That workbook has no tabs." };
  if (!Array.isArray(choices)) return { error: "Choose a section type for each tab, or skip it." };
  const built = [];
  for (const tab of tabs) {
    const choice = choices.find((item) => Number(item?.index) === Number(tab.index)) || {};
    const skip = choice.skip === true || choice.type === "skip";
    if (skip) continue;
    if (tab.empty) return { error: `Skip the empty tab "${tab.name}".` };
    const typeKey = String(choice.type || tab.suggestedType || "");
    const type = sectionType(typeKey);
    if (!type) return { error: `Choose a section type for "${tab.name}", or skip it.` };
    for (const part of type.parts) built.push(sectionFromTab(part, tab));
  }
  if (!built.length) return { error: "Choose at least one tab to import." };
  return normalizeEditorSections(built);
}

function cashFlowFollowsBalance(sections) {
  const items = [...(sections || [])];
  const cashIndex = items.findIndex((section) => /cash flow/i.test(String(section?.title || "")));
  if (cashIndex < 0) return items;
  const [cash] = items.splice(cashIndex, 1);
  const balanceIndex = items.findIndex((section) => /balance sheet/i.test(String(section?.title || "")));
  items.splice(balanceIndex < 0 ? cashIndex : balanceIndex + 1, 0, cash);
  return items;
}

export function arrangeReportSections(reportSections, templateSections, { customOrder = false } = {}) {
  const source = (Array.isArray(reportSections) ? reportSections : []).filter((section) => section && !section.hidden);
  if (!customOrder) return { customOrder: false, sections: cashFlowFollowsBalance(source) };
  const hiddenTitles = new Set(
    (templateSections || []).filter((section) => section?.hidden).map((section) => clean(section.title, 160).toLowerCase()),
  );
  const visible = source.filter((section) => !hiddenTitles.has(clean(section.title, 160).toLowerCase()));
  const used = new Set();
  const ordered = [];
  for (const templateSection of templateSections || []) {
    if (templateSection?.hidden) continue;
    const index = visible.findIndex((section, item) => !used.has(item) && sameTitle(section.title, templateSection.title));
    if (index >= 0) {
      used.add(index);
      ordered.push(visible[index]);
    }
  }
  visible.forEach((section, index) => {
    if (!used.has(index)) ordered.push(section);
  });
  return { customOrder: true, sections: ordered };
}
