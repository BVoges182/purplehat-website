const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const RESEND_WAIT_MS = 15000;

export function isInviteEmail(value) {
  const email = String(value || "").trim();
  if (!email || email.length > 120 || /\s/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function addressFrom(value) {
  const raw = String(value || "").trim();
  const wrapped = raw.match(/<([^>]+)>/);
  const address = (wrapped ? wrapped[1] : raw).trim().toLowerCase();
  return isInviteEmail(address) ? address : "";
}

function firstAddress(...values) {
  for (const value of values) {
    const address = addressFrom(value);
    if (address) return address;
  }
  return "";
}

export function readMailConfig(env = process.env) {
  const apiKey = String(env.EMAIL_API_KEY || "").trim();
  const smtpPassword = String(env.SMTP_PASSWORD || "").trim();
  const smtpUser = String(env.SMTP_USER || env.ADMIN_EMAIL || "").trim();
  const fromAddress = firstAddress(env.EMAIL_FROM, env.SMTP_FROM, smtpUser);
  const fromName = String(env.EMAIL_FROM_NAME || "Purple Hat").replace(/[\r\n<>"]/g, "").trim() || "Purple Hat";
  const smtpHost = String(env.SMTP_HOST || "smtp.hostinger.com").trim() || "smtp.hostinger.com";
  const smtpPort = Number(env.SMTP_PORT || 465);
  const smtpReady = Boolean(smtpPassword && smtpUser && fromAddress && Number.isInteger(smtpPort) && smtpPort > 0);
  const resendReady = Boolean(apiKey && fromAddress);
  const missing = [];
  if (!fromAddress) missing.push("EMAIL_FROM");
  if (!smtpReady && !apiKey) missing.push("EMAIL_API_KEY");
  const base = { fromAddress, fromName, apiKey, smtpPassword, smtpUser, smtpHost, smtpPort };
  if (smtpReady) return { ...base, configured: true, provider: "smtp", missing: [] };
  if (resendReady) return { ...base, configured: true, provider: "resend", missing: [], smtpPassword: "" };
  return { ...base, configured: false, provider: "", missing };
}

export function missingMailMessage(config) {
  const missing = config?.missing || [];
  if (missing.includes("EMAIL_FROM") && missing.includes("EMAIL_API_KEY")) {
    return "Invite email is not set up. Add EMAIL_API_KEY, EMAIL_FROM (info@purplehat.fun), and EMAIL_FROM_NAME (Purple Hat). The Hostinger mailbox is used instead when SMTP_PASSWORD is set.";
  }
  if (missing.includes("EMAIL_FROM")) {
    return "Invite email needs EMAIL_FROM, for example info@purplehat.fun.";
  }
  if (missing.includes("EMAIL_API_KEY")) {
    return "Invite email is not set up. Add EMAIL_API_KEY, or set SMTP_PASSWORD to use the Hostinger mailbox.";
  }
  return "Invite email is not set up. Add EMAIL_API_KEY, EMAIL_FROM, and EMAIL_FROM_NAME.";
}

export function publicMailStatus(config) {
  return {
    configured: Boolean(config?.configured),
    provider: config?.configured ? config.provider : "",
    fromAddress: config?.fromAddress || "",
    fromName: config?.fromName || "Purple Hat",
    missing: config?.missing || [],
    warning: config?.configured ? "" : missingMailMessage(config),
  };
}

export function formatFrom(config) {
  const name = String(config?.fromName || "Purple Hat").replace(/[\r\n<>"]/g, "").trim() || "Purple Hat";
  return `${name} <${config.fromAddress}>`;
}

export function inviteLink(origin, code) {
  const base = String(origin || "https://purplehat.fun").replace(/\/$/, "");
  const url = new URL("/register", `${base}/`);
  url.searchParams.set("key", code);
  return url.toString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatExpiry(expiresAt) {
  if (!expiresAt) return "This invite does not expire.";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "This invite does not expire.";
  return `This invite expires on ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}.`;
}

export function buildInviteMessage({ code, label, email, expiresAt, origin, approveOnUse = true }) {
  const clientName = String(label || "your business").trim() || "your business";
  const site = String(origin || "https://purplehat.fun").replace(/\/$/, "");
  const link = inviteLink(site, code);
  const expiry = formatExpiry(expiresAt);
  const approval = approveOnUse
    ? "You can sign in as soon as the account is created."
    : "After you register, Purple Hat will approve the account before you can sign in.";
  const subject = "Your Purple Hat invite";
  const text = [
    `Hello,`,
    "",
    `Purple Hat invited you to Thinking Hat for ${clientName}.`,
    "",
    `Open this invite link to register:`,
    link,
    "",
    `Your invite key is ${code}.`,
    "",
    expiry,
    "",
    "How to sign in:",
    `1. Open the invite link, or go to ${site}/register and enter the invite key.`,
    `2. Create your account with ${email}.`,
    `3. Sign in at ${site}/login with that email and the password you chose.`,
    "",
    approval,
    "",
    "Kind regards",
    "Purple Hat",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;background:#f7f4ff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#2a1548;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#6d28d9;color:#ffffff;border-radius:20px 20px 0 0;padding:22px 28px;">
      <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Purple Hat</p>
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">You're invited to Thinking Hat</h1>
    </div>
    <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:28px;">
      <p style="margin:0 0 16px;">Purple Hat invited you to Thinking Hat for <strong>${escapeHtml(clientName)}</strong>.</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:700;">Open your invite</a></p>
      <p style="margin:0 0 8px;">Your invite key is</p>
      <p style="margin:0 0 16px;font-family:Consolas,monospace;font-size:20px;font-weight:700;color:#6d28d9;">${escapeHtml(code)}</p>
      <p style="margin:0 0 16px;">${escapeHtml(expiry)}</p>
      <p style="margin:0 0 8px;font-weight:700;">How to sign in</p>
      <ol style="margin:0 0 16px;padding-left:20px;">
        <li>Open the invite link, or go to ${escapeHtml(site)}/register and enter the invite key.</li>
        <li>Create your account with ${escapeHtml(email)}.</li>
        <li>Sign in at ${escapeHtml(site)}/login with that email and the password you chose.</li>
      </ol>
      <p style="margin:0 0 16px;">${escapeHtml(approval)}</p>
      <p style="margin:0;">Kind regards<br>Purple Hat</p>
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html };
}

export function displayInviteStatus(row, now = Date.now()) {
  if (!row) return "pending";
  if (row.status === "revoked") return "revoked";
  if (row.status === "used" || row.used_at) return "accepted";
  if (row.expires_at && Date.parse(row.expires_at) < now) return "expired";
  if (row.email_sent_at) return "sent";
  return "pending";
}

export function pickUserInvite(user, rows, now = Date.now()) {
  const email = String(user?.email || "").trim().toLowerCase();
  const userId = Number(user?.id);
  const related = (rows || []).filter((row) => Number(row.used_by) === userId || String(row.email || "").trim().toLowerCase() === email);
  const rank = { pending: 0, sent: 0, accepted: 1, expired: 2, revoked: 3 };
  related.sort((a, b) => (rank[displayInviteStatus(a, now)] ?? 9) - (rank[displayInviteStatus(b, now)] ?? 9) || Number(b.id) - Number(a.id));
  return related[0] || null;
}

export function openInviteForEmail(invites, email, now = Date.now()) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  return (invites || []).find((row) => {
    if (String(row.email || "").trim().toLowerCase() !== target) return false;
    if (row.status !== "active") return false;
    if (row.expires_at && Date.parse(row.expires_at) < now) return false;
    return true;
  }) || null;
}

export function duplicateSendError(invites, email, now = Date.now()) {
  const open = openInviteForEmail(invites, email, now);
  if (!open) return "";
  if (open.email_sent_at) {
    return "An invite was already sent to this address. Use Resend invite. Another email was not sent.";
  }
  return "An invite is already waiting for this address. Use Resend invite instead of sending another email.";
}

export function resendBlock(invite, now = Date.now()) {
  if (!invite) return "That key was not found.";
  const status = displayInviteStatus(invite, now);
  if (status === "accepted") return "This invite was already accepted.";
  if (status === "expired") return "This invite has expired. Create a new key.";
  if (status === "revoked") return "This invite was revoked.";
  if (!isInviteEmail(invite.email)) return "This invite has no email address to send to.";
  if (invite.email_sent_at) {
    const sent = Date.parse(invite.email_sent_at);
    if (Number.isFinite(sent) && now - sent < RESEND_WAIT_MS) {
      return "That invite was just sent. Wait a moment before sending it again.";
    }
  }
  return "";
}

export function savedButUnsent(reason) {
  const detail = String(reason || "The email could not be sent.").trim();
  return `The key was saved, but the email was not sent. ${detail}`;
}

function secretsOf(config) {
  return [config?.apiKey, config?.smtpPassword].filter((item) => String(item || "").length >= 6);
}

export function safeErrorText(error, secrets = []) {
  let text = error instanceof Error ? error.message : String(error || "The email could not be sent.");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text
    .replace(/re_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function providerFailure(status, body, secrets) {
  const message = safeErrorText(body?.message || body?.error || "", secrets);
  if (status === 401 || status === 403) return "The email provider refused the API key. Check EMAIL_API_KEY.";
  if (/domain|verif|dns|spf|dkim/i.test(message)) {
    return "The email provider has not verified purplehat.fun yet. Add the SPF and DKIM records, then use Resend invite.";
  }
  if (message && !/key|password|secret|token/i.test(message)) return `The email provider rejected the message. ${message}`;
  return "The email provider rejected the message.";
}

export function recordDelivery(delivery) {
  if (delivery?.ok) return { emailSent: true, emailError: "", clearSentAt: false };
  return {
    emailSent: false,
    emailError: delivery?.error || savedButUnsent("The email could not be sent."),
    clearSentAt: true,
  };
}

export async function deliverInviteEmail({ to, message, config, fetchImpl = fetch, sendSmtp, logger = console }) {
  const secrets = secretsOf(config);
  if (!isInviteEmail(to)) {
    return { ok: false, error: savedButUnsent("Enter a valid email address.") };
  }
  if (!config?.configured) {
    return { ok: false, error: savedButUnsent(missingMailMessage(config)) };
  }
  try {
    if (config.provider === "smtp") {
      await sendSmtp({ to, message, config });
    } else {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: formatFrom(config),
          to: [to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = savedButUnsent(providerFailure(response.status, body, secrets));
        logger.error(`Invite email failed. ${safeErrorText(error, secrets)}`);
        return { ok: false, error };
      }
    }
    return { ok: true, error: "" };
  } catch (error) {
    const safe = safeErrorText(error, secrets);
    logger.error(`Invite email failed. ${safe}`);
    return { ok: false, error: savedButUnsent(safe || "The email provider could not be reached.") };
  }
}
