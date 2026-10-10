import type { SupabaseClient } from "@supabase/supabase-js";
import { freeMembers, JST_OFFSET_MS } from "../slots";
import { availability } from "./availability";
import { notifyDiscord, notifyRescheduled } from "./discord";
import { meetingMembers } from "./guests";
import { declinesOf, type Meeting } from "./meetings";

/**
 * 会議の日時を start〜end（UTC ミリ秒）に決める・変える。呼ぶ側で 30 分刻み・今より後・end > start を確かめておく。
 * 募集中の会議なら、ここで募集を締め切ってこの日時に決める（結果発表の時刻は今にする。Discord には自動で決まったときと同じ「決定」を流す）。
 * 決まった会議なら日時を変える。終了に合わせて会議の長さも変える。
 * 新しい時間で、今のカレンダーから「参加できる／できない」を計算し直す。
 * 前の日時に対するあとからの参加登録は消す（別の時間への返事なので）。
 * 問題があれば { error, status }、うまくいけば null。
 */
export async function decideMeeting(
  admin: SupabaseClient,
  meeting: Meeting,
  startMs: number,
  endMs: number,
  origin: string,
): Promise<{ error: string; status: number } | null> {
  const closing = meeting.status === "open";
  const durationMin = (endMs - startMs) / 60_000;

  // 新しい時間を「その日のその時間帯だけ」の候補として、今のカレンダーで出欠を出す
  const jst = new Date(startMs + JST_OFFSET_MS);
  const date = jst.toISOString().slice(0, 10);
  const startMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const endMin = startMin + durationMin;
  if (endMin > 24 * 60) return { error: "その日のうちに終わる時間にしてください", status: 400 };

  const declined = await declinesOf(admin, meeting.id);
  const { keys, labels } = await meetingMembers(admin, meeting);
  const members = keys.filter((k) => !declined.includes(k));
  const { result, unconnected, unreadable, busyByMember } = await availability(
    admin,
    members,
    { durationMin, ranges: [{ fromDate: date, toDate: date, dayStartMin: startMin, dayEndMin: endMin }] },
    0,
    meeting.id,
  );
  const free = freeMembers(busyByMember, startMs, endMs);

  const { data: updated, error: writeError } = await admin
    .from("meetings")
    .update({
      confirmed_start: new Date(startMs).toISOString(),
      duration_min: durationMin,
      attendees: keys.filter((k) => free.includes(k)),
      confirmed_available: free.length,
      confirmed_total: result.total,
      excluded: unconnected,
      unreadable,
      ...(closing ? { status: "confirmed", deadline: new Date().toISOString() } : {}),
    })
    .eq("id", meeting.id)
    .eq("status", meeting.status)
    .select()
    .maybeSingle();
  if (writeError) return { error: writeError.message, status: 500 };
  // 同時に自動で決まった・ほかの人が先に決めたなど
  if (!updated) return { error: "会議の状態が変わりました。ページを開き直してください", status: 409 };

  if (closing) {
    await notifyDiscord({ ...(updated as Meeting), participants: keys }, declined, origin, labels);
    return null;
  }

  await admin.from("meeting_rsvps").delete().eq("meeting_id", meeting.id);
  await notifyRescheduled(
    { ...(updated as Meeting), participants: keys },
    meeting.confirmed_start!,
    declined,
    origin,
    labels,
  );
  return null;
}
