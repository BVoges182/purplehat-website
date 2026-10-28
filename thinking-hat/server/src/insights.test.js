import assert from "node:assert/strict";
import test from "node:test";
import {
  botInsightsTitle,
  chooseInsightClient,
  createInsightLoader,
  driveFileId,
  grokBotInput,
  insightSource,
  insightsFileLabel,
  insightsFileSource,
  parseFinancialInsights,
  parseInsights,
} from "./insights.js";

const brief = {
  updated: "2026-10-18",
  client: "PurpleHat Demo, LLC",
  headline: "Cash is healthy.",
  findings: [
    { title: "One", detail: "First finding.", source_url: "https://purplehat.fun/a" },
    { title: "Two", detail: "Second finding.", source_url: "javascript:alert(1)" },
  ],
  actions: ["Call the customer."],
};

test("parses a weekly insights brief and drops unsafe links", () => {
  const parsed = parseInsights(brief);
  assert.equal(parsed.updated, "2026-10-18");
  assert.equal(parsed.headline, "Cash is healthy.");
  assert.equal(parsed.findings[0].sourceUrl, "https://purplehat.fun/a");
  assert.equal(parsed.findings[1].sourceUrl, "");
  assert.deepEqual(parsed.actions, ["Call the customer."]);
});

test("client-facing brief text does not keep John McEnroe's name", () => {
  const parsed = parseInsights({
    ...brief,
    title: "John McEnroe's insights",
    headline: "John McEnroe checked the cash.",
    joke: "John McEnroe would say you cannot be serious.",
    findings: [{ title: "Note from John McEnroe", detail: "John McEnroe looked at receivables." }],
    actions: ["Ask John McEnroe to review."],
    financial: {
      updated: "2026-10-20",
      headline: "John McEnroe sees the month.",
      receivables: { total: 1, note: "John McEnroe: 30 days." },
      trends: ["John McEnroe: expenses held."],
    },
  });
  assert.equal(parsed.title, "Purple Hat insights");
  assert.equal(parsed.headline, "Purple Hat checked the cash.");
  assert.equal(parsed.joke, "Purple Hat would say you cannot be serious.");
  assert.equal(parsed.findings[0].title, "Note from Purple Hat");
  assert.equal(parsed.findings[0].detail, "Purple Hat looked at receivables.");
  assert.deepEqual(parsed.actions, ["Ask Purple Hat to review."]);
  assert.equal(parsed.financial.headline, "Purple Hat sees the month.");
  assert.equal(parsed.financial.receivables.note, "Purple Hat: 30 days.");
  assert.deepEqual(parsed.financial.trends, ["Purple Hat: expenses held."]);
});

test("reads an optional title and joke, and leaves them out when blank", () => {
  const parsed = parseInsights({
    ...brief,
    title: "  Andy Murray's insights  ",
    joke: "  Still cheaper\nthan parking.  ",
  });
  assert.equal(parsed.title, "Andy Murray's insights");
  assert.equal(parsed.joke, "Still cheaper than parking.");

  const plain = parseInsights(brief);
  assert.equal(Object.hasOwn(plain, "title"), false);
  assert.equal(Object.hasOwn(plain, "joke"), false);

  const blank = parseInsights({ ...brief, title: "   ", joke: "" });
  assert.equal(Object.hasOwn(blank, "title"), false);
  assert.equal(Object.hasOwn(blank, "joke"), false);

  const long = parseInsights({ ...brief, joke: "a".repeat(500) });
  assert.equal(long.joke.length, 400);
});

test("keeps a nested financial brief and ignores a bad one", () => {
  const parsed = parseInsights({
    ...brief,
    financial: {
      updated: "2026-10-21",
      period: "Sep 2026",
      headline: "A short month.",
      receivables: { total: 3000, overdue: 0, note: "Unchanged." },
      payables: { total: 2867, overdue: 2807 },
      current_month: ["One"],
      trends: ["Two"],
      actions: ["Three"],
    },
  });
  assert.equal(parsed.headline, "Cash is healthy.");
  assert.equal(parsed.financial.period, "Sep 2026");
  assert.equal(parsed.financial.receivables.total, 3000);
  assert.equal(parsed.financial.receivables.overdue, 0);
  assert.equal(parsed.financial.payables.overdue, 2807);
  assert.deepEqual(parsed.financial.currentMonth, ["One"]);
  assert.deepEqual(parsed.financial.trends, ["Two"]);
  assert.deepEqual(parsed.financial.actions, ["Three"]);

  const plain = parseInsights(brief);
  assert.equal(Object.hasOwn(plain, "financial"), false);

  const broken = parseInsights({ ...brief, financial: { headline: "no date" } });
  assert.equal(broken.headline, "Cash is healthy.");
  assert.equal(Object.hasOwn(broken, "financial"), false);
});

test("rejects a brief without a headline or date", () => {
  assert.throws(() => parseInsights({ updated: "2026-10-18", findings: [] }));
  assert.throws(() => parseInsights({ updated: "18 October 2026", headline: "Hello" }));
});

