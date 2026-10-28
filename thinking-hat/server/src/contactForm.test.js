import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_LIMIT,
  CONTACT_SEND_FAILED,
  CONTACT_SUCCESS,
  CONTACT_TO,
  CONTACT_WAIT,
  buildContactMessage,
  clearContactSlots,
  deliverContactMessage,
  parseContact,
  releaseContactSlot,
  takeContactSlot,
} from "./contactForm.js";

test("a contact message needs a name, a real email, and a message", () => {
  const missing = parseContact({});
  assert.equal(missing.spam, false);
  assert.equal(missing.fields.name, "Please tell us your name.");
  assert.equal(missing.fields.email, "Enter a valid email so we can reply.");
  assert.equal(missing.fields.message, "Please write a short message.");
  assert.equal(missing.fields.company, undefined);

  const badEmail = parseContact({ name: "Ada", email: "not-an-email", message: "Hello" });
  assert.equal(badEmail.fields.email, "Enter a valid email so we can reply.");

  const ready = parseContact({
    name: " Ada ",
    email: "Ada@Example.com",
    company: "",
    message: "Please tell me about monthly reports.",
  });
  assert.equal(ready.fields, null);
  assert.equal(ready.name, "Ada");
  assert.equal(ready.email, "ada@example.com");
  assert.equal(ready.company, "");
});

test("company is optional, and over-long fields are rejected", () => {
  const longName = parseContact({ name: "A".repeat(81), email: "ada@example.com", message: "Hello" });
  assert.equal(longName.fields.name, "Please use a shorter name.");
  const longCompany = parseContact({
    name: "Ada",
    email: "ada@example.com",
    company: "C".repeat(121),
    message: "Hello",
  });
  assert.equal(longCompany.fields.company, "Please use a shorter company name.");
  const longMessage = parseContact({
    name: "Ada",
    email: "ada@example.com",
    message: "M".repeat(4001),
  });
  assert.equal(longMessage.fields.message, "Please use a shorter message.");
});

test("a filled honeypot is treated as spam and is not a validation error", () => {
  const spam = parseContact({ website: "http://spam.test", name: "", email: "", message: "" });
  assert.equal(spam.spam, true);
  assert.ok(spam.fields);
  const clean = parseContact({ website: "   ", name: "Ada", email: "ada@example.com", message: "Hello" });
  assert.equal(clean.spam, false);
  assert.equal(clean.fields, null);
});

test("the same address can send five messages an hour, then has to wait", () => {
  clearContactSlots();
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  for (let i = 0; i < CONTACT_LIMIT; i += 1) {
    assert.equal(takeContactSlot("203.0.113.8", now + i), true);
  }
  assert.equal(takeContactSlot("203.0.113.8", now + 10), false);
  assert.equal(takeContactSlot("203.0.113.9", now + 10), true);
  releaseContactSlot("203.0.113.8");
  assert.equal(takeContactSlot("203.0.113.8", now + 11), true);
  assert.equal(takeContactSlot("203.0.113.8", now + CONTACT_WAIT.length + 60 * 60 * 1000), true);
  clearContactSlots();
});

test("the email keeps the reply address and escapes the message", () => {
  const message = buildContactMessage({
    name: "Ada <script>",
    email: "ada@example.com",
    company: "",
    message: "Hello\n<script>alert(1)</script>",
  });
  assert.equal(message.replyTo, "ada@example.com");
  assert.equal(message.subject, "Website message from Ada <script>");
  assert.match(message.text, /Company: not given/);
  assert.match(message.html, /Ada &lt;script&gt;/);
  assert.doesNotMatch(message.html, /<script>alert/);
  assert.equal(CONTACT_TO, "info@purplehat.fun");
  assert.match(CONTACT_SUCCESS, /received your message/);
  assert.match(CONTACT_WAIT, /wait/);
  assert.match(CONTACT_SEND_FAILED, /info@purplehat\.fun/);
});

test("mail that is not configured is logged and not sent", async () => {
  const lines = [];
  const result = await deliverContactMessage({
    message: buildContactMessage({ name: "Ada", email: "ada@example.com", company: "North", message: "Hello" }),
    config: { configured: false },
    sendSmtp: () => { throw new Error("should not send"); },
    logger: { log: (line) => lines.push(line), error() {} },
  });
  assert.equal(result.ok, true);
  assert.equal(result.logged, true);
  assert.match(lines[0], /mail not configured/);
  assert.match(lines[0], /Ada/);
});

test("a configured mailbox sends to info@purplehat.fun and hides secrets when it fails", async () => {
  const sent = [];
  const ok = await deliverContactMessage({
    message: buildContactMessage({ name: "Ada", email: "ada@example.com", company: "North", message: "Hello" }),
    config: {
      configured: true,
      provider: "smtp",
      smtpPassword: "mailbox-secret-value",
      fromAddress: "info@purplehat.fun",
      fromName: "Purple Hat",
    },
    sendSmtp: (payload) => { sent.push(payload); },
    logger: { log() {}, error() {} },
  });
  assert.equal(ok.ok, true);
  assert.equal(sent[0].to, "info@purplehat.fun");
  assert.equal(sent[0].message.replyTo, "ada@example.com");

  const errors = [];
  const failed = await deliverContactMessage({
    message: buildContactMessage({ name: "Ada", email: "ada@example.com", company: "", message: "Hello" }),
    config: {
      configured: true,
      provider: "smtp",
      smtpPassword: "mailbox-secret-value",
    },
    sendSmtp: () => { throw new Error("login failed for mailbox-secret-value"); },
    logger: { log() {}, error: (line) => errors.push(line) },
  });
  assert.equal(failed.ok, false);
  assert.match(errors[0], /\[redacted\]/);
  assert.doesNotMatch(errors[0], /mailbox-secret-value/);
});
