import assert from "node:assert/strict";
import test from "node:test";
import { parseTemplateFile, templateCsv } from "./templateFile.js";
import {
  chipsFor,
  describeTemplate,
  needsReview,
  normalizePresentation,
  planCopy,
  planImport,
  planNewTemplate,
  reviewReason,
  sectionConfigs,
  sectionsFromDocument,
  seedProfile,
  uniqueName,
  validateClient,
  validateTemplate,
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

test("unique names stay distinct", () => {
  assert.equal(uniqueName("Pack", ["Other"]), "Pack");
  assert.equal(uniqueName("Pack", ["Pack"], "copy"), "Pack copy");
  assert.equal(uniqueName("Pack", ["Pack", "Pack copy"], "copy"), "Pack copy 2");
});
