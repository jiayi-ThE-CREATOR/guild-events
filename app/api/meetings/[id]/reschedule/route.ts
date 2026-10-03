import type { NextRequest } from "next/server";
import { freeMembers, JST_OFFSET_MS } from "@/lib/slots";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability } from "@/lib/server/availability";
import { notifyRescheduled } from "@/lib/server/discord";
import { meetingMembers } from "@/lib/server/guests";
import { declinesOf, type Meeting } from "@/lib/server/meetings";

/**
 * 決まった日時を手で変える。日付と開始時刻は自由（30 分刻み・今より後・その日のうちに終わる）。
 * 新しい時間で、今のカレンダーから「参加できる／できない」を計算し直す。
 * 前の日時に対するあとからの参加登録は消す（別の時間への返事なので）。Discord に流す。
 */
const HALF_HOUR = 30 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { start } = (await req.json()) as { start?: string };

  const startMs = Date.parse(start ?? "");
  if (Number.isNaN(startMs) || startMs % HALF_HOUR !== 0) {
    return Response.json({ error: "開始時刻が正しくありません（30 分刻み）" }, { status: 400 });
  }
  if (startMs <= Date.now()) return Response.json({ error: "今より後の時間を選んでください" }, { status: 400 });

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (meeting.status !== "confirmed" || !meeting.confirmed_start) {
    return Response.json({ error: "日時が決まった会議だけ変えられます" }, { status: 409 });
  }

  // 新しい時間を「その日のその時間帯だけ」の候補として、今のカレンダーで出欠を出す
  const endMs = startMs + meeting.duration_min * 60 * 1000;
  const jst = new Date(startMs + JST_OFFSET_MS);
  const date = jst.toISOString().slice(0, 10);
  const startMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const endMin = startMin + meeting.duration_min;
  if (endMin > 24 * 60) return Response.json({ error: "その日のうちに終わる時間にしてください" }, { status: 400 });

  const declined = await declinesOf(admin, id);
  const { keys, labels } = await meetingMembers(admin, meeting);
  const members = keys.filter((k) => !declined.includes(k));
  const { result, unconnected, unreadable, busyByMember } = await availability(
    admin,
    members,
    { durationMin: meeting.duration_min, ranges: [{ fromDate: date, toDate: date, dayStartMin: startMin, dayEndMin: endMin }] },
    0,
    meeting.id,
  );
  const free = freeMembers(busyByMember, startMs, endMs);

  const { data: updated, error: writeError } = await admin
    .from("meetings")
    .update({
      confirmed_start: new Date(startMs).toISOString(),
      attendees: keys.filter((k) => free.includes(k)),
      confirmed_available: free.length,
      confirmed_total: result.total,
      excluded: unconnected,
      unreadable,
    })
    .eq("id", id)
    .eq("status", "confirmed")
    .select()
    .single();
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });

  await admin.from("meeting_rsvps").delete().eq("meeting_id", id);
  await notifyRescheduled(
    { ...(updated as Meeting), participants: keys },
    meeting.confirmed_start,
    declined,
    req.nextUrl.origin,
    labels,
  );
  return Response.json({ ok: true });
}
