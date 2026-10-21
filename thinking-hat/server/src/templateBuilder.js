// Client Template Builder rules. This module does not open the database.

export const FRAMEWORKS = [
  { key: "us-gaap", label: "US GAAP", short: "US GAAP" },
  { key: "uk-gaap", label: "UK GAAP (FRS 102)", short: "UK GAAP" },
  { key: "ifrs", label: "IFRS", short: "IFRS" },
  { key: "ifrs-sme", label: "IFRS for SMEs / SA GAAP", short: "IFRS for SMEs" },
];

export const PERIODS = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
];

export const CURRENCIES = ["USD", "GBP", "EUR", "ZAR"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const YEAR_ENDS = MONTHS.map((month, index) => {
  const key = `${String(index + 1).padStart(2, "0")}-${String(MONTH_LENGTHS[index]).padStart(2, "0")}`;
  return [key, `${MONTH_LENGTHS[index]} ${month}`];
});

export const PRESENTATION_LABELS = {
  table: "Default table",
  contacts: "Contacts (table plus pie)",
  aging: "Aging",
  ecommerce: "E-commerce",
};

const FRAMEWORK_KEYS = new Set(FRAMEWORKS.map((item) => item.key));
const PERIOD_KEYS = new Set(PERIODS.map((item) => item.key));
const YEAR_END_KEYS = new Set(YEAR_ENDS.map(([key]) => key));

export function frameworkMeta(key) {
  return FRAMEWORKS.find((item) => item.key === key) || null;
}

export function frameworkLabel(key, { short = false } = {}) {
  const meta = frameworkMeta(key);
  if (!meta) return "";
  return short ? meta.short : meta.label;
}

export function periodLabel(key) {
  return PERIODS.find((item) => item.key === key)?.label || "";
}

export function yearEndLabel(value) {
  const match = /^(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const month = MONTHS[Number(match[1]) - 1];
  if (!month) return "";
  return `${Number(match[2])} ${month}`;
}

export function builderOptions() {
  return {
    frameworks: FRAMEWORKS.map((item) => ({ key: item.key, label: item.label, short: item.short })),
    periods: PERIODS.map((item) => ({ ...item })),
    currencies: [...CURRENCIES],
    yearEnds: YEAR_ENDS.map(([key, label]) => ({ key, label })),
  };
}

// Books do not store a year end. December matches the demo pack, March is the
// usual UK farm year, and September matches the WealthTech pack.
export function seedProfile(businessName) {
  const name = String(businessName || "");
  if (/purple\s*hat\s*demo/i.test(name)) {
    return { framework: "us-gaap", currency: "USD", yearEnd: "12-31", period: "monthly" };
  }
  if (/plas[\s-]*yn[\s-]*grove/i.test(name)) {
    return { framework: "uk-gaap", currency: "GBP", yearEnd: "03-31", period: "monthly" };
  }
  if (/wealth\s*tech/i.test(name)) {
    return { framework: "ifrs-sme", currency: "ZAR", yearEnd: "09-30", period: "monthly" };
  }
  return { framework: "uk-gaap", currency: "USD", yearEnd: "12-31", period: "monthly" };
}

export function normalizePresentation(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (text === "contact" || text === "contacts") return "contacts";
  if (text === "aging" || text === "aged") return "aging";
  if (text === "ecommerce" || text === "e-commerce") return "ecommerce";
  return "table";
}

export function presentationLabel(value) {
  return PRESENTATION_LABELS[normalizePresentation(value)] || PRESENTATION_LABELS.table;
}

export function sectionConfigs(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((section) => section && typeof section === "object" && !Array.isArray(section))
    .map((section) => ({
      title: String(section.title || "Section").slice(0, 160),
      presentation: normalizePresentation(section.presentation),
    }));
}

export function chipFor(section) {
  const title = String(section?.title || "");
  const presentation = normalizePresentation(section?.presentation);
  if (/executive summary/i.test(title)) return "Exec summary";
  if (/profit and loss|income statement/i.test(title)) return "P&L";
  if (/balance sheet|financial position/i.test(title)) return "Balance sheet";
  if (/cash flow/i.test(title)) return "Cash flow";
  if (/receivable/i.test(title)) return "Aged receivables";
  if (/payable/i.test(title)) return "Aged payables";
  if (/e-?commerce/i.test(title) || presentation === "ecommerce") return "E-commerce";
  if (presentation === "contacts") return "Contacts";
  if (presentation === "aging") return "Aging";
  return "";
}

export function chipsFor(sections) {
  const chips = [];
  for (const section of sectionConfigs(sections)) {
    const chip = chipFor(section);
    if (chip && !chips.includes(chip)) chips.push(chip);
  }
  return chips;
}

export function sectionsFromDocument(document) {
  const reports = Array.isArray(document?.reports) ? [...document.reports] : [];
  reports.sort((left, right) => String(left?.month || "").localeCompare(String(right?.month || "")));
  const latest = reports.at(-1);
  return sectionConfigs(latest?.sections || []);
}

// purple-hat-demo is the US label pack. wealth-tech is the UK-style pack,
// even where a section title says Balance sheet.
export function labelFamily({ layout, sections = [] } = {}) {
  const text = sectionConfigs(sections).map((section) => section.title).join("\n");
  if (layout === "purple-hat-demo") return "us";
  const usOnly = /aged receivable|aged payable|e-?commerce|members?'?\s*(?:equity|drawings)|accounts receivable/i.test(text);
  if (usOnly) return "us";
  if (layout === "wealth-tech") return "uk";
  if (/statement of financial position|trade debtors|trade creditors|partners' accounts/i.test(text)) return "uk";
  if (/balance sheet|statement of cash flows/i.test(text)) return "us";
  return "";
}

export function expectedFamily(framework) {
  if (framework === "us-gaap") return "us";
  if (framework === "uk-gaap" || framework === "ifrs-sme") return "uk";
  if (framework === "ifrs") return "ifrs";
  return "";
}

// Exact labels only. A UK import rewrites the left column and leaves every
// other line alone. US clients never use this map.
export const UK_GAAP_LABEL_MAP = [
  ["Accounts Receivable", "Trade debtors"],
  ["Accounts Payable", "Trade creditors"],
  ["Inventory", "Stock"],
  ["Inventories", "Stock"],
  ["Merchandise inventory", "Stock"],
  ["Income Statement", "Profit and loss"],
  ["Statement of income", "Profit and loss"],
  ["Stockholders' Equity", "Capital and reserves"],
  ["Stockholder's Equity", "Capital and reserves"],
  ["Stockholders Equity", "Capital and reserves"],
  ["Retained earnings", "Profit and loss account"],
  ["Cost of goods sold", "Cost of sales"],
  ["Member drawings", "Partners' drawings"],
  ["Members' drawings", "Partners' drawings"],
  ["Members drawings", "Partners' drawings"],
  ["Members' equity", "Capital and reserves"],
  ["Members equity", "Capital and reserves"],
  ["Common stock", "Called up share capital"],
  ["Additional paid-in capital", "Share premium"],
  ["Allowance for doubtful accounts", "Provision for doubtful debts"],
  ["Prepaid expenses", "Prepayments"],
  ["Property, plant and equipment", "Tangible fixed assets"],
  ["Property, plant & equipment", "Tangible fixed assets"],
  ["Sales tax payable", "VAT"],
];

// US terms with no safe UK equivalent. A UK import keeps the words and lists them.
export const UNRECOGNISED_US_LABELS = [
  "Deferred revenue",
  "Unearned revenue",
  "Treasury stock",
  "Accumulated other comprehensive income",
  "Other comprehensive income",
  "Accumulated deficit",
  "Paid-in capital",
  "Par value",
  "Federal income tax",
  "State income tax",
  "Sales tax",
  "Checking account",
  "Allowance for bad debts",
];

function normalLabel(value) {
  return String(value || "")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const UK_LABEL_BY_US = new Map(UK_GAAP_LABEL_MAP.map(([us, uk]) => [normalLabel(us), uk]));
const UNRECOGNISED_US = new Set(UNRECOGNISED_US_LABELS.map((label) => normalLabel(label)));

export function unrecognisedUsLabels({ sections = [], labels = [] } = {}) {
  const found = [];
  const seen = new Set();
  const consider = (label) => {
    const text = String(label || "").trim();
    const key = normalLabel(text);
    if (!key || seen.has(key) || UK_LABEL_BY_US.has(key) || !UNRECOGNISED_US.has(key)) return;
    seen.add(key);
    found.push(text);
  };
  for (const section of sectionConfigs(sections)) consider(section.title);
  for (const label of labels) consider(label);
  return found;
}

function labelsInDocument(document) {
  const labels = [];
  for (const report of document?.reports || []) {
    for (const section of report?.sections || []) {
      if (section?.title) labels.push(section.title);
      for (const row of section?.rows || []) {
        if (row?.label) labels.push(row.label);
      }
      for (const slice of section?.slices || []) {
        if (slice?.label) labels.push(slice.label);
      }
    }
  }
  return labels;
}

function rewriteUkLabel(label, mapped) {
  const text = String(label ?? "");
  const key = normalLabel(text);
  const to = key ? UK_LABEL_BY_US.get(key) : "";
  if (!to) return text;
  const from = text.trim();
  if (!mapped.some((item) => item.from === from && item.to === to)) mapped.push({ from, to });
  return to;
}

export function applyUkGaapLabels(document) {
  const copy = structuredClone(document);
  const mapped = [];
  for (const report of copy?.reports || []) {
    for (const section of report?.sections || []) {
      if (section?.title) section.title = rewriteUkLabel(section.title, mapped);
      for (const row of section?.rows || []) {
        if (row?.label) row.label = rewriteUkLabel(row.label, mapped);
      }
      for (const slice of section?.slices || []) {
        if (slice?.label) slice.label = rewriteUkLabel(slice.label, mapped);
      }
    }
  }
  return { document: copy, mapped };
}

export function layoutForFramework(framework) {
  return framework === "us-gaap" ? "purple-hat-demo" : "wealth-tech";
}

export function needsReview({ framework, layout, sections, labels, reviewRequired } = {}) {
  if (framework === "uk-gaap") {
    return unrecognisedUsLabels({ sections, labels }).length > 0 || Boolean(reviewRequired);
  }
  if (reviewRequired) return true;
  const family = labelFamily({ layout, sections });
  const expected = expectedFamily(framework);
  if (!family || !expected) return false;
  return family !== expected;
}

export function reviewReason({ framework, layout, sections, labels, reviewRequired } = {}) {
  if (framework === "uk-gaap") {
    const unknown = unrecognisedUsLabels({ sections, labels });
    if (unknown.length) {
      return `US labels do not match UK GAAP: ${unknown.join(", ")}. Review this template before using it.`;
    }
  } else {
    const family = labelFamily({ layout, sections });
    const expected = expectedFamily(framework);
    if (family && expected && family !== expected) {
      const labelName = family === "us" ? "US labels" : "UK labels";
      return `${labelName} do not match ${frameworkLabel(framework, { short: true }) || "this framework"}. Review this template before using it.`;
    }
  }
  if (reviewRequired) return "Copied from another client. Review it before using the template.";
  return "Review this template before using it.";
}

export function describeTemplate({
  id,
  name,
  framework,
  period,
  currency,
  yearEnd,
  layout,
  sections,
  reviewRequired,
  labels,
  updatedAt,
} = {}) {
  const configs = sectionConfigs(sections);
  const flagged = needsReview({ framework, layout, sections: configs, labels, reviewRequired });
  return {
    id: id == null ? null : Number(id),
    name: name || "",
    framework: framework || "",
    frameworkLabel: frameworkLabel(framework, { short: true }),
    period: period || "",
    periodLabel: periodLabel(period),
    currency: currency || "",
    yearEnd: yearEnd || "",
    yearEndLabel: yearEndLabel(yearEnd),
    layout: layout || "",
    sections: configs,
    chips: chipsFor(configs),
    updatedAt: updatedAt || "",
    needsReview: flagged,
    reviewReason: flagged ? reviewReason({ framework, layout, sections: configs, labels, reviewRequired }) : "",
  };
}

export function describeClient(client, templates = []) {
  return {
    id: Number(client.id),
    name: client.name,
    framework: client.framework,
    frameworkLabel: frameworkLabel(client.framework, { short: true }),
    frameworkName: frameworkLabel(client.framework),
    currency: client.currency,
    yearEnd: client.yearEnd || client.year_end,
    yearEndLabel: yearEndLabel(client.yearEnd || client.year_end),
    period: client.period,
    periodLabel: periodLabel(client.period),
    grokBotId: client.grokBotId == null ? null : Number(client.grokBotId),
    templates,
  };
}

function cleanName(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

export function validateClient(input = {}) {
  const name = cleanName(input.name, 120);
  if (!name) return { error: "Name the client." };
  const framework = String(input.framework || "").trim();
  if (!FRAMEWORK_KEYS.has(framework)) return { error: "Choose an accounting framework." };
  const currency = String(input.currency || "").trim().toUpperCase();
  if (!CURRENCIES.includes(currency)) return { error: "Choose a currency." };
  const yearEnd = String(input.yearEnd || input.year_end || "").trim();
  if (!YEAR_END_KEYS.has(yearEnd)) return { error: "Choose a financial year end." };
  const period = String(input.period || "").trim();
  if (!PERIOD_KEYS.has(period)) return { error: "Choose monthly or quarterly reporting." };
  return { value: { name, framework, currency, yearEnd, period } };
}

export function validateTemplate(input = {}) {
  const name = cleanName(input.name, 120);
  if (!name) return { error: "Name the template." };
  const framework = String(input.framework || "").trim();
  if (!FRAMEWORK_KEYS.has(framework)) return { error: "Choose an accounting framework." };
  const period = String(input.period || "").trim();
  if (!PERIOD_KEYS.has(period)) return { error: "Choose monthly or quarterly reporting." };
  return { value: { name, framework, period } };
}

export function uniqueName(base, takenNames = [], suffix = "copy") {
  const taken = new Set((takenNames || []).map((name) => String(name || "").trim().toLowerCase()));
  const trimmed = cleanName(base, 120);
  if (!trimmed) return "";
  if (!taken.has(trimmed.toLowerCase())) return trimmed;
  const first = cleanName(`${trimmed} ${suffix}`, 120);
  if (!taken.has(first.toLowerCase())) return first;
  for (let count = 2; count < 100; count += 1) {
    const candidate = cleanName(`${trimmed} ${suffix} ${count}`, 120);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return cleanName(`${trimmed} ${suffix} 100`, 120);
}

function nameTaken(name, takenNames) {
  return (takenNames || []).some((item) => String(item || "").trim().toLowerCase() === name.toLowerCase());
}

export function planNewTemplate({ name, framework, period, client, takenNames = [] } = {}) {
  const checked = validateTemplate({ name, framework, period });
  if (checked.error) return checked;
  if (nameTaken(checked.value.name, takenNames)) return { error: "A template already has that name." };
  const layout = layoutForFramework(checked.value.framework);
  const sections = [];
  const reviewRequired = needsReview({
    framework: checked.value.framework,
    layout,
    sections,
    reviewRequired: false,
  });
  return {
    value: {
      name: checked.value.name,
      framework: checked.value.framework,
      period: checked.value.period,
      currency: client?.currency || "",
      yearEnd: client?.yearEnd || client?.year_end || "",
      layout,
      sections,
      reviewRequired,
      pushToClients: false,
    },
  };
}

export function planCopy({ client, source, takenNames = [] } = {}) {
  if (!source) return { error: "Choose a template to copy." };
  if (client && source.clientId != null && Number(source.clientId) === Number(client.id)) {
    return { error: "Choose a template from another client." };
  }
  const sections = sectionConfigs(source.sections || []);
  const layout = source.layout === "purple-hat-demo" ? "purple-hat-demo" : "wealth-tech";
  const name = uniqueName(source.name, takenNames, "copy");
  if (!name) return { error: "Name the template." };
  return {
    value: {
      name,
      layout,
      framework: client?.framework || "",
      currency: client?.currency || "",
      yearEnd: client?.yearEnd || client?.year_end || "",
      period: client?.period || "",
      sections,
      reviewRequired: true,
      copiedFromId: source.id ?? null,
      pushToClients: false,
    },
  };
}

export function validateTemplateRename(name, { siblingNames = [], currentName = "" } = {}) {
  const cleaned = String(name ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return { error: "Name the template." };
  if (cleaned.length > 100) return { error: "Use 100 characters or fewer." };
  const current = String(currentName || "").trim().toLowerCase();
  const lower = cleaned.toLowerCase();
  const taken = (siblingNames || []).some((item) => {
    const value = String(item || "").trim().toLowerCase();
    return value && value === lower && value !== current;
  });
  if (taken) return { error: "This client already has a template with that name." };
  return { value: { name: cleaned } };
}

export function applyTemplateRename(template, name, { siblingNames = [], updatedAt } = {}) {
  const checked = validateTemplateRename(name, { siblingNames, currentName: template?.name || "" });
  if (checked.error) return checked;
  const nextUpdatedAt = updatedAt || template?.updatedAt || "";
  return {
    value: {
      ...template,
      name: checked.value.name,
      updatedAt: nextUpdatedAt,
      templateKey: template?.templateKey,
      sections: template?.sections,
    },
    changed: {
      name: checked.value.name,
      updatedAt: nextUpdatedAt,
    },
  };
}

export function templateUsageWarning(reportCount) {
  const count = Math.max(0, Number(reportCount) || 0);
  if (!count) return "";
  return count === 1
    ? "1 management report uses this template."
    : `${count} management reports use this template.`;
}

export function planTemplateArchive(template, { reportCount = 0, updatedAt } = {}) {
  const count = Math.max(0, Number(reportCount) || 0);
  const nextUpdatedAt = updatedAt || template?.updatedAt || "";
  return {
    value: {
      ...template,
      archived: true,
      updatedAt: nextUpdatedAt,
      templateKey: template?.templateKey,
      sections: template?.sections,
      reportCount: count,
      warning: templateUsageWarning(count),
    },
  };
}

export function visibleBuilderTemplates(templates = []) {
  return (templates || []).filter((template) => !template?.archived);
}

export function planImport({ client, document, takenNames = [] } = {}) {
  const template = document?.template;
  if (!template?.name) return { error: "Name the template." };
  const layout = template.layout === "purple-hat-demo" ? "purple-hat-demo" : template.layout === "wealth-tech" ? "wealth-tech" : "";
  if (!layout) return { error: "Use a WealthTech or Purple Hat Demo layout." };
  const framework = client?.framework || "";
  let working = document;
  let mappedLabels = [];
  if (framework === "uk-gaap") {
    const applied = applyUkGaapLabels(document);
    working = applied.document;
    mappedLabels = applied.mapped;
  }
  const sections = sectionsFromDocument(working);
  const reviewRequired = needsReview({
    framework,
    layout,
    sections,
    labels: labelsInDocument(working),
    reviewRequired: false,
  });
  return {
    document: working,
    value: {
      name: uniqueName(template.name, takenNames, "import"),
      layout,
      framework,
      currency: client?.currency || "",
      yearEnd: client?.yearEnd || client?.year_end || "",
      period: client?.period || "",
      sections,
      reviewRequired,
      mappedLabels,
      reuseFileKey: false,
      pushToClients: false,
    },
  };
}
