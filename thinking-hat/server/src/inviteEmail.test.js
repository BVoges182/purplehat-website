import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInviteMessage,
  deliverInviteEmail,
  displayInviteStatus,
  duplicateSendError,
  pickUserInvite,
  isInviteEmail,
  publicMailStatus,
  readMailConfig,
  recordDelivery,
  resendBlock,
  safeErrorText,
} from "./inviteEmail.js";

const resendEnv = {
  EMAIL_API_KEY: "re_test_secret_key",
  EMAIL_FROM: "info@purplehat.fun",
  EMAIL_FROM_NAME: "Purple Hat",
};

test("mail config uses the Hostinger mailbox when it is set, otherwise Resend", () => {
  const missing = readMailConfig({});
  assert.equal(missing.configured, false);
  assert.deepEqual(missing.missing, ["EMAIL_FROM", "EMAIL_API_KEY"]);
  assert.equal(publicMailStatus(missing).warning.includes("EMAIL_API_KEY"), true);
  assert.equal(JSON.stringify(publicMailStatus(missing)).includes("re_"), false);

  const smtp = readMailConfig({
    ...resendEnv,
    SMTP_PASSWORD: "mailbox-secret",
    SMTP_USER: "info@purplehat.fun",
    SMTP_FROM: "Purple Hat <info@purplehat.fun>",
  });
  assert.equal(smtp.configured, true);
  assert.equal(smtp.provider, "smtp");
  assert.equal(publicMailStatus(smtp).warning, "");
  assert.equal(JSON.stringify(publicMailStatus(smtp)).includes("mailbox-secret"), false);
  assert.equal(JSON.stringify(publicMailStatus(smtp)).includes("re_test_secret_key"), false);

  const resend = readMailConfig(resendEnv);
  assert.equal(resend.provider, "resend");
  assert.equal(resend.fromAddress, "info@purplehat.fun");
  assert.equal(resend.fromName, "Purple Hat");
});

test("email validation rejects blank and broken addresses", () => {
  assert.equal(isInviteEmail("client@example.com"), true);
  assert.equal(isInviteEmail("not-an-email"), false);
  assert.equal(isInviteEmail("a@b"), false);
  assert.equal(isInviteEmail("two people@example.com"), false);
  assert.equal(isInviteEmail(""), false);
});

test("invite message includes the link, client, expiry, and sign-in steps", () => {
  const message = buildInviteMessage({
    code: "TH-ABCD-EFGH",
    label: "North <Quay>",
    email: "client@example.com",
    expiresAt: "2026-11-03T12:00:00.000Z",
    origin: "https://purplehat.fun",
    approveOnUse: true,
  });
  assert.equal(message.subject, "Your Purple Hat invite");
  assert.match(message.text, /https:\/\/purplehat\.fun\/register\?key=TH-ABCD-EFGH/);
  assert.match(message.text, /North <Quay>/);
  assert.match(message.text, /3 November 2026/);
  assert.match(message.text, /How to sign in/);
  assert.match(message.text, /https:\/\/purplehat\.fun\/login/);
  assert.match(message.text, /TH-ABCD-EFGH/);
  assert.match(message.html, /North &lt;Quay&gt;/);
  assert.doesNotMatch(message.html, /North <Quay>/);
});

test("invite status is pending, sent, accepted, or expired", () => {
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  assert.equal(displayInviteStatus({ status: "active" }, now), "pending");
  assert.equal(displayInviteStatus({ status: "active", email_sent_at: "2026-10-01T00:00:00.000Z" }, now), "sent");
  assert.equal(displayInviteStatus({ status: "used", email_sent_at: "2026-10-01T00:00:00.000Z" }, now), "accepted");
  assert.equal(displayInviteStatus({ status: "active", email_sent_at: "2026-10-01T00:00:00.000Z", expires_at: "2026-10-19T00:00:00.000Z" }, now), "expired");
  assert.equal(displayInviteStatus({ status: "used", expires_at: "2026-10-19T00:00:00.000Z" }, now), "accepted");
  assert.equal(displayInviteStatus({ status: "revoked" }, now), "revoked");
});

test("the client view prefers an open invite over an older accepted one", () => {
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  const user = { id: 6, email: "demo@purplehat.fun" };
  const rows = [
    { id: 25, email: "demo@purplehat.fun", status: "active", used_by: null },
    { id: 7, email: "demo@purplehat.fun", status: "used", used_by: 6 },
  ];
  assert.equal(pickUserInvite(user, rows, now).id, 25);
  assert.equal(pickUserInvite(user, [rows[1]], now).id, 7);
  assert.equal(pickUserInvite({ id: 3, email: "other@example.com" }, rows, now), null);
});

