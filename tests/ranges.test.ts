import { test } from "node:test";
import assert from "node:assert/strict";
import { envelope, inRanges, meetingRanges, rangeDates, rangeIntervals, rangeLabel, rangesProblem } from "../lib/ranges.ts";
import { findSlots, jstMidnight } from "../lib/slots.ts";

const H = 60 * 60 * 1000;
const at = (date: string, h: number) => jstMidnight(date) + h * H;
const ranges = [
  { fromDate: "2026-10-03", toDate: "2026-10-03", dayStartMin: 13 * 60, dayEndMin: 18 * 60 },
  { fromDate: "2026-10-07", toDate: "2026-10-08", dayStartMin: 19 * 60, dayEndMin: 22 * 60 },
  // 10/3 に重なる候補（12〜14 時）はまとめる
  { fromDate: "2026-10-03", toDate: "2026-10-03", dayStartMin: 12 * 60, dayEndMin: 14 * 60 },
];

test("rangeIntervals は日ごとに展開し、重なりをまとめる", () => {
  assert.deepEqual(rangeIntervals(ranges), [
    { start: at("2026-10-03", 12), end: at("2026-10-03", 18) },
    { start: at("2026-10-07", 19), end: at("2026-10-07", 22) },
    { start: at("2026-10-08", 19), end: at("2026-10-08", 22) },
  ]);
});

test("rangeDates は重複なしの昇順", () => {
  assert.deepEqual(rangeDates(ranges), ["2026-10-03", "2026-10-07", "2026-10-08"]);
});

test("inRanges はマスが候補の中に収まっているか", () => {
  assert.ok(inRanges(ranges, at("2026-10-03", 17.5), 30));
  assert.ok(!inRanges(ranges, at("2026-10-03", 18), 30));
  assert.ok(!inRanges(ranges, at("2026-10-05", 13), 30));
});

test("findSlots は候補の時間帯の中だけを探し、一番早いものが先頭", () => {
  const r = findSlots({
    busyByMember: { a: [{ start: at("2026-10-03", 12), end: at("2026-10-03", 18) }], b: [] },
    durationMin: 60,
    intervals: rangeIntervals(ranges),
  });
  assert.equal(r.available, 2);
  assert.deepEqual(r.windows[0], { start: at("2026-10-07", 19), end: at("2026-10-07", 22) });
});

test("rangeLabel", () => {
  assert.equal(rangeLabel(ranges[0]), "10/3・13時〜18時");
  assert.equal(rangeLabel(ranges[1]), "10/7〜10/8・19時〜22時");
  assert.equal(rangeLabel({ ...ranges[0], dayStartMin: 570 }), "10/3・9:30〜18時");
});

test("rangesProblem", () => {
  assert.equal(rangesProblem(ranges), null);
  assert.ok(rangesProblem([]));
  assert.ok(rangesProblem([{ ...ranges[0], dayStartMin: 18 * 60 }]));
  assert.ok(rangesProblem([{ ...ranges[0], toDate: "2026-10-02" }]));
  assert.ok(rangesProblem([{ ...ranges[0], dayStartMin: 545 }]));
});

test("envelope と、古い会議を 1 件の候補にする meetingRanges", () => {
  assert.deepEqual(envelope(ranges), { from_date: "2026-10-03", days: 6, day_start_min: 720, day_end_min: 1320 });
  assert.deepEqual(
    meetingRanges({ ranges: null, from_date: "2026-09-28", days: 4, day_start_min: 540, day_end_min: 1440 }),
    [{ fromDate: "2026-09-28", toDate: "2026-10-01", dayStartMin: 540, dayEndMin: 1440 }],
  );
});
