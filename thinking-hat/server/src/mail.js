import nodemailer from "nodemailer";

export function mailConfigured() {
  return Boolean(String(process.env.SMTP_PASSWORD || "").trim());
}

export function inviteKeyEmail({ code, label, email, expiresInDays }) {
  const count = Number(expiresInDays);
  const expiry = Number.isInteger(count) && count > 0
    ? `It expires in ${count} ${count === 1 ? "day" : "days"}.`
    : "It does not expire.";
  return [
    "Welcome to Thinking Hat.",
    "",
    `Here is your invite key: ${code}`,
    "",
    `This is locked for ${label}.`,
    "",
    `This is locked to email ${email}.`,
    "",
    expiry,
    "",
    "Kind regards",
  ].join("\n");
}

export async function sendInviteKeyEmail({ to, code, label, expiresInDays }) {
  if (!mailConfigured()) {
    const error = new Error("mail-config");
    throw error;
  }
  const user = String(process.env.SMTP_USER || process.env.ADMIN_EMAIL || "").trim();
  const host = String(process.env.SMTP_HOST || "smtp.hostinger.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const from = String(process.env.SMTP_FROM || `Purple Hat <${user}>`).trim();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: process.env.SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from,
    to,
    subject: "Your Thinking Hat invite key",
    text: inviteKeyEmail({ code, label, email: to, expiresInDays }),
  });
}
