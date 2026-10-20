import assert from "node:assert/strict";
import test from "node:test";
import { parseTemplateFile, templateCsv } from "./templateFile.js";
import {
  chipsFor,
  describeTemplate,
  needsReview,
  normalizePresentation,
  applyTemplateRename,
  planCopy,
  planImport,
  planNewTemplate,
  planTemplateArchive,
  reviewReason,
  sectionConfigs,
  sectionsFromDocument,
  seedProfile,
  uniqueName,
  validateClient,
  validateTemplate,
  validateTemplateRename,
  visibleBuilderTemplates,
} from "./templateBuilder.js";

const demoSections = [
  { title: "Executive summary", presentation: "" },
  { title: "December 2026 — Top expenses", presentation: "contacts", rows: [{ label: "Northwind", value: 10 }] },
  { title: "January–December 2026 — Top expenses", presentation: "contacts" },
  { title: "Profit and loss", presentation: "" },
  { title: "Profit and loss quarterly" },
  { title: "Balance sheet", rows: [{ label: "Cash", value: 100 }] },
  { title: "Aged Receivable Summary", presentation: "aging" },
  { title: "Aged Payable Summary", presentation: "aging" },
  { title: "Statement of cash flows" },
  { title: "E-commerce report", presentation: "ecommerce" },
];

test("seed profiles match the starting clients", () => {
  assert.deepEqual(seedProfile("PurpleHat Demo, LLC"), {
    framework: "us-gaap",
    currency: "USD",
    yearEnd: "12-31",
    period: "monthly",
  });
  assert.equal(seedProfile("Plas-Yn-Grove Farm").framework, "uk-gaap");
  assert.equal(seedProfile("Plas-Yn-Grove Farm").currency, "GBP");
  assert.equal(seedProfile("WealthTech (Pty) Ltd").framework, "ifrs-sme");
  assert.equal(seedProfile("WealthTech (Pty) Ltd").currency, "ZAR");
  assert.equal(seedProfile("WealthTech (Pty) Ltd").yearEnd, "09-30");
});

test("section configs keep order and drop figures", () => {
  const configs = sectionConfigs(demoSections);
  assert.equal(configs.length, demoSections.length);
  assert.deepEqual(configs[1], { title: "December 2026 — Top expenses", presentation: "contacts" });
  assert.equal("rows" in configs[5], false);
  assert.equal(configs[3].presentation, "table");
  assert.equal(configs[4].presentation, "table");
  assert.equal(configs[6].presentation, "aging");
  assert.equal(configs[9].presentation, "ecommerce");
});

test("presentation aliases fall back to the default table", () => {
  assert.equal(normalizePresentation(""), "table");
  assert.equal(normalizePresentation("table"), "table");
  assert.equal(normalizePresentation("Contact"), "contacts");
  assert.equal(normalizePresentation("aged"), "aging");
  assert.equal(normalizePresentation("e-commerce"), "ecommerce");
  assert.equal(normalizePresentation("pie"), "table");
});

test("chips follow section order and collapse repeats", () => {
  assert.deepEqual(chipsFor(demoSections), [
    "Exec summary",
    "Contacts",
    "P&L",
    "Balance sheet",
    "Aged receivables",
    "Aged payables",
    "Cash flow",
    "E-commerce",
  ]);
});

test("Plas copied template needs review and the US demo template does not", () => {
  const plas = describeTemplate({
    name: "Plas-Yn-Grove Farm",
    framework: "uk-gaap",
    layout: "purple-hat-demo",
    sections: demoSections,
    reviewRequired: false,
    period: "monthly",
    currency: "GBP",
    yearEnd: "03-31",
  });
  assert.equal(plas.needsReview, true);
  assert.match(plas.reviewReason, /US labels/);
  assert.match(plas.reviewReason, /UK GAAP/);

  const demo = describeTemplate({
    framework: "us-gaap",
    layout: "purple-hat-demo",
    sections: demoSections,
    reviewRequired: false,
  });
  assert.equal(demo.needsReview, false);
  assert.equal(demo.reviewReason, "");
});

test("WealthTech labels stay on the UK-style pack", () => {
  const sections = [
    { title: "Executive summary" },
    { title: "Profit and loss" },
    { title: "Balance sheet" },
    { title: "Statement of cash flows" },
  ];
  assert.equal(needsReview({
    framework: "ifrs-sme",
    layout: "wealth-tech",
    sections,
    reviewRequired: false,
  }), false);
  assert.equal(needsReview({
    framework: "us-gaap",
    layout: "wealth-tech",
    sections,
    reviewRequired: false,
  }), true);
});

