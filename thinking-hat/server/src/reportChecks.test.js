import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlainDetailLabel,
  monthEndedLabel,
  prepareReport,
  preserveReportFigures,
  templateReviewWarnings,
  validateReport,
} from "./reportChecks.js";

const money = ["money", "money", "money", "money"];

function demoSections() {
  return [
    {
      title: "Executive summary",
      note: "PurpleHat Demo, LLC · For the month ended December 31, 2026",
      columns: ["Dec 2026", "Nov 2026", "Oct 2026", "Year to date"],
      rows: [
        { kind: "heading", label: "Cash" },
        { kind: "line", label: "Cash received", values: [88400, 95300, 72800, 706300], formats: money },
        { kind: "line", label: "Cash spent", values: [-73140, -94750, -72440, -706330], formats: money },
        { kind: "line", label: "Member drawings", values: [-1500, -1500, -1500, -18000], formats: money },
        { kind: "total", label: "Cash surplus (deficit)", values: [13760, -950, -1140, -18030], formats: money },
        { kind: "line", label: "Closing bank balance", values: [71970, 58210, 59160, 71970], formats: money },
        { kind: "heading", label: "Profitability" },
        { kind: "line", label: "Income", values: [86700, 98700, 74600, 712800], formats: money },
        { kind: "line", label: "Cost of Sales", values: [56760, 64680, 48840, 466470], formats: money },
        { kind: "total", label: "Gross profit (loss)", values: [29940, 34020, 25760, 246330], formats: money },
        { kind: "line", label: "GP %", values: [0.34, 0.34, 0.34, 0.34], formats: ["percent", "percent", "percent", "percent"] },
        { kind: "line", label: "Expenses", values: [22180, 23470, 20700, 227260], formats: money },
        { kind: "total", label: "Net Profit (loss)", values: [7760, 10550, 5060, 19070], formats: money },
      ],
    },
    {
      title: "Profit and loss",
      note: "PurpleHat Demo, LLC · For the month ended December 31, 2026",
      columns: ["Dec 2026", "Nov 2026", "Oct 2026", "Year to date"],
      rows: [
        { kind: "heading", label: "Net revenue" },
        { kind: "line", label: "Online product sales", values: [86000, 98000, 74000, 707000], formats: money },
        { kind: "line", label: "Shipping income", values: [4300, 4900, 3700, 35200], formats: money },
        { kind: "line", label: "Returns and refunds", values: [-3600, -4200, -3100, -29400], formats: money },
        { kind: "total", label: "Total net revenue", values: [86700, 98700, 74600, 712800], formats: money },
        { kind: "heading", label: "Cost of goods sold" },
        { kind: "line", label: "Product purchases", values: [56760, 64680, 48840, 466470], formats: money },
        { kind: "total", label: "Total cost of goods sold", values: [56760, 64680, 48840, 466470], formats: money },
        { kind: "total", label: "Gross profit (loss)", values: [29940, 34020, 25760, 246330], formats: money },
        { kind: "line", label: "GP %", values: [0.3, 0.3, 0.3, 0.3], formats: ["percent2", "percent2", "percent2", "percent2"] },
        { kind: "heading", label: "Operating expenses" },
        { kind: "line", label: "Wages", values: [22180, 23470, 20700, 227260], formats: money },
        { kind: "total", label: "Total operating expenses", values: [22180, 23470, 20700, 227260], formats: money },
        { kind: "total", label: "Operating income (loss)", values: [7760, 10550, 5060, 19070], formats: money },
        { kind: "line", label: "Income tax expense", values: [0, 0, 0, 0], formats: money },
        { kind: "total", label: "Net income", values: [7760, 10550, 5060, 19070], formats: money },
      ],
    },
    {
      title: "Balance sheet",
      note: "PurpleHat Demo, LLC · As at December 31, 2026",
      columns: ["31 Dec 2026", "30 Nov 2026", "31 Oct 2026"],
      rows: [
        { kind: "heading", label: "Assets" },
        { kind: "heading", label: "Current assets" },
        { kind: "line", label: "Cash", values: [71970, 58210, 59160], formats: ["money", "money", "money"] },
        { kind: "line", label: "Accounts receivable", values: [12500, 14200, 10800], formats: ["money", "money", "money"] },
        { kind: "line", label: "Inventory", values: [54000, 61000, 52000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total current assets", values: [138470, 133410, 121960], formats: ["money", "money", "money"] },
        { kind: "total", label: "Property and equipment, net", indent: 0, values: [36000, 36000, 36000], formats: ["money", "money", "money"] },
        { kind: "line", label: "Website and software", values: [18000, 18000, 18000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Warehouse equipment", values: [24000, 24000, 24000], formats: ["money", "money", "money"] },
        { kind: "line", label: "Accumulated depreciation", values: [-6000, -6000, -6000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total assets", values: [174470, 169410, 157960], formats: ["money", "money", "money"] },
        { kind: "heading", label: "Liabilities and Members' equity" },
        { kind: "heading", label: "Current liabilities" },
        { kind: "line", label: "Accounts payable", values: [8400, 9600, 7200], formats: ["money", "money", "money"] },
        { kind: "line", label: "Sales tax payable", values: [1800, 1800, 1800], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total current liabilities", values: [10200, 11400, 9000], formats: ["money", "money", "money"] },
        { kind: "line", label: "Long-term liabilities", values: [0, 0, 0], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total liabilities", values: [10200, 11400, 9000], formats: ["money", "money", "money"] },
        { kind: "heading", label: "Members' equity" },
        { kind: "line", label: "Member capital", values: [10000, 10000, 10000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Retained earnings", values: [153200, 182510, 171960], formats: ["money", "money", "money"] },
        { kind: "line", label: "Net income", values: [19070, -16500, -15000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Member drawings", values: [-18000, -18000, -18000], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total members' equity", values: [164270, 158010, 148960], formats: ["money", "money", "money"] },
        { kind: "total", label: "Total liabilities and equity", values: [174470, 169410, 157960], formats: ["money", "money", "money"] },
      ],
    },
    {
      title: "Statement of cash flows",
      note: "PurpleHat Demo, LLC · For the month ended 30 April 2026",
      columns: ["Dec 2026", "Nov 2026", "Oct 2026", "Year to date"],
      rows: [
        { kind: "heading", label: "Net cash provided by (used in)" },
        { kind: "heading", label: "Operating activities" },
        { kind: "line", label: "Receipts from customers", values: [88400, 95300, 72800, 706300], formats: money },
        { kind: "line", label: "Payments to suppliers and employees", values: [-73140, -94750, -72440, -706330], formats: money },
        { kind: "total", label: "", values: [15260, 550, 360, -30], formats: money },
        { kind: "heading", label: "Investing Activities" },
        { kind: "line", label: "Payment for property, plant and equipment", values: [0, 0, 0, 0], formats: money },
        { kind: "heading", label: "Financing Activities" },
        { kind: "line", label: "Member drawings", values: [-1500, -1500, -1500, -18000], formats: money },
        { kind: "total", label: "", values: [-1500, -1500, -1500, -18000], formats: money },
        { kind: "total", label: "Net change in cash", values: [13760, -950, -1140, -18030], formats: money },
        { kind: "line", label: "Cash and cash equivalents at beginning of period", values: [58210, 59160, 60300, 90000], formats: money },
        { kind: "total", label: "Cash and cash equivalents at end of period", values: [71970, 58210, 59160, 71970], formats: money },
      ],
    },
    {
      title: "E-commerce report",
      presentation: "ecommerce",
      note: "",
      columns: ["Ad Spend (Google Ads)", "Impressions", "Clicks", "CTR", "CPC", "Sessions (Paid)", "Orders (Paid)", "Revenue (Paid)", "Conversion Rate", "ROAS", "CPA", "AOV"],
      rows: [
        { month: "Jan 2026", values: [4200, 285000, 1425, 0.005, 2.95, 1350, 68, 18400, 0.0504, 4.38, 61.76, 270.59] },
        { month: "Feb 2026", values: [3900, 268000, 1330, 0.005, 2.93, 1260, 62, 16850, 0.0492, 4.32, 62.9, 271.77] },
      ],
    },
  ];
}

function row(sections, title, label) {
  const section = sections.find((item) => item.title === title);
  return section.rows.find((item) => item.label === label);
}

test("detail labels stay lines even when the sheet bolds them", () => {
  assert.equal(isPlainDetailLabel("Warehouse equipment"), true);
  assert.equal(isPlainDetailLabel("Retained earnings"), true);
  assert.equal(isPlainDetailLabel("Member drawings"), true);
  assert.equal(isPlainDetailLabel("Members' drawings"), true);
  assert.equal(isPlainDetailLabel("Total assets"), false);
  assert.equal(isPlainDetailLabel(""), false);
});

test("December demo template is repaired and then validates clean", () => {
  const raw = demoSections();
  const before = validateReport(raw, "2026-12");
  assert.ok(before.some((warning) => warning.includes("30 April 2026")));
  assert.ok(before.some((warning) => warning.includes("no label")));
  assert.ok(before.some((warning) => warning.includes("30 Nov 2026") && warning.includes("-16,500")));
  assert.ok(before.some((warning) => warning.includes("31 Oct 2026") && warning.includes("-15,000")));
  assert.ok(before.some((warning) => warning.includes("CTR") && warning.includes("Feb 2026")));

  const prepared = prepareReport(raw, "2026-12");
  const cash = prepared.sections.find((section) => section.title === "Statement of cash flows");
  assert.equal(cash.note, `PurpleHat Demo, LLC · For the month ended ${monthEndedLabel("2026-12")}`);
  assert.equal(prepared.sections[0].note, "PurpleHat Demo, LLC · For the month ended December 31, 2026");
  assert.equal(prepared.sections[2].note, "PurpleHat Demo, LLC · As at December 31, 2026");
  assert.deepEqual(
    cash.rows.map((item) => item.label),
    [
      "Net cash provided by (used in)",
      "Operating activities",
      "Receipts from customers",
      "Payments to suppliers and employees",
      "Net cash from operating activities",
      "Investing Activities",
      "Payment for property, plant and equipment",
      "Net cash from investing activities",
      "Financing Activities",
      "Member drawings",
      "Net cash from financing activities",
      "Net change in cash",
      "Cash and cash equivalents at beginning of period",
      "Cash and cash equivalents at end of period",
    ],
  );
  assert.deepEqual(row(prepared.sections, "Statement of cash flows", "Net cash from investing activities").values, [0, 0, 0, 0]);
  assert.deepEqual(row(prepared.sections, "Statement of cash flows", "Net change in cash").values, [13760, -950, -1140, -18030]);

  const balance = prepared.sections.find((section) => section.title === "Balance sheet");
  const labels = balance.rows.map((item) => item.label);
  const equipment = labels.indexOf("Website and software");
  assert.ok(equipment < labels.indexOf("Warehouse equipment"));
  assert.ok(labels.indexOf("Warehouse equipment") < labels.indexOf("Accumulated depreciation"));
  assert.ok(labels.indexOf("Accumulated depreciation") < labels.indexOf("Property and equipment, net"));
  assert.equal(row(prepared.sections, "Balance sheet", "Warehouse equipment").kind, "line");
  assert.equal(row(prepared.sections, "Balance sheet", "Retained earnings").kind, "line");
  assert.equal(row(prepared.sections, "Balance sheet", "Member drawings").kind, "line");
  assert.equal(row(prepared.sections, "Balance sheet", "Property and equipment, net").kind, "total");
  assert.deepEqual(row(prepared.sections, "Balance sheet", "Property and equipment, net").values, [36000, 36000, 36000]);
  assert.deepEqual(row(prepared.sections, "Balance sheet", "Net income").values, [19070, 11310, 760]);
  assert.deepEqual(row(prepared.sections, "Balance sheet", "Retained earnings").values, [153200, 154700, 156200]);
  assert.deepEqual(row(prepared.sections, "Balance sheet", "Total assets").values, [174470, 169410, 157960]);
  assert.deepEqual(row(prepared.sections, "Balance sheet", "Total liabilities and equity").values, [174470, 169410, 157960]);

  const february = prepared.sections.find((section) => section.presentation === "ecommerce").rows[1];
  assert.equal(february.values[3], 1330 / 268000);
  assert.equal(february.values[4], Math.round((3900 / 1330) * 100) / 100);
  assert.equal(february.values[8], 62 / 1260);
  assert.equal(february.values[9], 16850 / 3900);
  assert.equal(february.values[10], Math.round((3900 / 62) * 100) / 100);
  assert.equal(february.values[11], Math.round((16850 / 62) * 100) / 100);
  const january = prepared.sections.find((section) => section.presentation === "ecommerce").rows[0];
  assert.equal(january.values[3], 1425 / 285000);
  assert.equal(january.values[4], 2.95);

  assert.deepEqual(validateReport(prepared.sections, "2026-12"), []);
  const again = prepareReport(prepared.sections, "2026-12");
  assert.deepEqual(again.sections, prepared.sections);
  assert.deepEqual(again.warnings, []);
});

test("a total that does not add up, an unbalanced sheet, and a blank total are warned", () => {
  const warnings = validateReport([
    {
      title: "Profit and loss",
      note: "For the month ended 31 December 2026",
      columns: ["Dec 2026"],
      rows: [
        { kind: "heading", label: "Net revenue" },
        { kind: "line", label: "Sales", values: [10] },
        { kind: "total", label: "Total net revenue", values: [12] },
      ],
    },
    {
      title: "Balance sheet",
      note: "As at 31 December 2026",
      columns: ["31 Dec 2026"],
      rows: [
        { kind: "heading", label: "Current assets" },
        { kind: "line", label: "Bank", values: [10] },
        { kind: "total", label: "", values: [10] },
        { kind: "total", label: "Total assets", values: [100] },
        { kind: "total", label: "Total liabilities and equity", values: [90] },
      ],
    },
  ], "2026-12");
  assert.ok(warnings.some((warning) => warning.includes("Total net revenue") && warning.includes("expected 10") && warning.includes("found 12")));
  assert.ok(warnings.some((warning) => warning.includes("no label") && warning.includes("Current assets")));
  assert.ok(warnings.some((warning) => warning.includes("assets do not equal liabilities and equity")));
});

test("blank totals outside the cash-flow groups are not given a label", () => {
  const prepared = prepareReport([
    {
      title: "Balance sheet",
      note: "As at 31 December 2026",
      columns: ["31 Dec 2026"],
      rows: [
        { kind: "heading", label: "CURRENT ASSETS" },
        { kind: "line", label: "Bank", values: [10] },
        { kind: "total", label: "", values: [10] },
      ],
    },
  ], "2026-12");
  assert.equal(prepared.sections[0].rows[2].label, "");
  assert.ok(prepared.warnings.some((warning) => warning.includes("no label")));
});

test("notes that already name the report month are left as written", () => {
  const sections = [
    { title: "Statement of cash flows", note: "For the month ended 30 November 2026", columns: [], rows: [] },
    { title: "Balance sheet", note: "As at October 31, 2026", columns: [], rows: [] },
  ];
  const november = prepareReport(sections, "2026-11");
  assert.equal(november.sections[0].note, "For the month ended 30 November 2026");
  const october = prepareReport([sections[1]], "2026-10");
  assert.equal(october.sections[0].note, "As at October 31, 2026");
});

test("ecommerce ratios warn when a divisor is zero and the stored ratio is left", () => {
  const sections = [{
    title: "E-commerce report",
    presentation: "ecommerce",
    columns: ["Ad Spend (Google Ads)", "Impressions", "Clicks", "CTR"],
    rows: [{ month: "Mar 2026", values: [100, 0, 0, 0.005] }],
  }];
  const prepared = prepareReport(sections, "2026-12");
  assert.equal(prepared.sections[0].rows[0].values[3], 0.005);
  assert.ok(prepared.warnings.some((warning) => warning.includes("CTR") && warning.includes("zero")));
});

test("Plas-Yn-Grove keeps its figures and is flagged for review", () => {
  const sections = demoSections();
  const original = structuredClone(sections);
  assert.equal(preserveReportFigures({
    businessName: "Plas-Yn-Grove Farm",
    templateKey: "copy-4f8c11f1b756",
    reportTemplate: "purple-hat-demo",
  }), true);
  const prepared = prepareReport(sections, "2026-12", { preserveFigures: true });
  assert.deepEqual(prepared.sections, original);
  assert.ok(prepared.warnings.some((warning) => warning.includes("30 April 2026")));
  assert.deepEqual(templateReviewWarnings({
    name: "Plas-Yn-Grove Farm",
    key: "copy-4f8c11f1b756",
    reportTemplate: "purple-hat-demo",
  }), [
    "Plas-Yn-Grove Farm is a UK GAAP client but this template uses US labels copied from Purple Hat Demo. Review it before using the template. Figures were not changed.",
  ]);
  assert.deepEqual(templateReviewWarnings({
    name: "Purple Hat Demo",
    key: "purple-hat-demo",
    reportTemplate: "purple-hat-demo",
  }), []);
  assert.equal(preserveReportFigures({
    businessName: "WealthTech (Pty) Ltd",
    reportTemplate: "wealth-tech",
  }), true);
});
