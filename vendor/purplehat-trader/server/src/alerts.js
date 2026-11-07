import nodemailer from "nodemailer";
import { formatAlert } from "../../shared/signals.js";
import { getDelivery, saveDelivery } from "./db.js";

export function redact(text, env = process.env) {
  let out = String(text || "");
  for (const secret of [env.TELEGRAM_BOT_TOKEN, env.SMTP_PASS, env.EVAL_JOB_SECRET]) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function alertsEnabled(env = process.env) {
  return String(env.ALERTS_ENABLED || "").toLowerCase() === "true";
}

export function telegramConfigured(env = process.env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export function emailConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.ALERT_EMAIL_TO && env.ALERT_EMAIL_FROM);
}

async function defaultTelegram(text, env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
}

async function defaultEmail(text, env, transport) {
  const mailer = transport || nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: Number(env.SMTP_PORT || 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || "" } : undefined,
  });
  await mailer.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject: text.split("\n")[0],
    text,
  });
}

async function deliverChannel(db, signal, channel, successStatus, send, env) {
  const existing = getDelivery(db, signal.id, channel);
  if (existing && existing.status !== "failed") {
    return { signalId: signal.id, channel, status: existing.status, skipped: true };
  }
  try {
    await send();
    saveDelivery(db, signal.id, channel, successStatus, null, Date.now());
    return { signalId: signal.id, channel, status: successStatus };
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), env);
    saveDelivery(db, signal.id, channel, "failed", message, Date.now());
    return { signalId: signal.id, channel, status: "failed", error: message };
  }
}

export async function deliverAlerts(db, signals, options = {}) {
  const env = options.env ?? process.env;
  const enabled = alertsEnabled(env);
  const results = [];
  for (const signal of signals) {
    const text = formatAlert(signal);
    results.push(await deliverChannel(db, signal, "inapp", "unread", async () => {
      options.onInapp?.(signal, text);
    }, env));
    if (!enabled) continue;
    if (telegramConfigured(env)) {
      const send = options.sendTelegram
        ? () => options.sendTelegram(signal, text)
        : () => defaultTelegram(text, env);
      results.push(await deliverChannel(db, signal, "telegram", "sent", send, env));
    }
    if (emailConfigured(env)) {
      const send = options.sendEmail
        ? () => options.sendEmail(signal, text)
        : () => defaultEmail(text, env, options.transport);
      results.push(await deliverChannel(db, signal, "email", "sent", send, env));
    }
  }
  return results;
}
