import type { SupabaseClient } from "@supabase/supabase-js";
import { CELL_MIN, manualState, validCells, type CellState } from "../manual";
import { rangeIntervals } from "../ranges";
import type { CalendarSource } from "./admin";
import { memberBusy } from "./busy";
import { weeklyLayers } from "./manual";
import { rangeOf, type Meeting } from "./meetings";

/**
 * 「この会議の予定」（手動）の読み書き。メンバー（名前）とゲスト（guest:<id>）で共用。
 * 読むときは保存済みの入力に加えて、下の層（毎週の予定・外部カレンダー）から
 * 今どう見えているかを base として返す。塗る画面で薄く重ねて表示するため。
 */

export async function readEntry(admin: SupabaseClient, meeting: Meeting, key: string) {
  const [{ data: entry }, weekly, { data: sources }] = await Promise.all([
    admin
      .from("meeting_entries")
      .select("cells, exclusive")
      .eq("meeting_id", meeting.id)
      .eq("member_name", key)
      .maybeSingle(),
    weeklyLayers(admin, [key]),
    admin
      .from("calendar_sources")
      .select("id, member_name, provider, label, secret")
      .eq("member_name", key),
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
  const w = weekly.get(key) ?? null;
  for (const span of intervals) {
    for (let t = span.start; t < span.end; t += cell) {
      const state =
        manualState(t, w, null) ??
        (calendar.some((b) => b.start < t + cell && b.end > t) ? "busy" : null);
      if (state) base[String(t)] = state;
    }
  }

  return {
    cells: entry?.cells ?? {},
    exclusive: entry?.exclusive ?? false,
    base,
    calendarError,
  };
}

/** 保存する。問題があれば { error, status }、無ければ null */
export async function writeEntry(
  admin: SupabaseClient,
  meeting: Meeting,
  key: string,
  cells: unknown,
  exclusive: unknown,
): Promise<{ error: string; status: number } | null> {
  if (meeting.status !== "open" || Date.parse(meeting.deadline) <= Date.now()) {
    return { error: "募集はもう締め切られています", status: 409 };
  }
  if (!validCells(cells, "meeting") || typeof exclusive !== "boolean") {
    return { error: "予定の形が正しくありません", status: 400 };
  }
  const { error } = await admin.from("meeting_entries").upsert({
    meeting_id: meeting.id,
    member_name: key,
    cells,
    exclusive,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message, status: 500 } : null;
}
