import { test } from "node:test";
import assert from "node:assert/strict";
import { eventCreatedMessage, eventRsvpMessage } from "../lib/server/discord.ts";
import { isPastJst } from "../lib/server/events.ts";
import type { EventRecord } from "../lib/types.ts";

const ev: EventRecord = {
  id: "e1",
  title: "GUILD勉強会 #3",
  description: null,
  location: "大阪大学 豊中キャンパス B203",
  // 2026-11-01 14:00 JST
  event_date: "2026-11-01T05:00:00.000Z",
  capacity: 30,
};

test("イベント作成の通知は @everyone で始まり、日時・場所・定員・リンクを出す", () => {
  const text = eventCreatedMessage(ev, "https://x/events/e1");
  assert.ok(text.startsWith("@everyone"));
  assert.ok(text.includes("11/1（日）14:00〜"));
  assert.ok(text.includes("📍 大阪大学 豊中キャンパス B203"));
  assert.ok(text.includes("定員 30人"));
  assert.ok(text.includes("https://x/events/e1"));
  assert.ok(eventCreatedMessage({ ...ev, capacity: null, location: null }, "u").includes("定員なし"));
});

test("参加・参加取りやめの通知（メンションなし）", () => {
  const on = eventRsvpMessage(ev, "ゆうき", true, 5, "u");
  assert.ok(on.includes("**ゆうき** さんが参加します"));
  assert.ok(on.includes("参加 5/30人"));
  assert.ok(!on.includes("@everyone"));
  assert.ok(eventRsvpMessage({ ...ev, capacity: null }, "ゆうき", false, 4, "u").includes("参加をやめました"));
  assert.ok(eventRsvpMessage({ ...ev, capacity: null }, "ゆうき", false, 4, "u").includes("参加 4人"));
});

test("終了の判定は日本時間の日付で、当日中は終わっていない", () => {
  // 日本時間 11/1 23:30（UTC では 11/1 14:30）
  const lateOnDay = Date.parse("2026-11-01T14:30:00Z");
  assert.equal(isPastJst(ev.event_date, lateOnDay), false);
  // 日本時間 11/2 00:30（UTC では 11/1 15:30）
  const nextDay = Date.parse("2026-11-01T15:30:00Z");
  assert.equal(isPastJst(ev.event_date, nextDay), true);
});
