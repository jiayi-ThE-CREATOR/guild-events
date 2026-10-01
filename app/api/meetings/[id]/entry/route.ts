import type { NextRequest } from "next/server";
import { CELL_MIN, manualState, validCells, type CellState } from "@/lib/manual";
import { getAdmin, NOT_CONFIGURED, type CalendarSource } from "@/lib/server/admin";
import { memberBusy } from "@/lib/server/busy";
import { weeklyLayers } from "@/lib/server/manual";
import { rangeIntervals } from "@/lib/ranges";
import { rangeOf, type Meeting } from "@/lib/server/meetings";

/**
 * 会議ページの「この会議の予定」の読み書き（本人だけが使う前提）。
 * GET は、保存済みの入力に加えて、下の層（毎週の予定・外部カレンダー）から
 * 今どう見えているかを base として返す。塗る画面で薄く重ねて表示するため。
 */

type Params = { params: Promise<{ id: string }> };

async function loadMeeting(id: string) {
  const admin = getAdmin();
  if (!admin) return { error: Response.json({ error: NOT_CONFIGURED }, { status: 503 }) };
  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return { error: Response.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: Response.json({ error: "会議が見つかりません" }, { status: 404 }) };
  return { admin, meeting: data as Meeting };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const loaded = await loadMeeting(id);
  if (loaded.error) return loaded.error;
  const { admin, meeting } = loaded;
  const member = req.nextUrl.searchParams.get("member") ?? "";
  if (!meeting.participants.includes(member)) {
    return Response.json({ error: "この会議の参加者ではありません" }, { status: 403 });
  }

  const [{ data: entry }, weekly, { data: sources }] = await Promise.all([
    admin
      .from("meeting_entries")
      .select("cells, exclusive")
      .eq("meeting_id", id)
      .eq("member_name", member)
      .maybeSingle(),
    weeklyLayers(admin, [member]),
    admin
      .from("calendar_sources")
      .select("id, member_name, provider, label, secret")
      .eq("member_name", member),
  ]);

  const intervals = rangeIntervals(rangeOf(meeting).ranges);
  const from = intervals[0].start;
  const to = intervals[intervals.length - 1].end;
  let calendar: { start: number; end: number }[] = [];
  let calendarError = false;
  if ((sources ?? []).length > 0) {
    try {
      calendar = await memberBusy(sources as CalendarSource[], from, to);
    } catch {
      calendarError = true;
    }
  }

  // 候補の時間帯の中だけ、下の層での見え方を出す
  const base: Record<string, CellState> = {};
  const cell = CELL_MIN * 60 * 1000;
  const w = weekly.get(member) ?? null;
  for (const span of intervals) {
    for (let t = span.start; t < span.end; t += cell) {
      const state =
        manualState(t, w, null) ??
        (calendar.some((b) => b.start < t + cell && b.end > t) ? "busy" : null);
      if (state) base[String(t)] = state;
    }
  }

  return Response.json({
    cells: entry?.cells ?? {},
    exclusive: entry?.exclusive ?? false,
    base,
    calendarError,
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const loaded = await loadMeeting(id);
  if (loaded.error) return loaded.error;
  const { admin, meeting } = loaded;
  const { member, cells, exclusive } = (await req.json()) as {
    member?: string;
    cells?: unknown;
    exclusive?: unknown;
  };
  if (!member || !meeting.participants.includes(member)) {
    return Response.json({ error: "この会議の参加者ではありません" }, { status: 403 });
  }
  if (meeting.status !== "open" || Date.parse(meeting.deadline) <= Date.now()) {
    return Response.json({ error: "募集はもう締め切られています" }, { status: 409 });
  }
  if (!validCells(cells, "meeting") || typeof exclusive !== "boolean") {
    return Response.json({ error: "予定の形が正しくありません" }, { status: 400 });
  }

  const { error } = await admin.from("meeting_entries").upsert({
    meeting_id: id,
    member_name: member,
    cells,
    exclusive,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
