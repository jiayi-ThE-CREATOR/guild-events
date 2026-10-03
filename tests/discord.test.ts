import { test } from "node:test";
import assert from "node:assert/strict";
import { extendMessage, meetingMessage, openingMessage, rescheduleMessage, rsvpMessage } from "../lib/server/discord.ts";
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
  ranges: null,
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
      "❌ 参加できない（2人）：d（予定未登録）、e（カレンダーを読み込めず）",
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

test("募集開始：主催・長さ・候補・結果発表・参加者・未連携の人・リンク", () => {
  const m = { ...base, status: "open" as const, confirmed_start: null, attendees: null };
  assert.equal(
    openingMessage(m, ["d"], "https://x/schedule/m1"),
    [
      "📣 **【ラクハン】定例** の日程調整を始めました",
      "👤 主催：a",
      "⏱ 長さ：1時間",
      "🗓 候補：9/28〜10/1・9時〜24時",
      "📍 オンライン",
      "⏰ 結果発表：9/26（土）11:41",
      "👥 参加者（5人）：a、b、c、d、e",
      "⚠️ 予定未登録：d（結果発表までに、マイページでカレンダーをつなぐか毎週の予定を入れる、または会議ページで予定を塗ってください。登録が無いと計算に入りません）",
      "出られない人は、会議ページで「不参加にする」を押してください",
      "🔗 https://x/schedule/m1",
    ].join("\n"),
  );
});

test("募集開始：全員連携済みなら未連携の行を出さない", () => {
  const m = { ...base, status: "open" as const };
  assert.ok(!openingMessage(m, [], "u").includes("⚠️"));
});

test("あとから参加する／やめる", () => {
  assert.equal(
    rsvpMessage(base, "z", true, 3, "u"),
    ["🙋 **z** さんが参加します｜【ラクハン】定例（9/28（月）20:00〜）", "参加 3人", "🔗 u"].join("\n"),
  );
  assert.match(rsvpMessage(base, "a", false, 1, "u"), /^🙅 \*\*a\*\* さんが参加をやめました/);
});

test("募集開始：候補が複数なら / でつなぐ", () => {
  const m = {
    ...base,
    status: "open" as const,
    ranges: [
      { fromDate: "2026-10-03", toDate: "2026-10-03", dayStartMin: 780, dayEndMin: 1080 },
      { fromDate: "2026-10-07", toDate: "2026-10-08", dayStartMin: 1140, dayEndMin: 1320 },
    ],
  };
  assert.match(openingMessage(m, [], "u"), /🗓 候補：10\/3・13時〜18時 \/ 10\/7〜10\/8・19時〜22時/);
});

test("募集の延長：決まっていた会議は取り消しの一言を入れる", () => {
  const m = { ...base, status: "open" as const, deadline: "2026-10-08T11:00:00Z" };
  const text = extendMessage(m, { status: "confirmed", confirmed_start: "2026-09-28T11:00:00Z" }, "u");
  assert.equal(
    text,
    [
      "⏰ **【ラクハン】定例** の募集を延長しました",
      "決まっていた日時（9/28（月）20:00〜）は取り消しです。もう一度みんなの予定から決めます",
      "🗓 候補：9/28〜10/1・9時〜24時",
      "⏰ 結果発表：10/8（木）20:00",
      "🔗 u",
    ].join("\n"),
  );
  assert.ok(!extendMessage(m, { status: "open", confirmed_start: null }, "u").includes("取り消し"));
  assert.match(extendMessage(m, { status: "failed", confirmed_start: null }, "u"), /もう一度募集します/);
});

test("日時の変更：見出しに旧→新、続きは決定の知らせと同じ（ゲストは名前に置き換え）", () => {
  const m = { ...base, confirmed_start: "2026-10-05T05:00:00Z", participants: ["a", "guest:x"], attendees: ["a", "guest:x"], excluded: [], unreadable: [] };
  const lines = rescheduleMessage(m, "2026-09-28T11:00:00Z", [], "u", { "guest:x": "山田（ゲスト）" }).split("\n");
  assert.equal(lines[0], "🔁 **【ラクハン】定例** の日時を変更しました（9/28（月）20:00〜 → 10/5（月）14:00〜）");
  assert.equal(lines[1], "🗓 10/5（月）14:00〜15:00");
  assert.ok(lines.includes("✅ 参加できる（2人）：a、山田（ゲスト）"));
});

test("募集開始：ゲストは「名前（ゲスト）」で参加者と未登録に並ぶ", () => {
  const m = { ...base, status: "open" as const, participants: ["a", "guest:x"] };
  const text = openingMessage(m, ["guest:x"], "u", { "guest:x": "山田（ゲスト）" });
  assert.match(text, /👥 参加者（2人）：a、山田（ゲスト）/);
  assert.match(text, /⚠️ 予定未登録：山田（ゲスト）（/);
});
