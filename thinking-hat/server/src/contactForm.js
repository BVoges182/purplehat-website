import { isInviteEmail, safeErrorText } from "./inviteEmail.js";

export const CONTACT_TO = "info@purplehat.fun";
export const CONTACT_LIMIT = 5;
export const CONTACT_WINDOW_MS = 60 * 60 * 1000;
export const CONTACT_SUCCESS = "Thank you. We've received your message and will reply soon.";
export const CONTACT_WAIT = "Please wait a little while before sending another message.";
export const CONTACT_SEND_FAILED = "We could not send that just now. Please email info@purplehat.fun.";

const hits = new Map();

function textField(value, { keepBreaks = false } = {}) {
  if (typeof value !== "string") return { invalid: value != null, text: "", tooLong: false };
  const stripped = keepBreaks
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n/g, "\n")
    : value.replace(/[\u0000-\u001F\u007F]/g, " ");
  const text = stripped.replace(/[ \t]+/g, " ").trim();
  return { invalid: false, text, tooLong: false };
}

function limited(value, max, options) {
  const field = textField(value, options);
  if (field.invalid) return field;
  return { ...field, tooLong: field.text.length > max, text: field.text.slice(0, max) };
}

export function parseContact(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const honeypot = source.website;
  const spam = honeypot != null && honeypot !== false && String(honeypot).trim() !== "";
  const name = limited(source.name, 80);
  const email = limited(source.email, 120);
  const company = limited(source.company, 120);
  const message = limited(source.message, 4000, { keepBreaks: true });
  const fields = {};
  if (name.invalid || !name.text) fields.name = "Please tell us your name.";
  else if (name.tooLong) fields.name = "Please use a shorter name.";
  const emailText = email.text.toLowerCase();
  if (email.invalid || !isInviteEmail(emailText)) fields.email = "Enter a valid email so we can reply.";
  if (company.invalid || company.tooLong) fields.company = "Please use a shorter company name.";
  if (message.invalid || !message.text) fields.message = "Please write a short message.";
  else if (message.tooLong) fields.message = "Please use a shorter message.";
  return {
    spam,
    name: name.text,
    email: emailText,
    company: company.text,
    message: message.text,
    fields: Object.keys(fields).length ? fields : null,
  };
}

export function takeContactSlot(ip, now = Date.now()) {
  const key = String(ip || "unknown");
  const recent = (hits.get(key) || []).filter((time) => now - time < CONTACT_WINDOW_MS);
  if (recent.length >= CONTACT_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function releaseContactSlot(ip) {
  const key = String(ip || "unknown");
  const recent = hits.get(key);
  if (!recent?.length) return;
  recent.pop();
  hits.set(key, recent);
}

export function clearContactSlots() {
  hits.clear();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildContactMessage({ name, email, company, message }) {
  const companyLine = company ? `Company: ${company}` : "Company: not given";
  const subject = `Website message from ${name}`.slice(0, 140);
  const text = [
    "A message from the Purple Hat website.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    companyLine,
    "",
    message,
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f6f3ff;font-family:Georgia,serif;color:#2a1548;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#6d28d9;color:#ffffff;border-radius:20px 20px 0 0;padding:22px 28px;">
      <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Purple Hat</p>
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Website message</h1>
    </div>
    <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:28px;">
      <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="margin:0 0 16px;"><strong>Company:</strong> ${escapeHtml(company || "not given")}</p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html, replyTo: email };
}

export async function deliverContactMessage({ message, config, fetchImpl = fetch, sendSmtp, logger = console }) {
  if (!config?.configured) {
    logger.log(`Contact form (mail not configured):\n${message.text}`);
    return { ok: true, logged: true };
  }
  const secrets = [config.apiKey, config.smtpPassword].filter((item) => String(item || "").length >= 6);
  try {
    if (config.provider === "smtp") {
      await sendSmtp({ to: CONTACT_TO, message, config });
    } else {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${config.fromName || "Purple Hat"} <${config.fromAddress}>`,
          to: [CONTACT_TO],
          reply_to: message.replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        logger.error("Contact form email failed.");
        return { ok: false, logged: false };
      }
    }
    return { ok: true, logged: false };
  } catch (error) {
    logger.error(`Contact form email failed. ${safeErrorText(error, secrets)}`);
    return { ok: false, logged: false };
  }
}
