import assert from "node:assert/strict";
import test from "node:test";
import { dayState } from "../../../assets/booking-calendar.js";

const todayKey = "2026-11-21";

function windowDays() {
  const start = new Date(Date.UTC(2026, 10, 21));
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    days.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  }
  return days;
}

const openDays = new Set(windowDays());

test("booking days distinguish available, today, selected, and unavailable", () => {
  const past = dayState({ iso: "2026-11-20", todayKey, openDays, selectedDate: "" });
  assert.equal(past.unavailable, true);
  assert.equal(past.available, false);
  assert.equal(past.disabled, true);
  assert.equal(past.ariaDisabled, "true");
  assert.match(past.className, /is-unavailable/);

  const today = dayState({ iso: todayKey, todayKey, openDays, selectedDate: "" });
  assert.equal(today.available, true);
  assert.equal(today.today, true);
  assert.equal(today.ariaDisabled, "false");
  assert.match(today.className, /is-available/);
  assert.match(today.className, /is-today/);

  const day14 = dayState({ iso: "2026-12-04", todayKey, openDays, selectedDate: "" });
  assert.equal(day14.available, true);
  assert.equal(day14.unavailable, false);

  const day15 = dayState({ iso: "2026-12-05", todayKey, openDays, selectedDate: "" });
  assert.equal(day15.unavailable, true);
  assert.equal(day15.ariaDisabled, "true");

  const nextMonth = dayState({ iso: "2026-12-01", todayKey, openDays, selectedDate: "" });
  assert.equal(nextMonth.available, true);

  const selected = dayState({ iso: "2026-11-25", todayKey, openDays, selectedDate: "2026-11-25" });
  assert.equal(selected.selected, true);
  assert.equal(selected.available, true);
  assert.match(selected.className, /is-selected/);
  assert.equal(selected.ariaDisabled, "false");
});
