import type { NextRequest } from "next/server";
import { MEETING_DEADLINE_HOURS } from "@/lib/meetings";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { settleDue, type Meeting } from "@/lib/server/meetings";

const LIST_FIELDS =
  "id, title, organizer, participants, duration_min, deadline, status, confirmed_start, created_at";

/** 会議の一覧。締切を過ぎたものは返す前に決めておく（定時ジョブより先に開かれた場合） */
export async function GET() {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    await settleDue(admin);
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
  fromDate?: string;
  days?: number;
  dayStartMin?: number;
  dayEndMin?: number;
  deadlineHours?: number;
};

function invalid(b: Body): string | null {
  if (!b.title?.trim()) return "会議名を入れてください";
  if (!b.organizer || !isMember(b.organizer)) return "主催者を選んでください";
  if (!Array.isArray(b.participants) || b.participants.length === 0) return "参加者を選んでください";
  if (!b.participants.every(isMember)) return "メンバー以外が含まれています";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fromDate ?? "")) return "候補の開始日が不正です";
  if (!(b.days! >= 1 && b.days! <= 31)) return "候補の期間は 1〜31 日にしてください";
  if (!(b.durationMin! >= 15 && b.durationMin! <= 8 * 60)) return "会議の長さが不正です";
  if (!(b.dayStartMin! >= 0 && b.dayEndMin! <= 24 * 60 && b.dayStartMin! < b.dayEndMin!)) {
    return "時間帯が不正です";
  }
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
  const rangeEnd = Date.parse(`${b.fromDate}T00:00:00+09:00`) + b.days! * 24 * 60 * 60 * 1000;
  if (rangeEnd <= deadline) {
    return Response.json(
      { error: "候補の期間が結果発表より前に終わってしまいます。期間を後ろにずらしてください" },
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
      from_date: b.fromDate,
      days: b.days,
      day_start_min: b.dayStartMin,
      day_end_min: b.dayEndMin,
      deadline: new Date(deadline).toISOString(),
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: (data as Pick<Meeting, "id">).id });
}
