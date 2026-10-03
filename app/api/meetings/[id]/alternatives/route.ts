import type { NextRequest } from "next/server";
import { excludeSlot } from "@/lib/slots";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability } from "@/lib/server/availability";
import { declinesOf, rangeOf, type Meeting } from "@/lib/server/meetings";

/**
 * 決まった会議について、決まった時間のほかに「全員が参加できる時間」を返す。
 * 今のカレンダーで計算し直す（決定後に入った予定も反映される）。
 * 範囲は会議の候補の中で、今より後だけ。「全員」は自動で決めたときと同じく、
 * 不参加にした人と予定未登録・読み込めない人を除いた人たち。
 * カレンダーを読むので数秒かかる。会議ページの本体とは分けて読み込ませる。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (meeting.status !== "confirmed" || !meeting.confirmed_start) {
    return Response.json({ error: "日時が決まった会議だけです" }, { status: 409 });
  }

  const declined = await declinesOf(admin, id);
  const members = meeting.participants.filter((p) => !declined.includes(p));
  const { result, unconnected, unreadable } = await availability(
    admin,
    members,
    rangeOf(meeting),
    Date.now(),
    meeting.id,
  );

  const start = Date.parse(meeting.confirmed_start);
  const windows =
    result.total > 0 && result.available === result.total
      ? excludeSlot(result.windows, start, start + meeting.duration_min * 60 * 1000, meeting.duration_min)
      : [];
  return Response.json({ total: result.total, windows, unconnected, unreadable });
}
