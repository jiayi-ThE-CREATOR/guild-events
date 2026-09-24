import { test } from "node:test";
import assert from "node:assert/strict";
import { busyFromIcs, calendarName } from "../lib/ics.ts";

const ics = (body: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "X-WR-CALNAME:授業",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
    body.trim(),
    "END:VCALENDAR",
  ].join("\r\n");

const iso = (ms: number) => new Date(ms).toISOString();
const range = [Date.parse("2026-09-28T00:00:00+09:00"), Date.parse("2026-10-05T00:00:00+09:00")] as const;

test("カレンダー名を読む", () => {
  assert.equal(calendarName(ics("")), "授業");
});

test("毎週の予定を展開し、EXDATE と移動した回を反映する", () => {
  const body = `
BEGIN:VEVENT
UID:class-1
DTSTART;TZID=Asia/Tokyo:20260901T103000
DTEND;TZID=Asia/Tokyo:20260901T120000
RRULE:FREQ=WEEKLY;BYDAY=TU,TH
EXDATE;TZID=Asia/Tokyo:20260929T103000
SUMMARY:統計学
END:VEVENT
BEGIN:VEVENT
UID:class-1
RECURRENCE-ID;TZID=Asia/Tokyo:20261001T103000
DTSTART;TZID=Asia/Tokyo:20261001T150000
DTEND;TZID=Asia/Tokyo:20261001T163000
SUMMARY:統計学（補講）
END:VEVENT`;
  const busy = busyFromIcs(ics(body), ...range);
  assert.deepEqual(busy.map((b) => [iso(b.start), iso(b.end)]), [
    // 9/29(火) は EXDATE で休講、10/1(木) は 15:00 に移動
    ["2026-10-01T06:00:00.000Z", "2026-10-01T07:30:00.000Z"],
  ]);
});

test("終日・予定なし・キャンセル済みは数えず、UTC とタイムゾーン無しを正しく換算する", () => {
  const body = `
BEGIN:VEVENT
UID:a
DTSTART;VALUE=DATE:20260930
DTEND;VALUE=DATE:20261001
END:VEVENT
BEGIN:VEVENT
UID:b
DTSTART:20260930T010000Z
DTEND:20260930T020000Z
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART:20260930T030000Z
DTEND:20260930T040000Z
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:d
DTSTART:20260930T050000Z
DTEND:20260930T060000Z
END:VEVENT
BEGIN:VEVENT
UID:e
DTSTART:20261002T180000
DTEND:20261002T190000
END:VEVENT
BEGIN:VEVENT
UID:f
DTSTART:20261020T180000Z
DTEND:20261020T190000Z
END:VEVENT`;
  const busy = busyFromIcs(ics(body), ...range);
  assert.deepEqual(busy.map((b) => [iso(b.start), iso(b.end)]), [
    ["2026-09-30T05:00:00.000Z", "2026-09-30T06:00:00.000Z"],
    // タイムゾーン無しは日本時間 18:00 = 09:00Z
    ["2026-10-02T09:00:00.000Z", "2026-10-02T10:00:00.000Z"],
  ]);
});
