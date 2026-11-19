import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { buildContactMessage, deliverContactMessage } from "./contactForm.js";
import { buildInviteMessage, deliverInviteEmail } from "./inviteEmail.js";
import { rejectUnsafeMail, sendSmtpMail } from "./mail.js";
import { buildResetMessage, deliverResetEmail } from "./passwordReset.js";

const config = {
  configured: true,
  provider: "smtp",
  fromName: "Purple Hat",
  fromAddress: "info@purplehat.fun",
  smtpHost: "127.0.0.1",
  smtpPort: 2525,
  smtpUser: "mailer",
  smtpPassword: "smtp-test-secret",
};

const logger = { error() {}, log() {} };

function jsonTransport() {
  return nodemailer.createTransport({
    jsonTransport: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

async function sentPayload(info) {
  const text = Buffer.isBuffer(info.message) ? info.message.toString("utf8") : String(info.message);
  return JSON.parse(text);
}

test("smtp mail rejects oversized recipient lists, long addresses, and raw input", async () => {
  const message = { subject: "Hello", text: "Hello", html: "<p>Hello</p>" };
  assert.match(rejectUnsafeMail({ to: ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com", "f@example.com"], message }), /too many recipients/i);
  assert.match(rejectUnsafeMail({ to: `${"a".repeat(121)}@example.com`, message }), /valid email/i);
  assert.match(rejectUnsafeMail({ to: "one@example.com", message: { ...message, raw: "From: evil\r\n\r\n" } }), /cannot be sent/i);
  await assert.rejects(
    () => sendSmtpMail({ to: "one@example.com", message: { ...message, attachments: [{ path: "C:\\secret.txt" }] }, config }),
    /cannot be sent/i,
  );
});

test("invite, password reset, and contact mail use jsonTransport without file or url access", async () => {
  const transport = jsonTransport();
  const sent = [];
  const sendSmtp = async ({ to, message, config: mailConfig }) => {
    const problem = rejectUnsafeMail({ to, message });
    if (problem) throw new Error(problem);
    const info = await transport.sendMail({
      from: "Purple Hat <info@purplehat.fun>",
      to,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const payload = await sentPayload(info);
    sent.push(payload);
    assert.equal(payload.raw, undefined);
    assert.equal(payload.attachments, undefined);
    assert.equal(payload.href, undefined);
    assert.equal(mailConfig.disableFileAccess, undefined);
    await sendSmtpMail({ to, message, config: mailConfig, transport });
  };

  const invite = await deliverInviteEmail({
    to: "client@example.com",
    message: buildInviteMessage({ code: "invite-key", label: "North Co", email: "client@example.com", origin: "https://purplehat.fun" }),
    config,
    sendSmtp,
    logger,
  });
  const reset = await deliverResetEmail({
    to: "client@example.com",
    message: buildResetMessage({ origin: "https://purplehat.fun", token: "reset-token" }),
    config,
    sendSmtp,
    logger,
  });
  const contactMessage = buildContactMessage({ name: "Ada", email: "ada@example.com", company: "North Co", message: "Hello" });
  const contact = await deliverContactMessage({
    message: contactMessage,
    config,
    sendSmtp,
    logger,
  });

  assert.equal(invite.ok, true);
  assert.equal(reset.ok, true);
  assert.equal(contact.ok, true);
  assert.deepEqual(sent.map((item) => item.subject), [
    "Your Purple Hat invite",
    "Reset your Purple Hat password",
    contactMessage.subject,
  ]);
  assert.equal(sent.some((item) => item.raw || item.attachments || item.href), false);
});
