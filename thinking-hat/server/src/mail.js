import nodemailer from "nodemailer";
import { formatFrom, readMailConfig } from "./inviteEmail.js";

export function mailConfigured(env = process.env) {
  return readMailConfig(env).configured;
}

export async function sendSmtpMail({ to, message, config }) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
  await transporter.sendMail({
    from: formatFrom(config),
    to,
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