test("reads a Drive id from a file id, a drive prefix, or a share link", () => {
  assert.equal(driveFileId("1AbCDefGhijkLmNoPq"), "1AbCDefGhijkLmNoPq");
  assert.equal(driveFileId("drive:abc1234567890"), "abc1234567890");
  assert.equal(driveFileId("https://drive.google.com/file/d/FILEID123456/view"), "FILEID123456");
  assert.equal(driveFileId("https://drive.google.com/open?id=FILEID123456"), "FILEID123456");
  assert.equal(driveFileId("sample:purple-hat-demo"), "");
});

test("saves a Drive file id from an id, a prefix, or a share link", () => {
  assert.equal(insightsFileSource("1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO"), "drive:1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO");
  assert.equal(insightsFileSource("drive:abc1234567890"), "drive:abc1234567890");
  assert.equal(insightsFileSource("https://drive.google.com/file/d/FILEID123456/view"), "drive:FILEID123456");
  assert.equal(insightsFileSource("  "), "");
  assert.equal(insightsFileSource("not an id"), null);
  assert.equal(insightsFileLabel("drive:abc1234567890"), "abc1234567890");
});

test("names the card from the assigned bot and accepts a Drive file id", () => {
  assert.equal(botInsightsTitle("Andy Murray"), "Purple Hat insights");
  assert.equal(botInsightsTitle("John McEnroe"), "Purple Hat insights");
  assert.equal(botInsightsTitle("  "), "");
  assert.equal(insightSource({ id: 6, bot_source: "drive:abc1234567890", insights_source: "drive:other" }), "drive:abc1234567890");
  assert.equal(insightSource({ id: 3, insights_source: "drive:abc1234567890" }), "");
  const saved = grokBotInput({ name: " Andy Murray ", fileId: "1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO" });
  assert.equal(saved.value.name, "Andy Murray");
  assert.equal(saved.value.insightsSource, "drive:1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO");
  assert.equal(grokBotInput({ name: "", fileId: "1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO" }).error, "Name the bot.");
  assert.equal(grokBotInput({ name: "Andy Murray", fileId: "not an id" }).error, "Enter a Google Drive file ID.");
});

test("a signed-in client uses the builder client that has the bot", () => {
  const plas = {
    client_id: 3,
    user_id: null,
    client_name: "Plas yn Grove Farm",
    grok_bot_id: 1,
    name: "Andy Murray",
    insights_source: "drive:1i8mJ2vnpwpK8Z0m0XUjwkF6ecfDkUWDO",
    currency: "GBP",
  };
  const duplicate = {
    client_id: 9,
    user_id: 24,
    client_name: "Plas-Yn-Grove Farm",
    grok_bot_id: null,
    name: null,
    insights_source: "",
    currency: "GBP",
  };
  const demo = {
    client_id: 2,
    user_id: 6,
    client_name: "PurpleHat Demo, LLC",
    grok_bot_id: 3,
    name: "Purple Hat",
    insights_source: "drive:1HhuQmZx_kqSzQJrkBWll6M2QmmqeQnkL",
    currency: "USD",
  };
  const other = {
    client_id: 4,
    user_id: 30,
    client_name: "Plas-Yn-Grove Farm",
    grok_bot_id: 8,
    name: "Someone",
    insights_source: "drive:otherfile123456",
    currency: "GBP",
  };
  const user = { id: 24, business_name: "Plas-Yn-Grove Farm", template_client_id: 3 };
  const choice = chooseInsightClient(user, [duplicate, plas, demo, other]);
  assert.equal(choice.via, "template");
  assert.equal(choice.chosen.client_id, 3);
  assert.equal(choice.chosen.insights_source, plas.insights_source);

  const byName = chooseInsightClient({ id: 24, business_name: "Plas-Yn-Grove Farm" }, [duplicate, plas, demo, other]);
  assert.equal(byName.via, "name");
  assert.equal(byName.chosen.client_id, 3);

  const own = chooseInsightClient({ id: 6, business_name: "PurpleHat Demo, LLC" }, [duplicate, plas, demo, other]);
  assert.equal(own.via, "user");
  assert.equal(own.chosen.client_id, 2);
});

