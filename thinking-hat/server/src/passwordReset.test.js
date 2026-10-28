import assert from "node:assert/strict";
import test from "node:test";
import {
  RESET_INVALID,
  RESET_MESSAGE,
  RESET_TTL_MS,
  RESET_WINDOW_MS,
  buildResetMessage,
  canRequestReset,
  hashResetToken,
  passwordProblem,
  planResetRequest,
  resetExpiry,
  shouldLogResetLink,
  tokenProblem,
} from "./passwordReset.js";

test("a reset token is stored as a hash and expires after 30 minutes", () => {
  const now = Date.parse("2026-10-27T10:00:00.000Z");
  const hash = hashResetToken("plain-token");
  assert.notEqual(hash, "plain-token");
  assert.equal(hash, hashResetToken("plain-token"));
  assert.equal(resetExpiry(now), "2026-10-27T10:30:00.000Z");
  assert.equal(RESET_TTL_MS, 30 * 60 * 1000);
});

test("reset requests stop after three in an hour and still use the same message", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  const recent = [
    new Date(now - 5 * 60 * 1000).toISOString(),
    new Date(now - 10 * 60 * 1000).toISOString(),
  ];
  assert.equal(canRequestReset(recent, now), true);
  const allowed = planResetRequest({ recentTimestamps: recent, userId: 6, now });
  assert.equal(allowed.message, RESET_MESSAGE);
  assert.equal(allowed.record, true);
  assert.equal(allowed.create, true);

  const full = [...recent, new Date(now - 1000).toISOString()];
  const blocked = planResetRequest({ recentTimestamps: full, userId: 6, now });
  assert.equal(blocked.message, RESET_MESSAGE);
  assert.equal(blocked.record, false);
  assert.equal(blocked.create, false);

  const unknown = planResetRequest({ recentTimestamps: [], userId: null, now });
  assert.equal(unknown.message, RESET_MESSAGE);
  assert.equal(unknown.create, false);
  assert.equal(unknown.record, true);

  const old = [new Date(now - RESET_WINDOW_MS - 1000).toISOString()];
  assert.equal(canRequestReset([...old, ...old, ...old], now), true);
});

test("a reset link is rejected when it is missing, used, or expired", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  assert.equal(tokenProblem(null, now), RESET_INVALID);
  assert.equal(tokenProblem({ used_at: "2026-10-27T11:00:00.000Z", expires_at: "2026-10-27T12:30:00.000Z" }, now), RESET_INVALID);
  assert.equal(tokenProblem({ used_at: null, expires_at: "2026-10-27T11:59:00.000Z" }, now), RESET_INVALID);
  assert.equal(tokenProblem({ used_at: null, expires_at: "2026-10-27T12:30:00.000Z" }, now), "");
});

test("a new password must be at least 8 characters and match", () => {
  assert.equal(passwordProblem("short", "short"), "Use at least 8 characters.");
  assert.equal(passwordProblem("longenough", "different"), "Passwords do not match.");
  assert.equal(passwordProblem("longenough", "longenough"), "");
});

test("the reset email link points at the reset page and local dev logs it", () => {
  const message = buildResetMessage({ origin: "http://localhost:5173", token: "abc def" });
  assert.equal(message.link, "http://localhost:5173/reset-password?token=abc%20def");
  assert.match(message.text, /30 minutes/);
  assert.equal(message.text.includes("abc def"), false);
  assert.equal(shouldLogResetLink("http://localhost:5173", true), true);
  assert.equal(shouldLogResetLink("https://purplehat.fun", true), false);
  assert.equal(shouldLogResetLink("https://purplehat.fun", false), true);
});
