import type { SupabaseClient } from "@supabase/supabase-js";
import { findSlots, type Busy, type SlotResult } from "../slots";
import type { CalendarSource } from "./admin";
import { memberBusy } from "./busy";

export type SearchRange = {
  fromDate: string;
  days: number;
  durationMin: number;
  dayStartMin: number;
  dayEndMin: number;
};

/**
 * 指定した人たちのカレンダーを読み、会議を入れられる時間を探す。
 * カレンダー未連携（unconnected）・読み込み失敗（unreadable）の人は計算から外し、
 * 名前だけ返す。決定した時間に誰が出られるかを出すため、読めた人の予定も返す。
 */
export async function availability(
  admin: SupabaseClient,
  members: string[],
  range: SearchRange,
  notBefore: number,
): Promise<{
  result: SlotResult;
  unconnected: string[];
  unreadable: string[];
  busyByMember: Record<string, Busy[]>;
}> {
  const { data, error } = await admin
    .from("calendar_sources")
    .select("id, member_name, provider, label, secret")
    .in("member_name", members);
  if (error) throw new Error(error.message);

  const from = Date.parse(`${range.fromDate}T00:00:00+09:00`);
  const to = from + range.days * 24 * 60 * 60 * 1000;

  const busyByMember: Record<string, Busy[]> = {};
  const unconnected: string[] = [];
  const unreadable: string[] = [];
  await Promise.all(
    members.map(async (name) => {
      const sources = (data as CalendarSource[]).filter((s) => s.member_name === name);
      if (sources.length === 0) return unconnected.push(name);
      try {
        busyByMember[name] = await memberBusy(sources, from, to);
      } catch (e) {
        console.error(`[availability] ${name}: ${(e as Error).message}`);
        unreadable.push(name);
      }
    }),
  );

  const result = findSlots({ busyByMember, ...range, notBefore });
  // 名前の並びは参加者の並びにそろえる（Promise.all の完了順にしない）
  return {
    result,
    unconnected: members.filter((m) => unconnected.includes(m)),
    unreadable: members.filter((m) => unreadable.includes(m)),
    busyByMember,
  };
}

/** カレンダーを 1 つ以上つないでいる人の名前 */
export async function connectedMembers(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("calendar_sources").select("member_name");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.member_name as string));
}
