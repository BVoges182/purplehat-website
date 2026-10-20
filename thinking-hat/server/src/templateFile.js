const COLUMNS = [
  "record",
  "template_name",
  "layout",
  "source_business",
  "template_key",
  "month",
  "report_title",
  "period_label",
  "entity_name",
  "section_index",
  "section_title",
  "presentation",
  "row_index",
  "row_kind",
  "label",
  "indent",
  "line_month",
  "value",
  "values",
  "formats",
  "columns",
  "units",
  "note",
  "section_json",
  "movement_kind",
  "description",
  "amount",
  "occurred_at",
];

function layoutOf(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "purple-hat-demo" || text === "purple hat demo") return "purple-hat-demo";
  if (text === "wealth-tech" || text === "wealthtech") return "wealth-tech";
  return "";
}

function layoutName(layout) {
  return layout === "purple-hat-demo" ? "Purple Hat Demo" : "WealthTech";
}

function periodFor(month) {
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
  return { title, periodLabel: `Management report · Month ended ${ended}` };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function blankRow() {
  return Object.fromEntries(COLUMNS.map((column) => [column, ""]));
}

function csvLine(row) {
  return COLUMNS.map((column) => csvCell(row[column] ?? "")).join(",");
}

function jsonArray(value) {
  return Array.isArray(value) ? JSON.stringify(value) : "";
}

export function templateDownloadName(name, format) {
  const safe = String(name || "template").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
  return `${safe}-template.${format === "csv" ? "csv" : "txt"}`;
}

export function templateText(document) {
  const template = document.template;
  const lines = [
    "Thinking Hat client template",
    `Name: ${template.name}`,
    `Layout: ${layoutName(template.layout)}`,
  ];
  if (template.sourceBusiness) lines.push(`Saved from: ${template.sourceBusiness}`);
  lines.push(
    `Reports: ${document.reports.length}`,
    `Movements: ${document.movements.length}`,
    "",
    "Upload this file under Admin → Client templates.",
    "The dashboard and management reports for clients using this template follow the file.",
    "",
    JSON.stringify(document, null, 2),
    "",
  );
  return `${lines.join("\n")}`;
}

export function templateCsv(document) {
  const rows = [];
  const template = document.template;
  rows.push({
    ...blankRow(),
    record: "template",
    template_name: template.name,
    layout: template.layout,
    source_business: template.sourceBusiness || "",
    template_key: template.key || "",
  });
  document.reports.forEach((report) => {
    report.sections.forEach((section, sectionIndex) => {
      rows.push({
        ...blankRow(),
        record: "section",
        month: report.month,
        report_title: report.title || "",
        period_label: report.periodLabel || "",
        entity_name: report.entityName || "",
        section_index: String(sectionIndex),
        section_title: section.title || "",
        presentation: section.presentation || "",
        columns: jsonArray(section.columns),
        units: jsonArray(section.units),
        note: section.note || "",
        section_json: JSON.stringify(section),
      });
      (section.rows || []).forEach((row, rowIndex) => {
        rows.push({
          ...blankRow(),
          record: "line",
          month: report.month,
          section_index: String(sectionIndex),
          section_title: section.title || "",
          presentation: section.presentation || "",
          row_index: String(rowIndex),
          row_kind: row.kind || "",
          label: row.label || "",
          indent: row.indent == null ? "" : String(row.indent),
          line_month: row.month || "",
          value: typeof row.value === "number" ? String(row.value) : "",
          values: jsonArray(row.values),
          formats: jsonArray(row.formats),
        });
      });
    });
  });
  document.movements.forEach((movement) => {
    rows.push({
      ...blankRow(),
      record: "movement",
      movement_kind: movement.kind || "",
      description: movement.description || "",
      amount: String(movement.amount),
      occurred_at: movement.occurredAt || "",
    });
  });
  return [COLUMNS.join(","), ...rows.map(csvLine)].join("\n");
}

function readJson(text, label) {
  if (!String(text || "").trim()) return { value: undefined };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: `Could not read ${label}.` };
  }
}

