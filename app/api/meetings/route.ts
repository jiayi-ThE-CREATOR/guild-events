import type { NextRequest } from "next/server";
import { MEETING_DEADLINE_HOURS } from "@/lib/meetings";
import { envelope, rangeIntervals, rangesProblem, type CandidateRange } from "@/lib/ranges";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { registeredMembers } from "@/lib/server/availability";
import { notifyOpened } from "@/lib/server/discord";
import { settleDue, type Meeting } from "@/lib/server/meetings";

const LIST_FIELDS =
  "id, title, organizer, participants, duration_min, deadline, status, confirmed_start, created_at";

/** 会議の一覧。締切を過ぎたものは返す前に決めておく（定時ジョブより先に開かれた場合） */
export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    await settleDue(admin, req.nextUrl.origin);
  } catch (e) {
    console.error(`[meetings] ${(e as Error).message}`);
  }
  const { data, error } = await admin
    .from("meetings")
    .select(LIST_FIELDS)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meetings: data });
}

type Body = {
  title?: string;
  description?: string;
  location?: string;
  organizer?: string;
  participants?: string[];
  durationMin?: number;
  ranges?: CandidateRange[];
  deadlineHours?: number;
};

function invalid(b: Body): string | null {
  if (!b.title?.trim()) return "会議名を入れてください";
  if (!b.organizer || !isMember(b.organizer)) return "主催者を選んでください";
  if (!Array.isArray(b.participants) || b.participants.length === 0) return "参加者を選んでください";
  if (!b.participants.every(isMember)) return "メンバー以外が含まれています";
  const rangeProblem = rangesProblem(b.ranges);
  if (rangeProblem) return rangeProblem;
  if (!(b.durationMin! >= 15 && b.durationMin! <= 8 * 60)) return "会議の長さが不正です";
  if (!MEETING_DEADLINE_HOURS.includes(b.deadlineHours!)) return "結果発表の時間が不正です";
  return null;
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = (await req.json()) as Body;
  const problem = invalid(b);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const deadline = Date.now() + b.deadlineHours! * 60 * 60 * 1000;
  const intervals = rangeIntervals(b.ranges!);
  if (intervals[intervals.length - 1].end <= deadline) {
    return Response.json(
      { error: "候補がすべて結果発表より前に終わってしまいます。候補を後ろにずらしてください" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("meetings")
    .insert({
      title: b.title!.trim(),
      description: b.description?.trim() || null,
      location: b.location?.trim() || null,
      organizer: b.organizer,
      participants: [...new Set(b.participants)],
      duration_min: b.durationMin,
      ranges: b.ranges,
      ...envelope(b.ranges!),
      deadline: new Date(deadline).toISOString(),
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting;

  // 募集開始を Discord に流す。失敗しても作成そのものは成功として返す
  try {
    const registered = await registeredMembers(admin);
    const unconnected = meeting.participants.filter((p) => !registered.has(p));
    await notifyOpened(meeting, unconnected, req.nextUrl.origin);
  } catch (e) {
    console.error(`[meetings] 募集開始の通知に失敗: ${(e as Error).message}`);
  }
  return Response.json({ id: meeting.id });
}