test("a second send to an open invite is refused", () => {
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  const invites = [{
    email: "Client@Example.com",
    status: "active",
    email_sent_at: "2026-10-18T00:00:00.000Z",
    expires_at: "2026-11-01T00:00:00.000Z",
  }];
  assert.match(duplicateSendError(invites, "client@example.com", now), /already sent/);
  assert.equal(duplicateSendError(invites, "other@example.com", now), "");
  assert.equal(duplicateSendError([{ ...invites[0], status: "used" }], "client@example.com", now), "");
  assert.match(duplicateSendError([{ ...invites[0], email_sent_at: null }], "client@example.com", now), /already waiting/);
  assert.equal(duplicateSendError([{ ...invites[0], expires_at: "2026-10-01T00:00:00.000Z" }], "client@example.com", now), "");
});

test("resend is allowed for pending and sent invites, and blocks a duplicate click", () => {
  const now = Date.parse("2026-10-20T12:00:00.000Z");
  const sent = { status: "active", email: "client@example.com", email_sent_at: "2026-10-20T11:00:00.000Z" };
  assert.equal(resendBlock(sent, now), "");
  assert.equal(resendBlock({ status: "active", email: "client@example.com" }, now), "");
  assert.match(resendBlock({ ...sent, email_sent_at: "2026-10-20T11:59:55.000Z" }, now), /just sent/);
  assert.match(resendBlock({ status: "used", email: "client@example.com" }, now), /accepted/);
  assert.match(resendBlock({ status: "active", email: "client@example.com", expires_at: "2026-10-01T00:00:00.000Z" }, now), /expired/);
  assert.match(resendBlock({ status: "revoked", email: "client@example.com" }, now), /revoked/);
});

test("mocked Resend send succeeds and a failure still reports a saved key without secrets", async () => {
  const config = readMailConfig(resendEnv);
  const message = buildInviteMessage({
    code: "TH-ABCD-EFGH",
    label: "Harbour Stores",
    email: "client@example.com",
    expiresAt: "2026-11-03T00:00:00.000Z",
    origin: "https://purplehat.fun",
  });
  let called = null;
  const ok = await deliverInviteEmail({
    to: "client@example.com",
    message,
    config,
    fetchImpl: async (url, options) => {
      called = { url, options };
      return { ok: true, json: async () => ({ id: "email_1" }) };
    },
    logger: { error() {} },
  });
  assert.equal(ok.ok, true);
  assert.equal(called.url, "https://api.resend.com/emails");
  assert.equal(called.options.headers.Authorization, "Bearer re_test_secret_key");
  const body = JSON.parse(called.options.body);
  assert.equal(body.from, "Purple Hat <info@purplehat.fun>");
  assert.deepEqual(body.to, ["client@example.com"]);
  assert.match(body.text, /Harbour Stores/);
  assert.equal(recordDelivery(ok).emailSent, true);

  const logs = [];
  const failed = await deliverInviteEmail({
    to: "client@example.com",
    message,
    config,
    fetchImpl: async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: "Domain not verified. Key re_test_secret_key" }),
    }),
    logger: { error(line) { logs.push(line); } },
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /key was saved/i);
  assert.match(failed.error, /SPF and DKIM/);
  assert.equal(failed.error.includes("re_test_secret_key"), false);
  assert.equal(logs.join("\n").includes("re_test_secret_key"), false);
  const recorded = recordDelivery(failed);
  assert.equal(recorded.emailSent, false);
  assert.equal(recorded.clearSentAt, true);
  assert.match(recorded.emailError, /key was saved/i);

  const unconfigured = await deliverInviteEmail({
    to: "client@example.com",
    message,
    config: readMailConfig({}),
    fetchImpl: async () => { throw new Error("should not send"); },
  });
  assert.match(unconfigured.error, /key was saved/i);
  assert.match(unconfigured.error, /EMAIL_API_KEY/);
});

test("mail errors are logged without the API key or mailbox password", async () => {
  const config = readMailConfig({
    SMTP_PASSWORD: "mailbox-secret",
    SMTP_USER: "info@purplehat.fun",
    EMAIL_FROM: "info@purplehat.fun",
    EMAIL_FROM_NAME: "Purple Hat",
  });
  const logs = [];
  const result = await deliverInviteEmail({
    to: "client@example.com",
    message: buildInviteMessage({ code: "TH-ABCD-EFGH", label: "Harbour", email: "client@example.com", origin: "https://purplehat.fun" }),
    config,
    sendSmtp: async () => {
      throw new Error("535 auth failed mailbox-secret bearer re_live_secret");
    },
    logger: { error(line) { logs.push(line); } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.includes("mailbox-secret"), false);
  assert.equal(result.error.includes("re_live_secret"), false);
  assert.match(logs[0], /Invite email failed/);
  assert.equal(logs[0].includes("mailbox-secret"), false);
  assert.equal(safeErrorText("token re_abc12345", []).includes("re_abc12345"), false);
});