function applyLine(row, line) {
  let changed = false;
  const assign = (key, value) => {
    if (JSON.stringify(row[key]) !== JSON.stringify(value)) {
      row[key] = value;
      changed = true;
    }
  };
  if (line.row_kind) assign("kind", line.row_kind);
  if (line.label) assign("label", line.label);
  if (line.indent !== "") {
    const indent = Number(line.indent);
    if (!Number.isInteger(indent) || indent < 0 || indent > 8) return { error: "A report line has an indent that cannot be used." };
    assign("indent", indent);
  }
  if (line.line_month) assign("month", line.line_month);
  if (line.value !== "") {
    const parsed = readJson(line.value, "a report figure");
    if (parsed.error) return parsed;
    if (typeof parsed.value !== "number") return { error: "A report figure must be a number." };
    assign("value", parsed.value);
  }
  if (line.values) {
    const parsed = readJson(line.values, "a report figure");
    if (parsed.error) return parsed;
    if (!Array.isArray(parsed.value)) return { error: "A report figure must be a list of numbers." };
    assign("values", parsed.value);
  }
  if (line.formats) {
    const parsed = readJson(line.formats, "a report format");
    if (parsed.error) return parsed;
    if (!Array.isArray(parsed.value)) return { error: "A report format must be a list." };
    assign("formats", parsed.value);
  }
  return { changed };
}

function sectionFromRow(row) {
  if (row.section_json) {
    const parsed = readJson(row.section_json, "a report section");
    if (parsed.error) return parsed;
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      return { error: "A report section could not be read." };
    }
    return { section: parsed.value };
  }
  const section = { title: row.section_title || "Section", rows: [] };
  if (row.presentation) section.presentation = row.presentation;
  if (row.note) section.note = row.note;
  if (row.columns) {
    const parsed = readJson(row.columns, "report columns");
    if (parsed.error) return parsed;
    section.columns = parsed.value;
  }
  if (row.units) {
    const parsed = readJson(row.units, "report units");
    if (parsed.error) return parsed;
    section.units = parsed.value;
  }
  return { section };
}

function documentFromCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { error: "That file is not a Thinking Hat template." };
  const header = table[0].map((cell) => cell.trim());
  if (!header.includes("record")) return { error: "That file is not a Thinking Hat template." };
  const records = table.slice(1).map((cells) => {
    const record = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    return record;
  });
  const templateRow = records.find((record) => record.record === "template");
  if (!templateRow) return { error: "The file needs a template name and layout." };
  const reports = new Map();
  const lines = [];
  const movements = [];
  for (const record of records) {
    if (record.record === "line") lines.push(record);
    if (record.record === "movement") movements.push(record);
    if (record.record !== "section") continue;
    const month = String(record.month || "").trim();
    if (!reports.has(month)) {
      reports.set(month, {
        month,
        title: record.report_title || "",
        periodLabel: record.period_label || "",
        entityName: record.entity_name || "",
        sections: [],
      });
    }
    const report = reports.get(month);
    if (!report.title && record.report_title) report.title = record.report_title;
    if (!report.periodLabel && record.period_label) report.periodLabel = record.period_label;
    if (!report.entityName && record.entity_name) report.entityName = record.entity_name;
    const built = sectionFromRow(record);
    if (built.error) return built;
    const sectionIndex = Number(record.section_index);
    report.sections[Number.isInteger(sectionIndex) && sectionIndex >= 0 ? sectionIndex : report.sections.length] = built.section;
  }
  for (const line of lines) {
    const report = reports.get(String(line.month || "").trim());
    if (!report) return { error: "A report line is missing its month." };
    const sectionIndex = Number(line.section_index);
    const section = report.sections[sectionIndex];
    if (!section) return { error: "A report line does not belong to a section." };
    if (!Array.isArray(section.rows)) section.rows = [];
    const rowIndex = Number(line.row_index);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > 800) return { error: "A report line number cannot be used." };
    while (section.rows.length <= rowIndex) section.rows.push({});
    const applied = applyLine(section.rows[rowIndex], line);
    if (applied.error) return applied;
    if (applied.changed && section.presentation === "contacts") {
      section.slices = section.rows
        .filter((row) => row.kind === "line" && typeof row.value === "number")
        .map((row) => ({ label: row.label, value: row.value }));
    }
  }
  return normalizeDocument({
    format: "thinking-hat-template",
    version: 1,
    template: {
      name: templateRow.template_name,
      layout: templateRow.layout,
      sourceBusiness: templateRow.source_business,
      key: templateRow.template_key,
    },
    reports: [...reports.values()].map((report) => ({
      ...report,
      sections: report.sections.filter(Boolean),
    })),
    movements: movements.map((movement) => ({
      kind: movement.movement_kind,
      description: movement.description,
      amount: movement.amount,
      occurredAt: movement.occurred_at,
    })),
  });
}

