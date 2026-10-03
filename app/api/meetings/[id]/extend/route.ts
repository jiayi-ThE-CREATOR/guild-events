import type { NextRequest } from "next/server";
import { MEETING_DEADLINE_HOURS } from "@/lib/meetings";
import { envelope, rangeIntervals, rangesProblem, type CandidateRange } from "@/lib/ranges";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { notifyExtended } from "@/lib/server/discord";
import type { Meeting } from "@/lib/server/meetings";

/**
 * 募集の延長。募集中・決定済み・不成立のどれでもできる。
 * 結果発表を「今から何時間後」に置き直し、候補も入れ直せる。
 * 決定済み・不成立の会議は募集中に戻し、決まっていた日時・出欠・あとからの参加登録を消す
 * （その日時はもう有効ではないため）。各自の予定（カレンダー・手動・不参加）は残す。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { deadlineHours, ranges } = (await req.json()) as { deadlineHours?: number; ranges?: CandidateRange[] };

  if (!MEETING_DEADLINE_HOURS.includes(deadlineHours!)) {
    return Response.json({ error: "結果発表の時間が不正です" }, { status: 400 });
  }
  const problem = rangesProblem(ranges);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const deadline = Date.now() + deadlineHours! * 60 * 60 * 1000;
  const intervals = rangeIntervals(ranges!);
  if (intervals[intervals.length - 1].end <= deadline) {
    return Response.json(
      { error: "候補がすべて結果発表より前に終わってしまいます。候補を後ろにずらしてください" },
      { status: 400 },
    );
  }

  const { data: before, error: readError } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  if (!before) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  const previous = before as Meeting;

  const { data, error } = await admin
    .from("meetings")
    .update({
      status: "open",
      deadline: new Date(deadline).toISOString(),
      ranges,
      ...envelope(ranges!),
      confirmed_start: null,
      confirmed_available: null,
      confirmed_total: null,
      attendees: null,
      excluded: [],
      unreadable: [],
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 決まっていた日時へのあとからの参加登録は、もう意味がないので消す
  if (previous.status !== "open") await admin.from("meeting_rsvps").delete().eq("meeting_id", id);

  await notifyExtended(data as Meeting, previous, req.nextUrl.origin);
  return Response.json({ ok: true });
}
