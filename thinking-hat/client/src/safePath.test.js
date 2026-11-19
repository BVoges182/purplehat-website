import assert from "node:assert/strict";
import test from "node:test";
import { sameSitePath } from "./safePath.js";

test("same-site paths stay, and off-site targets are dropped", () => {
  assert.equal(sameSitePath("/dashboard"), "/dashboard");
  assert.equal(sameSitePath("/admin/users/4"), "/admin/users/4");
  assert.equal(sameSitePath("/reports/2026-01"), "/reports/2026-01");
  assert.equal(sameSitePath("  /statements"), "/statements");
  assert.equal(sameSitePath(""), "");
  assert.equal(sameSitePath("dashboard"), "");
  assert.equal(sameSitePath("//evil.example"), "");
  assert.equal(sameSitePath("http://evil.example"), "");
  assert.equal(sameSitePath("https://evil.example/dashboard"), "");
  assert.equal(sameSitePath("javascript:alert(1)"), "");
  assert.equal(sameSitePath("/javascript:alert(1)"), "");
  assert.equal(sameSitePath("/\\evil.example"), "");
  assert.equal(sameSitePath("/admin\\users"), "");
  assert.equal(sameSitePath("/https://evil.example"), "");
});
