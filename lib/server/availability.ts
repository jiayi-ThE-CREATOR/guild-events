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
 * カレンダー未連携・読み込み失敗の人は計算から外し、excluded で名前だけ返す。
 */
export async function availability(
  admin: SupabaseClient,
  members: string[],
  range: SearchRange,
  notBefore: number,
): Promise<{ result: SlotResult; excluded: string[] }> {
  const { data, error } = await admin
    .from("calendar_sources")
    .select("id, member_name, provider, label, secret")
    .in("member_name", members);
  if (error) throw new Error(error.message);

  const from = Date.parse(`${range.fromDate}T00:00:00+09:00`);
  const to = from + range.days * 24 * 60 * 60 * 1000;

  const busyByMember: Record<string, Busy[]> = {};
  const excluded: string[] = [];
  await Promise.all(
    members.map(async (name) => {
      const sources = (data as CalendarSource[]).filter((s) => s.member_name === name);
      if (sources.length === 0) return excluded.push(name);
      try {
        busyByMember[name] = await memberBusy(sources, from, to);
      } catch (e) {
        console.error(`[availability] ${name}: ${(e as Error).message}`);
        excluded.push(name);
      }
    }),
  );

  const result = findSlots({ busyByMember, ...range, notBefore });
  return { result, excluded: members.filter((m) => excluded.includes(m)) };
}

/** カレンダーを 1 つ以上つないでいる人の名前 */
export async function connectedMembers(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("calendar_sources").select("member_name");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.member_name as string));
}