test("copying flags the new template even when the labels already match", () => {
  const plan = planCopy({
    client: { id: 2, framework: "us-gaap", currency: "USD", yearEnd: "12-31", period: "monthly" },
    source: {
      id: 9,
      clientId: 1,
      name: "Purple Hat Demo",
      layout: "purple-hat-demo",
      sections: demoSections,
    },
    takenNames: ["Purple Hat Demo"],
  });
  assert.equal(plan.value.reviewRequired, true);
  assert.equal(plan.value.framework, "us-gaap");
  assert.equal(plan.value.pushToClients, false);
  assert.equal(plan.value.name, "Purple Hat Demo copy");
  assert.equal(plan.value.sections.some((section) => "rows" in section || "value" in section), false);
  assert.equal(needsReview(plan.value), true);
  assert.match(reviewReason(plan.value), /Copied from another client/);
});

test("copy refuses a template that already belongs to the selected client", () => {
  const plan = planCopy({
    client: { id: 4, framework: "uk-gaap" },
    source: { id: 3, clientId: 4, name: "Farm", layout: "purple-hat-demo", sections: [] },
  });
  assert.equal(plan.error, "Choose a template from another client.");
});

test("a new template follows the client framework and does not push books", () => {
  const created = planNewTemplate({
    name: "  Monthly pack ",
    framework: "uk-gaap",
    period: "quarterly",
    client: { currency: "GBP", yearEnd: "03-31" },
    takenNames: [],
  });
  assert.equal(created.value.layout, "wealth-tech");
  assert.equal(created.value.reviewRequired, false);
  assert.equal(created.value.pushToClients, false);
  assert.deepEqual(created.value.sections, []);

  const ifrs = planNewTemplate({
    name: "IFRS pack",
    framework: "ifrs",
    period: "monthly",
    client: { currency: "EUR", yearEnd: "12-31" },
    takenNames: [],
  });
  assert.equal(ifrs.value.reviewRequired, true);
  assert.match(reviewReason(ifrs.value), /do not match IFRS/);
});

test("client and template forms reject empty and unknown values", () => {
  assert.equal(validateClient({}).error, "Name the client.");
  assert.equal(validateClient({
    name: "New Co",
    framework: "local",
    currency: "USD",
    yearEnd: "12-31",
    period: "monthly",
  }).error, "Choose an accounting framework.");
  assert.equal(validateClient({
    name: "New Co",
    framework: "us-gaap",
    currency: "BTC",
    yearEnd: "12-31",
    period: "monthly",
  }).error, "Choose a currency.");
  assert.equal(validateClient({
    name: "New Co",
    framework: "us-gaap",
    currency: "usd",
    yearEnd: "12-32",
    period: "monthly",
  }).error, "Choose a financial year end.");
  assert.equal(validateClient({
    name: "New Co",
    framework: "us-gaap",
    currency: "usd",
    yearEnd: "12-31",
    period: "weekly",
  }).error, "Choose monthly or quarterly reporting.");
  const ok = validateClient({
    name: "New Co",
    framework: "ifrs",
    currency: "eur",
    yearEnd: "12-31",
    period: "quarterly",
  });
  assert.equal(ok.value.currency, "EUR");
  assert.equal(ok.value.period, "quarterly");
  assert.equal(validateTemplate({ name: "  ", framework: "us-gaap", period: "monthly" }).error, "Name the template.");
  assert.equal(planNewTemplate({
    name: "Purple Hat Demo",
    framework: "us-gaap",
    period: "monthly",
    client: { currency: "USD", yearEnd: "12-31" },
    takenNames: ["Purple Hat Demo"],
  }).error, "A template already has that name.");
});

test("import reads the current CSV export and does not reuse its template key", () => {
  const document = {
    format: "thinking-hat-template",
    version: 1,
    template: {
      name: "Purple Hat Demo",
      layout: "purple-hat-demo",
      sourceBusiness: "PurpleHat Demo, LLC",
      key: "purple-hat-demo",
    },
    reports: [{
      month: "2026-12",
      title: "December 2026",
      periodLabel: "Management report",
      entityName: "PurpleHat Demo, LLC",
      sections: demoSections,
    }],
    movements: [],
  };
  const parsed = parseTemplateFile(templateCsv(document), "purple-hat-demo-template.csv");
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.document.template.key, "purple-hat-demo");
  const sections = sectionsFromDocument(parsed.document);
  assert.equal(sections[1].presentation, "contacts");
  assert.equal(sections.some((section) => "value" in section || "rows" in section), false);
  const imported = planImport({
    client: { framework: "uk-gaap", currency: "GBP", yearEnd: "03-31", period: "monthly" },
    document: parsed.document,
    takenNames: ["Purple Hat Demo"],
  });
  assert.equal(imported.value.name, "Purple Hat Demo import");
  assert.equal(imported.value.reuseFileKey, false);
  assert.equal(imported.value.pushToClients, false);
  assert.equal(imported.value.reviewRequired, true);
  assert.equal(imported.value.layout, "purple-hat-demo");
  assert.deepEqual(chipsFor(imported.value.sections).slice(0, 2), ["Exec summary", "Contacts"]);
});

