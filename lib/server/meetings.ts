import type { SupabaseClient } from "@supabase/supabase-js";
import { availability } from "./availability";

export type Meeting = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  organizer: string;
  participants: string[];
  duration_min: number;
  from_date: string;
  days: number;
  day_start_min: number;
  day_end_min: number;
  deadline: string;
  status: "open" | "confirmed" | "failed";
  confirmed_start: string | null;
  confirmed_available: number | null;
  confirmed_total: number | null;
  excluded: string[];
  created_at: string;
};

export function rangeOf(m: Meeting) {
  return {
    fromDate: m.from_date,
    days: m.days,
    durationMin: m.duration_min,
    dayStartMin: m.day_start_min,
    dayEndMin: m.day_end_min,
  };
}

export async function declinesOf(admin: SupabaseClient, meetingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("meeting_declines")
    .select("member_name")
    .eq("meeting_id", meetingId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.member_name as string);
}

/**
 * 締切を過ぎた募集中の会議を決める。候補のうち一番早い時間に決め、
 * 候補が無ければ不成立にする。
 * 定時ジョブと画面を開いたときの両方から呼ばれるので、status='open' を条件に
 * 更新して、同じ会議を二重に決めないようにしている。
 */
export async function settle(admin: SupabaseClient, meeting: Meeting): Promise<Meeting> {
  if (meeting.status !== "open" || Date.parse(meeting.deadline) > Date.now()) return meeting;

  const declined = await declinesOf(admin, meeting.id);
  const members = meeting.participants.filter((p) => !declined.includes(p));
  const { result, excluded } = await availability(admin, members, rangeOf(meeting), Date.now());
  const first = result.windows[0];

  const { data, error } = await admin
    .from("meetings")
    .update(
      first
        ? {
            status: "confirmed",
            confirmed_start: new Date(first.start).toISOString(),
            confirmed_available: result.available,
            confirmed_total: result.total,
            excluded,
          }
        : { status: "failed", confirmed_total: result.total, excluded },
    )
    .eq("id", meeting.id)
    .eq("status", "open")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  // 別の呼び出しが先に決めていたら、その結果を読み直す
  if (!data) {
    const { data: fresh } = await admin.from("meetings").select().eq("id", meeting.id).single();
    return fresh as Meeting;
  }
  return data as Meeting;
}

/** 締切を過ぎた募集中の会議をまとめて決める（定時ジョブ用） */
export async function settleDue(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("meetings")
    .select()
    .eq("status", "open")
    .lte("deadline", new Date().toISOString());
  if (error) throw new Error(error.message);
  for (const m of (data ?? []) as Meeting[]) {
    try {
      await settle(admin, m);
    } catch (e) {
      console.error(`[meetings] ${m.id} の決定に失敗: ${(e as Error).message}`);
    }
  }
  return data?.length ?? 0;
}
