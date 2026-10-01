import { fullDateTime, timeOnly } from "../format.ts";
import { durationLabel } from "../meetings.ts";
import { meetingRanges, rangeLabel } from "../ranges.ts";
import type { Meeting } from "./meetings";

/**
 * 会議の募集開始と決定を Discord のチャンネルに流す（Webhook）。
 * DISCORD_WEBHOOK_URL が無ければ何もしない。失敗しても決定そのものは止めない。
 * メンションは一切飛ばさない（allowed_mentions を空にする）。
 */

function reasonOf(m: Meeting, name: string): string {
  if (m.excluded.includes(name)) return "予定未登録";
  if (m.unreadable.includes(name)) return "カレンダーを読み込めず";
  return "予定あり";
}

export function meetingMessage(m: Meeting, declined: string[], url: string): string {
  if (m.status === "confirmed" && m.confirmed_start) {
    const end = new Date(Date.parse(m.confirmed_start) + m.duration_min * 60 * 1000).toISOString();
    const attendees = m.attendees ?? [];
    const notDeclined = m.participants.filter((p) => !declined.includes(p));
    const absent = notDeclined.filter((p) => !attendees.includes(p));
    const declinedHere = m.participants.filter((p) => declined.includes(p));
    return [
      `📅 **${m.title}** の日程が決まりました`,
      `🗓 ${fullDateTime(m.confirmed_start)}〜${timeOnly(end)}`,
      m.location ? `📍 ${m.location}` : null,
      `✅ 参加できる（${attendees.length}人）：${attendees.join("、") || "なし"}`,
      absent.length > 0
        ? `❌ 参加できない（${absent.length}人）：${absent
            .map((p) => `${p}（${reasonOf(m, p)}）`)
            .join("、")}`
        : null,
      declinedHere.length > 0
        ? `🙅 不参加（${declinedHere.length}人）：${declinedHere.join("、")}`
        : null,
      `🔗 ${url}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `⚠️ **${m.title}** は、候補の範囲の中にみんながそろう時間が見つかりませんでした`,
    "範囲や時間帯を広げて、会議を作り直してください",
    `🔗 ${url}`,
  ].join("\n");
}


/** 募集開始。予定未登録の参加者は名前を挙げて、結果発表までに登録してもらう */
export function openingMessage(m: Meeting, unconnected: string[], url: string): string {
  return [
    `📣 **${m.title}** の日程調整を始めました`,
    `👤 主催：${m.organizer}`,
    `⏱ 長さ：${durationLabel(m.duration_min)}`,
    `🗓 候補：${meetingRanges(m).map(rangeLabel).join(" / ")}`,
    m.location ? `📍 ${m.location}` : null,
    `⏰ 結果発表：${fullDateTime(m.deadline)}`,
    `👥 参加者（${m.participants.length}人）：${m.participants.join("、")}`,
    unconnected.length > 0
      ? `⚠️ 予定未登録：${unconnected.join("、")}（結果発表までに、マイページでカレンダーをつなぐか毎週の予定を入れる、または会議ページで予定を塗ってください。登録が無いと計算に入りません）`
      : null,
    "出られない人は、会議ページで「不参加にする」を押してください",
    `🔗 ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 決まった会議にあとから参加する／やめたとき */
export function rsvpMessage(
  m: Meeting,
  member: string,
  attending: boolean,
  attendeeCount: number,
  url: string,
): string {
  const when = m.confirmed_start ? `（${fullDateTime(m.confirmed_start)}〜）` : "";
  return [
    attending
      ? `🙋 **${member}** さんが参加します｜${m.title}${when}`
      : `🙅 **${member}** さんが参加をやめました｜${m.title}${when}`,
    `参加 ${attendeeCount}人`,
    `🔗 ${url}`,
  ].join("\n");
}

async function post(content: string) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[discord] 投稿に失敗（${res.status}）: ${await res.text()}`);
  } catch (e) {
    console.error(`[discord] 投稿に失敗: ${(e as Error).message}`);
  }
}

export async function notifyDiscord(m: Meeting, declined: string[], origin: string) {
  await post(meetingMessage(m, declined, `${origin}/schedule/${m.id}`));
}

export async function notifyRsvp(
  m: Meeting,
  member: string,
  attending: boolean,
  attendeeCount: number,
  origin: string,
) {
  await post(rsvpMessage(m, member, attending, attendeeCount, `${origin}/schedule/${m.id}`));
}

export async function notifyOpened(m: Meeting, unconnected: string[], origin: string) {
  await post(openingMessage(m, unconnected, `${origin}/schedule/${m.id}`));
}
