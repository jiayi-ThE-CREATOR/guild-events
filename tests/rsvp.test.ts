import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRsvps } from "../lib/rsvp.ts";

test("登録が無ければ決定時のまま", () => {
  assert.deepEqual(applyRsvps(["a", "b", "c"], ["a"], ["c"], []), {
    participants: ["a", "b", "c"],
    attendees: ["a"],
    declined: ["c"],
  });
});

test("予定ありだった人・不参加だった人が参加する、参加できた人がやめる", () => {
  assert.deepEqual(
    applyRsvps(["a", "b", "c"], ["a"], ["c"], [
      { member_name: "b", attending: true },
      { member_name: "c", attending: true },
      { member_name: "a", attending: false },
    ]),
    { participants: ["a", "b", "c"], attendees: ["b", "c"], declined: ["a"] },
  );
});

test("参加者に選ばれていなかった人も参加できる（後ろに足される）", () => {
  assert.deepEqual(
    applyRsvps(["a"], ["a"], [], [{ member_name: "z", attending: true }]),
    { participants: ["a", "z"], attendees: ["a", "z"], declined: [] },
  );
});