export function normalizeDocument(input) {
  const source = input && typeof input === "object" ? input : {};
  const template = source.template && typeof source.template === "object" ? source.template : {};
  const name = String(template.name || "").trim();
  if (!name) return { error: "Name the template." };
  if (name.length > 120) return { error: "Use a shorter name." };
  const layout = layoutOf(template.layout);
  if (!layout) return { error: "Use a WealthTech or Purple Hat Demo layout." };
  const key = String(template.key || "").trim();
  if (key && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return { error: "The template file has a key that cannot be used." };
  if (key.length > 80) return { error: "The template file has a key that cannot be used." };
  const reports = Array.isArray(source.reports) ? source.reports : [];
  if (reports.length > 36) return { error: "That template has too many reports." };
  const seen = new Set();
  const cleanReports = [];
  for (const report of reports) {
    const month = String(report?.month || "").trim();
    const period = periodFor(month);
    if (!period) return { error: `Report month ${month || "missing"} is not valid.` };
    if (seen.has(month)) return { error: "List each report month once." };
    seen.add(month);
    const sections = Array.isArray(report.sections) ? report.sections : [];
    if (sections.length > 40) return { error: "A report has too many sections." };
    for (const section of sections) {
      if (!section || typeof section !== "object" || Array.isArray(section)) return { error: "A report section could not be read." };
      if (Array.isArray(section.rows) && section.rows.length > 800) return { error: "A report section has too many lines." };
    }
    cleanReports.push({
      month,
      title: String(report.title || period.title).slice(0, 160),
      periodLabel: String(report.periodLabel || period.periodLabel).slice(0, 200),
      entityName: String(report.entityName || "").slice(0, 160),
      sections,
    });
  }
  const movements = Array.isArray(source.movements) ? source.movements : [];
  if (movements.length > 200) return { error: "That template has too many movements." };
  const cleanMovements = [];
  for (const movement of movements) {
    const description = String(movement?.description || "").trim();
    if (!description) return { error: "Name each movement." };
    if (String(movement?.amount ?? "").trim() === "") return { error: "Each movement needs an amount." };
    const cents = Math.round(Number(movement.amount) * 100);
    if (!Number.isFinite(cents)) return { error: "Each movement needs an amount." };
    const occurredAt = String(movement.occurredAt || "").trim();
    if (!occurredAt) return { error: "Each movement needs a date." };
    cleanMovements.push({
      kind: String(movement.kind || "movement").slice(0, 40),
      description: description.slice(0, 240),
      amount: cents / 100,
      occurredAt: occurredAt.slice(0, 40),
    });
  }
  return {
    document: {
      format: "thinking-hat-template",
      version: 1,
      template: {
        name,
        layout,
        sourceBusiness: String(template.sourceBusiness || "").trim().slice(0, 160),
        key,
      },
      reports: cleanReports,
      movements: cleanMovements,
    },
  };
}

export function parseTemplateFile(text, filename = "") {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const trimmed = raw.trim();
  if (!trimmed) return { error: "That file is empty." };
  const name = String(filename || "").toLowerCase();
  const jsonStart = trimmed.indexOf("{");
  const header = jsonStart >= 0 ? trimmed.slice(0, jsonStart) : "";
  const looksText = trimmed.startsWith("{") || /thinking hat client template/i.test(header);
  if (name.endsWith(".csv") || (!looksText && /^record,/i.test(trimmed))) return documentFromCsv(trimmed);
  if (!looksText || jsonStart < 0) return { error: "That file is not a Thinking Hat template." };
  try {
    return normalizeDocument(JSON.parse(trimmed.slice(jsonStart)));
  } catch {
    return { error: "Could not read that template file." };
  }
}
