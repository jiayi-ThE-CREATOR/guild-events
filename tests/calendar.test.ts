import { test } from "node:test";
import assert from "node:assert/strict";
import { googleCalendarUrl, icsContent } from "../lib/calendar.ts";
import { busyFromIcs } from "../lib/ics.ts";

const item = {
  id: "m1",
  title: "定例",
  description: null,
  location: null,
  event_date: "2026-10-10T03:00:00.000Z",
  duration_min: 60,
};
const from = Date.parse("2026-10-10T00:00:00Z");
const to = Date.parse("2026-10-11T00:00:00Z");

test("決まった会議の .ics は予定ありとして数える", () => {
  assert.equal(busyFromIcs(icsContent(item), from, to).length, 1);
});

test("仮の候補の .ics は【仮】付き・空きで入り、予定ありに数えない", () => {
  const ics = icsContent({ ...item, tentative: true });
  assert.match(ics, /SUMMARY:【仮】定例/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
  assert.equal(busyFromIcs(ics, from, to).length, 0);
});

test("仮の候補の Google リンクは空き（trp=false）で入る", () => {
  const url = new URL(googleCalendarUrl({ ...item, tentative: true }));
  assert.equal(url.searchParams.get("trp"), "false");
  assert.equal(url.searchParams.get("text"), "【仮】定例");
  assert.equal(new URL(googleCalendarUrl(item)).searchParams.get("trp"), null);
});
