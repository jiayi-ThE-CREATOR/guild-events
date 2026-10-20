import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuestKey } from "../guests.ts";
import { meetingRanges, rangeIntervals } from "../ranges.ts";
import { UNIVERSITIES } from "../types.ts";
import type { Meeting } from "./meetings";

/**
 * 日程調整に会議を使っているイベント（meetings.event_id）に、会議の状態を写す。
 * 会議が決まった・不成立になった・募集し直した（延長）ときに呼ぶ。event_id が無い会議では何もしない。
 *
 * - 募集中：date_status='scheduling'、event_date は仮に最初の候補の開始、schedule_deadline は結果発表
 * - 決定：event_date を決まった日時に、date_status='fixed'。その時間に空いていた参加者（メンバーだけ）を
 *   参加にする（applications に applied の行を足す）。定員を超える人は DB のトリガーが止めるので、そこで打ち切る
 * - 不成立：date_status='failed'
 * 参加させた人は、あとで募集し直しても消さない（本人が「参加をやめる」で外せる）。
 * 失敗しても会議の決定そのものは止めない（ログだけ）。
 */
export async function syncEvent(admin: SupabaseClient, meeting: Meeting): Promise<void> {
  if (!meeting.event_id) return;
  try {
    if (meeting.status === "open") {
      const first = rangeIntervals(meetingRanges(meeting))[0];
      await update(admin, meeting.event_id, {
        date_status: "scheduling",
        schedule_deadline: meeting.deadline,
        ...(first ? { event_date: new Date(first.start).toISOString() } : {}),
      });
      return;
    }
    if (meeting.status === "failed") {
      await update(admin, meeting.event_id, { date_status: "failed", schedule_deadline: null });
      return;
    }
    if (!meeting.confirmed_start) return;
    await update(admin, meeting.event_id, {
      date_status: "fixed",
      event_date: meeting.confirmed_start,
      schedule_deadline: null,
    });
    await joinAttendees(admin, meeting.event_id, (meeting.attendees ?? []).filter((k) => !isGuestKey(k)));
  } catch (e) {
    console.error(`[event-sync] イベント ${meeting.event_id} への反映に失敗: ${(e as Error).message}`);
  }
}

async function update(admin: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("events").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

/** まだ参加していない人を、決まった時間に空いていた順に参加させる */
async function joinAttendees(admin: SupabaseClient, eventId: string, names: string[]) {
  if (names.length === 0) return;
  const { data, error } = await admin.from("applications").select("name, university, event_id, status").in("name", names);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  for (const name of names) {
    const joined = rows.some((r) => r.event_id === eventId && r.name === name && r.status !== "cancelled");
    if (joined) continue;
    // 大学はサーバーでは分からないので、その人の過去の申請から借りる（無ければ「その他」）
    const past = rows.find((r) => r.name === name && (UNIVERSITIES as readonly string[]).includes(r.university));
    const { error: insertError } = await admin
      .from("applications")
      .insert({ event_id: eventId, name, university: past?.university ?? "その他" });
    if (!insertError || insertError.code === "23505") continue;
    if (insertError.message.includes("満席")) return;
    throw new Error(insertError.message);
  }
}
