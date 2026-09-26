import { fullDateTime, timeOnly } from "../format.ts";
import type { Meeting } from "./meetings";

/**
 * 会議が決まったら Discord のチャンネルに流す（Webhook）。
 * DISCORD_WEBHOOK_URL が無ければ何もしない。失敗しても決定そのものは止めない。
 * メンションは一切飛ばさない（allowed_mentions を空にする）。
 */

function reasonOf(m: Meeting, name: string): string {
  if (m.excluded.includes(name)) return "カレンダー未連携";
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

export async function notifyDiscord(m: Meeting, declined: string[], origin: string) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: meetingMessage(m, declined, `${origin}/schedule/${m.id}`).slice(0, 2000),
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[discord] 投稿に失敗（${res.status}）: ${await res.text()}`);
  } catch (e) {
    console.error(`[discord] 投稿に失敗: ${(e as Error).message}`);
  }
}
