import type { NextRequest } from "next/server";
import { freeMembers, JST_OFFSET_MS } from "@/lib/slots";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability } from "@/lib/server/availability";
import { notifyDiscord, notifyRescheduled } from "@/lib/server/discord";
import { meetingMembers } from "@/lib/server/guests";
import { declinesOf, type Meeting } from "@/lib/server/meetings";

/**
 * 日時を手で決める・変える。募集中の会議なら、ここで募集を締め切ってこの日時に決める
 * （結果発表の時刻は今にする。Discord には自動で決まったときと同じ「決定」を流す）。
 * 決まった会議なら日時を変える。日付・開始・終了は自由（30 分刻み・今より後・その日のうちに終わる）。
 * 終了を渡すと会議の長さもそれに変える（募集時の長さに縛らない）。
 * 新しい時間で、今のカレンダーから「参加できる／できない」を計算し直す。
 * 前の日時に対するあとからの参加登録は消す（別の時間への返事なので）。Discord に流す。
 */
const HALF_HOUR = 30 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { start, end } = (await req.json()) as { start?: string; end?: string };

  const startMs = Date.parse(start ?? "");
  if (Number.isNaN(startMs) || startMs % HALF_HOUR !== 0) {
    return Response.json({ error: "開始時刻が正しくありません（30 分刻み）" }, { status: 400 });
  }
  if (startMs <= Date.now()) return Response.json({ error: "今より後の時間を選んでください" }, { status: 400 });

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  const closing = meeting.status === "open";
  if (!closing && (meeting.status !== "confirmed" || !meeting.confirmed_start)) {
    return Response.json({ error: "募集中か、日時が決まった会議だけ決められます" }, { status: 409 });
  }

  // 終了が無ければ今の長さのまま
  const endMs = end === undefined ? startMs + meeting.duration_min * 60 * 1000 : Date.parse(end);
  if (Number.isNaN(endMs) || endMs % HALF_HOUR !== 0 || endMs <= startMs) {
    return Response.json({ error: "終了時刻は開始より後にしてください（30 分刻み）" }, { status: 400 });
  }
  const durationMin = (endMs - startMs) / 60_000;

  // 新しい時間を「その日のその時間帯だけ」の候補として、今のカレンダーで出欠を出す
  const jst = new Date(startMs + JST_OFFSET_MS);
  const date = jst.toISOString().slice(0, 10);
  const startMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const endMin = startMin + durationMin;
  if (endMin > 24 * 60) return Response.json({ error: "その日のうちに終わる時間にしてください" }, { status: 400 });

  const declined = await declinesOf(admin, id);
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
    .eq("id", id)
    .eq("status", meeting.status)
    .select()
    .maybeSingle();
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });
  // 同時に自動で決まった・ほかの人が先に決めたなど
  if (!updated) return Response.json({ error: "会議の状態が変わりました。ページを開き直してください" }, { status: 409 });

  if (closing) {
    await notifyDiscord({ ...(updated as Meeting), participants: keys }, declined, req.nextUrl.origin, labels);
    return Response.json({ ok: true });
  }

  await admin.from("meeting_rsvps").delete().eq("meeting_id", id);
  await notifyRescheduled(
    { ...(updated as Meeting), participants: keys },
    meeting.confirmed_start!,
    declined,
    req.nextUrl.origin,
    labels,
  );
  return Response.json({ ok: true });
}
