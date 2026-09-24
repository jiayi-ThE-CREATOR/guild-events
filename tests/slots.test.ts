import { test } from "node:test";
import assert from "node:assert/strict";
import { findSlots, jstMidnight, type Busy } from "../lib/slots.ts";

const H = 60 * 60 * 1000;
/** 2026-09-28（月）の日本時間 h 時 */
const at = (h: number, day = 0) => jstMidnight("2026-09-28") + day * 24 * H + h * H;
const busy = (from: number, to: number, day = 0): Busy => ({
  start: at(from, day),
  end: at(to, day),
});

const base = {
  fromDate: "2026-09-28",
  days: 1,
  durationMin: 60,
  dayStartMin: 9 * 60,
  dayEndMin: 18 * 60,
};

test("jstMidnight は日本時間 0 時（前日 15 時 UTC）", () => {
  assert.equal(new Date(jstMidnight("2026-09-28")).toISOString(), "2026-09-27T15:00:00.000Z");
});

test("全員が空いている時間を窓にまとめて返す", () => {
  const r = findSlots({
    ...base,
    busyByMember: {
      a: [busy(9, 12)],
      b: [busy(14, 18)],
    },
  });
  assert.equal(r.total, 2);
  assert.equal(r.available, 2);
  assert.deepEqual(r.windows, [{ start: at(12), end: at(14) }]);
});

test("長さに足りない空きは候補にしない", () => {
  const r = findSlots({
    ...base,
    busyByMember: { a: [busy(9, 12.5), busy(13, 18)] },
  });
  assert.equal(r.available, null);
  assert.deepEqual(r.windows, []);
});

test("全員そろわなければ A-1 人の枠を返す", () => {
  const r = findSlots({
    ...base,
    busyByMember: {
      a: [busy(9, 18)],
      b: [busy(9, 10)],
      c: [busy(15, 18)],
    },
  });
  assert.equal(r.available, 2);
  assert.deepEqual(r.windows, [{ start: at(10), end: at(15) }]);
});

test("A-2 人以下しかそろわなければ見つからない扱い", () => {
  const r = findSlots({
    ...base,
    busyByMember: {
      a: [busy(9, 18)],
      b: [busy(9, 18)],
      c: [],
    },
  });
  assert.equal(r.available, null);
});

test("日をまたいで窓をつなげない", () => {
  const r = findSlots({
    ...base,
    days: 2,
    dayStartMin: 0,
    dayEndMin: 24 * 60,
    busyByMember: { a: [busy(0, 23), busy(1, 24, 1)] },
  });
  assert.deepEqual(r.windows, [
    { start: at(23), end: at(24) },
    { start: at(0, 1), end: at(1, 1) },
  ]);
});

test("notBefore より前に始まる枠は出さない", () => {
  const r = findSlots({
    ...base,
    notBefore: at(16),
    busyByMember: { a: [] },
  });
  assert.deepEqual(r.windows, [{ start: at(16), end: at(18) }]);
});
