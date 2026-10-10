import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { decideMeeting } from "@/lib/server/decide";
import type { Meeting } from "@/lib/server/meetings";

/**
 * 日時を手で決める・変える。募集中の会議なら、ここで募集を締め切ってこの日時に決める。
 * 決まった会議なら日時を変える。日付・開始・終了は自由（30 分刻み・今より後・その日のうちに終わる）。
 * 終了を渡すと会議の長さもそれに変える（募集時の長さに縛らない）。中身は decideMeeting。
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
  if (meeting.status !== "open" && (meeting.status !== "confirmed" || !meeting.confirmed_start)) {
    return Response.json({ error: "募集中か、日時が決まった会議だけ決められます" }, { status: 409 });
  }

  // 終了が無ければ今の長さのまま
  const endMs = end === undefined ? startMs + meeting.duration_min * 60 * 1000 : Date.parse(end);
  if (Number.isNaN(endMs) || endMs % HALF_HOUR !== 0 || endMs <= startMs) {
    return Response.json({ error: "終了時刻は開始より後にしてください（30 分刻み）" }, { status: 400 });
  }

  const problem = await decideMeeting(admin, meeting, startMs, endMs, req.nextUrl.origin);
  if (problem) return Response.json({ error: problem.error }, { status: problem.status });
  return Response.json({ ok: true });
}