test("caches a fetched brief for an hour and keeps clients apart", async () => {
  let clock = 1_000;
  const calls = [];
  const loader = createInsightLoader({
    now: () => clock,
    fetchImpl: async (url) => {
      calls.push(url);
      const client = url.endsWith("wealth.json") ? "WealthTech" : "Demo";
      return new Response(JSON.stringify({ ...brief, client }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const demo = { id: 6, bot_name: "Andy Murray", bot_source: "https://files.example/demo.json" };
  const wealth = { id: 3, bot_name: "Other Bot", bot_source: "https://files.example/wealth.json" };
  const first = await loader.load(demo);
  const second = await loader.load(demo);
  const other = await loader.load(wealth);
  assert.equal(first.botName, "Andy Murray");
  assert.equal(first.insights.client, "Demo");
  assert.equal(second.insights.headline, first.insights.headline);
  assert.equal(other.botName, "Other Bot");
  assert.equal(other.insights.client, "WealthTech");
  assert.equal(calls.length, 2);
  clock += 60 * 60 * 1000 + 1;
  await loader.load(demo);
  assert.equal(calls.length, 3);
});

test("a Drive file is read again on every load and is not stored", async () => {
  const calls = [];
  const loader = createInsightLoader({
    fetchImpl: async (url, options) => {
      calls.push({ url, cache: options?.cache, control: options?.headers?.["Cache-Control"] });
      return new Response(JSON.stringify({ ...brief, joke: "You cannot be serious." }), { status: 200 });
    },
  });
  const user = { id: 6, bot_name: "John McEnroe", bot_source: "drive:1HhuQmZx_kqSzQJrkBWll6M2QmmqeQnkL" };
  const first = await loader.load(user);
  const second = await loader.load(user);
  assert.equal(first.insights.joke, "You cannot be serious.");
  assert.equal(second.insights.joke, "You cannot be serious.");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /export=download&id=1HhuQmZx_kqSzQJrkBWll6M2QmmqeQnkL&cb=\d+/);
  assert.match(calls[1].url, /&cb=\d+/);
  assert.equal(calls[0].cache, "no-store");
  assert.equal(calls[0].control, "no-store");
  assert.equal(loader.cache.size, 0);
});

test("a missing file stays empty without inventing a brief", async () => {
  const loader = createInsightLoader({
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  const missing = await loader.load({ id: 24, business_name: "Plas-Yn-Grove Farm" });
  assert.deepEqual(missing, { configured: false, botName: null, insights: null, error: "" });

  const broken = createInsightLoader({
    fetchImpl: async () => new Response("<html>sign in</html>", { status: 200 }),
  });
  const failed = await broken.load({ id: 6, bot_name: "Andy Murray", bot_source: "https://files.example/missing.json" });
  assert.equal(failed.configured, true);
  assert.equal(failed.botName, "Andy Murray");
  assert.equal(failed.insights, null);
  assert.equal(failed.error, "Couldn't load insights");

  const empty = createInsightLoader({
    fetchImpl: async () => new Response("", { status: 404 }),
  });
  const blank = await empty.load({ id: 6, bot_name: "Andy Murray", bot_source: "https://files.example/missing.json" });
  assert.equal(blank.insights, null);
  assert.equal(blank.error, "");
});

test("parses a financial insights file and drops blank lines", () => {
  const parsed = parseFinancialInsights({
    updated: "2026-10-20",
    title: " Financial insights ",
    period: " December 2026 ",
    headline: " Overdue is small. ",
    receivables: { total: "12,500", overdue: 1900, note: " 30 days. " },
    payables: { total: 8400, overdue: 1300 },
    current_month: [" Revenue held up. ", ""],
    trends: [{ text: " Expenses stayed below revenue. " }],
    actions: [" Chase the 30-day book. "],
  });
  assert.equal(parsed.title, "Financial insights");
  assert.equal(parsed.period, "December 2026");
  assert.equal(parsed.headline, "Overdue is small.");
  assert.equal(parsed.receivables.total, 12500);
  assert.equal(parsed.receivables.overdue, 1900);
  assert.equal(parsed.receivables.note, "30 days.");
  assert.equal(parsed.payables.total, 8400);
  assert.deepEqual(parsed.currentMonth, ["Revenue held up."]);
  assert.deepEqual(parsed.trends, ["Expenses stayed below revenue."]);
  assert.deepEqual(parsed.actions, ["Chase the 30-day book."]);
});

test("rejects a financial file without an updated date", () => {
  assert.throws(() => parseFinancialInsights({ headline: "Hello", receivables: { total: 1 } }));
  assert.throws(() => parseFinancialInsights({ updated: "20 October 2026", headline: "Hello" }));
});

test("the Purple Hat financial sample is a valid brief", async () => {
  const loader = createInsightLoader({ parse: parseFinancialInsights });
  const result = await loader.load({ id: 6, bot_source: "sample:purple-hat-financial" });
  assert.equal(result.configured, true);
  assert.equal(result.insights.title, "Financial insights");
  assert.equal(result.insights.period, "December 2026");
  assert.equal(result.insights.receivables.overdue, 1900);
  assert.equal(result.insights.payables.total, 8400);
  assert.ok(result.insights.currentMonth.length >= 1);
  assert.ok(result.insights.actions.length >= 1);
});

test("the Purple Hat Demo sample file is a valid brief", async () => {
  const loader = createInsightLoader();
  const result = await loader.load({ id: 6, bot_name: "Andy Murray", bot_source: "sample:purple-hat-demo" });
  assert.equal(result.configured, true);
  assert.equal(result.botName, "Andy Murray");
  assert.equal(result.insights.client, "PurpleHat Demo, LLC");
  assert.equal(result.insights.title, "Andy Murray's insights");
  assert.match(result.insights.joke, /surplus/);
  assert.ok(result.insights.findings.length >= 5);
  assert.ok(result.insights.actions.length >= 1);
  assert.match(result.insights.updated, /^\d{4}-\d{2}-\d{2}$/);
});
