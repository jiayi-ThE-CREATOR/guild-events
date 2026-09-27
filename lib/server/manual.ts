import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmptyLayer, type ManualLayer } from "../manual";

/** 手動の予定（毎週・この会議）の読み出し。見つからない人は Map に入らない */

export async function weeklyLayers(
  admin: SupabaseClient,
  members: string[],
): Promise<Map<string, ManualLayer>> {
  const { data, error } = await admin
    .from("weekly_schedules")
    .select("member_name, cells, exclusive")
    .in("member_name", members);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.member_name as string, { cells: r.cells, exclusive: r.exclusive }]));
}

export async function meetingLayers(
  admin: SupabaseClient,
  meetingId: string,
  members: string[],
): Promise<Map<string, ManualLayer>> {
  const { data, error } = await admin
    .from("meeting_entries")
    .select("member_name, cells, exclusive")
    .eq("meeting_id", meetingId)
    .in("member_name", members);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.member_name as string, { cells: r.cells, exclusive: r.exclusive }]));
}

/** 毎週かこの会議のどちらかに手動の予定が入っている人 */
export async function manualMembers(
  admin: SupabaseClient,
  meetingId: string,
  members: string[],
): Promise<Set<string>> {
  const [weekly, meeting] = await Promise.all([
    weeklyLayers(admin, members),
    meetingLayers(admin, meetingId, members),
  ]);
  return new Set(
    members.filter((m) => !isEmptyLayer(weekly.get(m)) || !isEmptyLayer(meeting.get(m))),
  );
}
