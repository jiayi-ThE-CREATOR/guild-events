import { test } from "node:test";
import assert from "node:assert/strict";
import { rangeIntervals } from "../lib/ranges.ts";
import { findSlots } from "../lib/slots.ts";

/**
 * イベントの「時間帯で決める」（例：毎日 18〜20 時）は、候補の各日の時間帯をちょうどその時間帯にし、
 * 長さを時間帯の長さにする。こうすると、その日に決まるなら必ず 18:00 開始になる
 */
const ranges = [{ fromDate: "2026-11-10", toDate: "2026-11-12", dayStartMin: 18 * 60, dayEndMin: 20 * 60 }];
const at = (iso: string) => Date.parse(iso);

test("時間帯ちょうどの候補は日ごとに分かれたまま（隣の日とつながらない）", () => {
  assert.equal(rangeIntervals(ranges).length, 3);
});

test("その時間帯に 1 人でも予定があれば、その日は飛ばして次の日の開始時刻に決まる", () => {
  const r = findSlots({
    busyByMember: {
      a: [{ start: at("2026-11-10T19:00:00+09:00"), end: at("2026-11-10T19:30:00+09:00") }],
      b: [],
    },
    durationMin: 120,
    intervals: rangeIntervals(ranges),
  });
  assert.equal(r.available, 2);
  assert.equal(r.windows[0].start, at("2026-11-11T18:00:00+09:00"));
  // 時間帯の途中から始まる枠は出ない
  assert.ok(r.windows.every((w) => new Date(w.start + 9 * 3600e3).getUTCHours() === 18 && new Date(w.start + 9 * 3600e3).getUTCMinutes() === 0));
});