const storedTemplate = {
  id: 16,
  name: "Purple Hat Demo import",
  templateKey: "file-abc123",
  sections: [
    { title: "Balance sheet", presentation: "table" },
    { title: "Profit and loss", presentation: "table" },
  ],
  updatedAt: "2026-10-20T15:09:24.044Z",
  archived: false,
};

test("rename rejects an empty name, a name over 100 characters, and a duplicate for that client", () => {
  assert.equal(validateTemplateRename("   ").error, "Name the template.");
  assert.equal(validateTemplateRename("").error, "Name the template.");
  assert.equal(validateTemplateRename("x".repeat(101)).error, "Use 100 characters or fewer.");
  assert.equal(validateTemplateRename("x".repeat(100)).error, undefined);
  assert.equal(validateTemplateRename("x".repeat(100)).value.name.length, 100);
  const siblings = ["Purple Hat Demo import", "Monthly pack"];
  assert.equal(
    validateTemplateRename("monthly pack", { siblingNames: siblings, currentName: "Purple Hat Demo import" }).error,
    "This client already has a template with that name.",
  );
  assert.equal(
    validateTemplateRename("Purple Hat Demo import", { siblingNames: siblings, currentName: "Purple Hat Demo import" }).error,
    undefined,
  );
  assert.equal(
    validateTemplateRename("Monthly pack", { siblingNames: ["Other client pack"], currentName: "Purple Hat Demo import" }).error,
    undefined,
  );
});

test("rename persistence changes the name and updated time and keeps the key and sections", () => {
  const renamed = applyTemplateRename(storedTemplate, "  Purple Hat Demo Import  ", {
    siblingNames: ["Purple Hat Demo import"],
    updatedAt: "2026-10-20T18:04:03.000Z",
  });
  assert.equal(renamed.error, undefined);
  assert.equal(renamed.value.name, "Purple Hat Demo Import");
  assert.equal(renamed.value.updatedAt, "2026-10-20T18:04:03.000Z");
  assert.equal(renamed.value.templateKey, storedTemplate.templateKey);
  assert.equal(renamed.value.sections, storedTemplate.sections);
  assert.deepEqual(renamed.changed, {
    name: "Purple Hat Demo Import",
    updatedAt: "2026-10-20T18:04:03.000Z",
  });
  assert.equal(storedTemplate.name, "Purple Hat Demo import");
  assert.equal(storedTemplate.sections[0].title, "Balance sheet");
});

test("delete archives the template, warns when reports use it, and drops it from the list", () => {
  const idle = planTemplateArchive(storedTemplate, { reportCount: 0, updatedAt: "2026-10-20T18:10:00.000Z" });
  assert.equal(idle.value.archived, true);
  assert.equal(idle.value.warning, "");
  assert.equal(idle.value.templateKey, storedTemplate.templateKey);
  assert.equal(idle.value.sections, storedTemplate.sections);
  assert.equal(idle.value.name, storedTemplate.name);
  const inUse = planTemplateArchive(storedTemplate, { reportCount: 3, updatedAt: "2026-10-20T18:10:00.000Z" });
  assert.equal(inUse.value.archived, true);
  assert.equal(inUse.value.reportCount, 3);
  assert.equal(inUse.value.warning, "3 management reports use this template.");
  assert.equal(inUse.value.templateKey, "file-abc123");
  assert.deepEqual(inUse.value.sections, storedTemplate.sections);
  assert.equal(planTemplateArchive(storedTemplate, { reportCount: 1 }).value.warning, "1 management report uses this template.");
  const visible = visibleBuilderTemplates([
    { id: 1, name: "Still here", archived: false },
    inUse.value,
    idle.value,
  ]);
  assert.deepEqual(visible.map((template) => template.name), ["Still here"]);
  assert.equal(storedTemplate.archived, false);
});

test("unique names stay distinct", () => {
  assert.equal(uniqueName("Pack", ["Other"]), "Pack");
  assert.equal(uniqueName("Pack", ["Pack"], "copy"), "Pack copy");
  assert.equal(uniqueName("Pack", ["Pack", "Pack copy"], "copy"), "Pack copy 2");
});
