import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability, connectedMembers } from "@/lib/server/availability";
import { meetingMembers } from "@/lib/server/guests";
import { manualMembers } from "@/lib/server/manual";
import { declinesOf, rangeOf, rsvpsOf, settle, type Meeting } from "@/lib/server/meetings";
import { applyRsvps } from "@/lib/rsvp";
import { filesOf } from "@/lib/server/files";

/**
 * 会議の詳細。参加者ごとの状態（カレンダー連携／手動入力／未登録／読み込めない／不参加）と、
 * 募集中なら「今のカレンダーで決めたらどうなるか」の候補を返す。
 * 候補は結果発表より後の時間だけ（発表前の時間に決まることは無いので）。
 * 誰がいつ埋まっているかは返さない。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "会議が見つかりません" }, { status: 404 });

  let meeting: Meeting;
  try {
    meeting = await settle(admin, data as Meeting, req.nextUrl.origin);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // 参加者は選ばれたメンバーと外部ゲスト。ゲストは画面に出すとき labels で名前にする
  const { keys, labels } = await meetingMembers(admin, meeting);
  meeting = { ...meeting, participants: keys };
  let declined = await declinesOf(admin, id);
  // 決まった後の参加登録（参加する／やめる）を出欠に上書きする
  if (meeting.status === "confirmed") {
    const applied = applyRsvps(
      meeting.participants,
      meeting.attendees ?? [],
      declined,
      await rsvpsOf(admin, id),
    );
    meeting = { ...meeting, participants: applied.participants, attendees: applied.attendees };
    declined = applied.declined;
  }
  const [connected, manual] = await Promise.all([
    connectedMembers(admin),
    manualMembers(admin, id, meeting.participants),
  ]);
  let preview = null;
  if (meeting.status === "open") {
    const members = meeting.participants.filter((p) => !declined.includes(p));
    const { result, unconnected, unreadable } = await availability(
      admin,
      members,
      rangeOf(meeting),
      Math.max(Date.now(), Date.parse(meeting.deadline)),
      meeting.id,
    );
    preview = { result, unconnected, unreadable };
  }

  // 募集中は今読めるか、決定後は決めたときに読めたかで「読み込めない」を出す
  const unreadable = preview ? preview.unreadable : (meeting.unreadable ?? []);
  const participants = meeting.participants.map((name) => ({
    name,
    state: declined.includes(name)
      ? "declined"
      : unreadable.includes(name)
        ? "unreadable"
        : connected.has(name)
          ? "connected"
          : manual.has(name)
            ? "manual"
            : "unconnected",
  }));

  // 参加登録を受け付けるのは、決まった会議が終わる時刻まで
  const rsvpOpen =
    meeting.status === "confirmed" &&
    !!meeting.confirmed_start &&
    Date.parse(meeting.confirmed_start) + meeting.duration_min * 60 * 1000 > Date.now();

  const files = await filesOf(admin, id);
  return Response.json({ meeting, participants, preview, rsvpOpen, labels, files });
}
