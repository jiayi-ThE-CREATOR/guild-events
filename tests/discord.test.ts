import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingMessage } from "../lib/server/discord.ts";
import type { Meeting } from "../lib/server/meetings.ts";

const base: Meeting = {
  id: "m1",
  title: "【ラクハン】定例",
  description: null,
  location: "オンライン",
  organizer: "a",
  participants: ["a", "b", "c", "d", "e"],
  duration_min: 60,
  from_date: "2026-09-28",
  days: 4,
  day_start_min: 540,
  day_end_min: 1440,
  deadline: "2026-09-26T02:41:08Z",
  status: "confirmed",
  confirmed_start: "2026-09-28T11:00:00Z",
  confirmed_available: 2,
  confirmed_total: 3,
  excluded: ["d"],
  unreadable: ["e"],
  attendees: ["a", "b"],
  created_at: "2026-09-25T02:41:08Z",
};

test("決定：日時・場所・参加できる／できない（理由つき）・リンク", () => {
  assert.equal(
    meetingMessage(base, ["c"], "https://x/schedule/m1"),
    [
      "📅 **【ラクハン】定例** の日程が決まりました",
      "🗓 9/28（月）20:00〜21:00",
      "📍 オンライン",
      "✅ 参加できる（2人）：a、b",
      "❌ 参加できない（2人）：d（カレンダー未連携）、e（カレンダーを読み込めず）",
      "🙅 不参加（1人）：c",
      "🔗 https://x/schedule/m1",
    ].join("\n"),
  );
});

test("全員参加なら「参加できない」「不参加」の行を出さず、場所が無ければ場所の行も出さない", () => {
  const m = { ...base, location: null, excluded: [], unreadable: [], attendees: base.participants };
  assert.ok(!meetingMessage(m, [], "u").includes("❌"));
  assert.ok(!meetingMessage(m, [], "u").includes("🙅"));
  assert.ok(!meetingMessage(m, [], "u").includes("📍"));
});

test("予定ありの人は「予定あり」", () => {
  const m = { ...base, excluded: [], unreadable: [], attendees: ["a", "b", "c", "d"] };
  assert.match(meetingMessage(m, [], "u"), /e（予定あり）/);
});

test("不成立", () => {
  const m = { ...base, status: "failed" as const, confirmed_start: null };
  assert.match(meetingMessage(m, [], "u"), /^⚠️ \*\*【ラクハン】定例\*\* は、候補の範囲の中に/);
});
