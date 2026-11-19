import nodemailer from "nodemailer";
import { formatFrom, readMailConfig } from "./inviteEmail.js";

const MAX_RECIPIENTS = 5;
const MAX_ADDRESS_LENGTH = 120;

export function mailConfigured(env = process.env) {
  return readMailConfig(env).configured;
}

function recipientsOf(to) {
  const list = Array.isArray(to) ? to : String(to || "").split(",");
  return list.map((item) => String(item || "").trim()).filter(Boolean);
}

export function rejectUnsafeMail({ to, message }) {
  const recipients = recipientsOf(to);
  if (recipients.length < 1 || recipients.length > MAX_RECIPIENTS) return "That message has too many recipients.";
  if (recipients.some((address) => address.length > MAX_ADDRESS_LENGTH || /[\r\n]/.test(address))) return "Enter a valid email address.";
  if (message && (Object.hasOwn(message, "raw") || message.attachments || message.href)) return "That message cannot be sent.";
  return "";
}

export async function sendSmtpMail({ to, message, config, transport }) {
  const problem = rejectUnsafeMail({ to, message });
  if (problem) throw new Error(problem);
  const transporter = transport || nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  await transporter.sendMail({
    from: formatFrom(config),
    to: recipientsOf(to),
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
