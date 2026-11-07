import crypto from "node:crypto";

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function basicAuthConfigured(env = process.env) {
  return String(env.BASIC_AUTH_PASSWORD || "").trim() !== "";
}

export function requireBasicAuth(req, res, next, env = process.env) {
  const password = String(env.BASIC_AUTH_PASSWORD || "").trim();
  if (!password) {
    next();
    return;
  }
  const header = req.get("authorization") || "";
  const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
  const decoded = encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const splitAt = decoded.indexOf(":");
  const user = splitAt >= 0 ? decoded.slice(0, splitAt) : "";
  const pass = splitAt >= 0 ? decoded.slice(splitAt + 1) : "";
  const expectedUser = String(env.BASIC_AUTH_USER || "purplehat").trim() || "purplehat";
  if (safeEqual(user, expectedUser) && safeEqual(pass, password)) {
    next();
    return;
  }
  res.set("WWW-Authenticate", 'Basic realm="Purple Hat Trading"');
  res.status(401).json({ error: "Authentication required" });
}
