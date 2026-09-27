import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { applyRsvps } from "@/lib/rsvp";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { notifyRsvp } from "@/lib/server/discord";
import { declinesOf, rsvpsOf, type Meeting } from "@/lib/server/meetings";

/**
 * 決まった会議への参加登録（参加する／参加をやめる）。メンバーなら誰でも使える。
 * 会議が終わる時刻まで受け付ける。出欠が変わったときだけ Discord に流す。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { member, attending } = (await req.json()) as { member?: string; attending?: unknown };
  if (!member || !isMember(member) || typeof attending !== "boolean") {
    return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  }

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (meeting.status !== "confirmed" || !meeting.confirmed_start) {
    return Response.json({ error: "日時が決まった会議だけ登録できます" }, { status: 409 });
  }
  if (Date.parse(meeting.confirmed_start) + meeting.duration_min * 60 * 1000 <= Date.now()) {
    return Response.json({ error: "この会議はもう終わっています" }, { status: 409 });
  }

  const declined = await declinesOf(admin, id);
  const before = applyRsvps(meeting.participants, meeting.attendees ?? [], declined, await rsvpsOf(admin, id));

  const { error: writeError } = await admin.from("meeting_rsvps").upsert({
    meeting_id: id,
    member_name: member,
    attending,
    updated_at: new Date().toISOString(),
  });
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });

  if (before.attendees.includes(member) !== attending) {
    const after = applyRsvps(meeting.participants, meeting.attendees ?? [], declined, await rsvpsOf(admin, id));
    await notifyRsvp(meeting, member, attending, after.attendees.length, req.nextUrl.origin);
  }
  return Response.json({ ok: true });
}
