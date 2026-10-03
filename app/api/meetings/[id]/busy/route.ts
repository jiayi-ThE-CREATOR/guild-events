import type { NextRequest } from "next/server";
import { CELL_MIN } from "@/lib/manual";
import { rangeIntervals } from "@/lib/ranges";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { availability } from "@/lib/server/availability";
import { meetingMembers } from "@/lib/server/guests";
import { declinesOf, rangeOf, type Meeting } from "@/lib/server/meetings";

/**
 * 会議ページの「みんなの予定」：候補の範囲の 30 分ごとに、誰が予定ありかを返す。
 * 予定の中身（件名など）は返さない。今のカレンダー・手動の予定で計算する。
 * メンバー向けの会議ページだけで使う（ゲストのページには出さない）。
 * 不参加にした人は出さない。予定未登録・読み込めない人は名前だけ返す。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });

  const declined = await declinesOf(admin, id);
  const { keys, labels } = await meetingMembers(admin, meeting);
  const members = keys.filter((k) => !declined.includes(k));
  const range = rangeOf(meeting);
  const { busyByMember, unconnected, unreadable } = await availability(admin, members, range, 0, meeting.id);

  // マス（開始時刻の UTC ミリ秒）→ そのマスに予定がある人
  const cell = CELL_MIN * 60 * 1000;
  const shown = members.filter((k) => k in busyByMember);
  const cells: Record<string, string[]> = {};
  for (const span of rangeIntervals(range.ranges)) {
    for (let t = span.start; t < span.end; t += cell) {
      const busy = shown.filter((k) => busyByMember[k].some((b) => b.start < t + cell && b.end > t));
      if (busy.length > 0) cells[String(t)] = busy;
    }
  }
  return Response.json({ members: shown, cells, unconnected, unreadable, labels });
}
