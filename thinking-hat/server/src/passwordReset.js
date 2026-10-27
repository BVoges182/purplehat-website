import crypto from "node:crypto";
import { formatFrom, isInviteEmail, safeErrorText } from "./inviteEmail.js";

export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESET_LIMIT = 3;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const RESET_MESSAGE = "If that email is registered, we've sent a reset link.";
export const RESET_INVALID = "This reset link is invalid or has expired.";
export const PASSWORD_UPDATED = "Password updated, please sign in.";

export function newResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function resetExpiry(now = Date.now()) {
  return new Date(now + RESET_TTL_MS).toISOString();
}

export function requestsInWindow(timestamps, now = Date.now()) {
  return (timestamps || []).filter((value) => {
    const at = Date.parse(value);
    return Number.isFinite(at) && now - at < RESET_WINDOW_MS;
  }).length;
}

export function canRequestReset(timestamps, now = Date.now()) {
  return requestsInWindow(timestamps, now) < RESET_LIMIT;
}

export function planResetRequest({ recentTimestamps, userId, now = Date.now() }) {
  if (!canRequestReset(recentTimestamps, now)) {
    return { message: RESET_MESSAGE, record: false, create: false, userId: null };
  }
  return {
    message: RESET_MESSAGE,
    record: true,
    create: Boolean(userId),
    userId: userId || null,
  };
}

export function passwordProblem(password, confirm) {
  const next = String(password || "");
  if (next.length < 8) return "Use at least 8 characters.";
  if (next.length > 200) return "That password is too long.";
  if (next !== String(confirm || "")) return "Passwords do not match.";
  return "";
}

export function tokenProblem(row, now = Date.now()) {
  if (!row || row.used_at) return RESET_INVALID;
  const expires = Date.parse(row.expires_at);
  if (!Number.isFinite(expires) || expires <= now) return RESET_INVALID;
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildResetMessage({ origin, token }) {
  const site = String(origin || "https://purplehat.fun").replace(/\/$/, "");
  const link = `${site}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Purple Hat password";
  const text = [
    "Hello,",
    "",
    "We received a request to reset your Thinking Hat password.",
    "",
    "Choose a new password here:",
    link,
    "",
    "This link expires in 30 minutes and can be used once.",
    "If you did not ask for this, you can ignore this email.",
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
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Reset your password</h1>
    </div>
    <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:28px;">
      <p style="margin:0 0 16px;">We received a request to reset your Thinking Hat password.</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:700;">Choose a new password</a></p>
      <p style="margin:0 0 16px;">This link expires in 30 minutes and can be used once.</p>
      <p style="margin:0 0 16px;">If you did not ask for this, you can ignore this email.</p>
      <p style="margin:0;">Kind regards<br>Purple Hat</p>
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html, link };
}

export function shouldLogResetLink(origin, configured) {
  if (!configured) return true;
  return /localhost|127\.0\.0\.1/i.test(String(origin || ""));
}

export async function deliverResetEmail({ to, message, config, fetchImpl = fetch, sendSmtp, logger = console }) {
  if (!isInviteEmail(to) || !config?.configured) return { ok: false };
  const secrets = [config.apiKey, config.smtpPassword].filter((item) => String(item || "").length >= 6);
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
        logger.error("Password reset email failed.");
        return { ok: false };
      }
    }
    return { ok: true };
  } catch (error) {
    logger.error(`Password reset email failed. ${safeErrorText(error, secrets)}`);
    return { ok: false };
  }
}
