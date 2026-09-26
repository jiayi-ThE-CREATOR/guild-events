import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability, connectedMembers } from "@/lib/server/availability";
import { declinesOf, rangeOf, settle, type Meeting } from "@/lib/server/meetings";

/**
 * 会議の詳細。参加者ごとの状態（連携済み／未連携／参加できない）と、
 * 募集中なら「今のカレンダーで決めたらどうなるか」の候補を返す。
 * 候補は結果発表より後の時間だけ（発表前の時間に決まることは無いので）。
 * 誰がいつ埋まっているかは返さない。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "会議が見つかりません" }, { status: 404 });

  let meeting: Meeting;
  try {
    meeting = await settle(admin, data as Meeting);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const [declined, connected] = await Promise.all([
    declinesOf(admin, id),
    connectedMembers(admin),
  ]);
  let preview = null;
  if (meeting.status === "open") {
    const members = meeting.participants.filter((p) => !declined.includes(p));
    const { result, unconnected, unreadable } = await availability(
      admin,
      members,
      rangeOf(meeting),
      Math.max(Date.now(), Date.parse(meeting.deadline)),
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
          : "unconnected",
  }));

  return Response.json({ meeting, participants, preview });
}
