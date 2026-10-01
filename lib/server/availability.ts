import type { SupabaseClient } from "@supabase/supabase-js";
import { combineBusy, isEmptyLayer } from "../manual";
import { rangeIntervals, type CandidateRange } from "../ranges";
import { findSlots, type Busy, type SlotResult } from "../slots";
import type { CalendarSource } from "./admin";
import { memberBusy } from "./busy";
import { meetingLayers, weeklyLayers } from "./manual";

export type SearchRange = {
  durationMin: number;
  ranges: CandidateRange[];
};

/**
 * 指定した人たちの予定を読み、会議を入れられる時間を探す。
 * 予定の出どころは外部カレンダーと手動（毎週・この会議）で、lib/manual.ts の
 * combineBusy が 30 分ごとに合成する（手動が優先）。
 * どれも無い人（unconnected＝予定未登録）と、外部カレンダーを読めなかった人
 * （unreadable）は計算から外し、名前だけ返す。決定した時間に誰が出られるかを
 * 出すため、合成後の予定も返す。
 */
export async function availability(
  admin: SupabaseClient,
  members: string[],
  range: SearchRange,
  notBefore: number,
  meetingId: string,
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
  const [weekly, meeting] = await Promise.all([
    weeklyLayers(admin, members),
    meetingLayers(admin, meetingId, members),
  ]);

  // 予定は候補の最初の日の 0 時から最後の日の終わりまで読む（30 分の区切りにそろう）
  const intervals = rangeIntervals(range.ranges);
  const from = Date.parse(`${range.ranges.map((r) => r.fromDate).sort()[0]}T00:00:00+09:00`);
  const lastDay = range.ranges.map((r) => r.toDate).sort().at(-1);
  const to = Date.parse(`${lastDay}T00:00:00+09:00`) + 24 * 60 * 60 * 1000;

  const busyByMember: Record<string, Busy[]> = {};
  const unconnected: string[] = [];
  const unreadable: string[] = [];
  await Promise.all(
    members.map(async (name) => {
      const sources = (data as CalendarSource[]).filter((s) => s.member_name === name);
      const w = weekly.get(name) ?? null;
      const m = meeting.get(name) ?? null;
      if (sources.length === 0 && isEmptyLayer(w) && isEmptyLayer(m)) {
        return unconnected.push(name);
      }
      try {
        const calendar = sources.length > 0 ? await memberBusy(sources, from, to) : [];
        busyByMember[name] = combineBusy(calendar, w, m, from, to);
      } catch (e) {
        console.error(`[availability] ${name}: ${(e as Error).message}`);
        unreadable.push(name);
      }
    }),
  );

  const result = findSlots({ busyByMember, durationMin: range.durationMin, intervals, notBefore });
  // 名前の並びは参加者の並びにそろえる（Promise.all の完了順にしない）
  return {
    result,
    unconnected: members.filter((m) => unconnected.includes(m)),
    unreadable: members.filter((m) => unreadable.includes(m)),
    busyByMember,
  };
}

/**
 * 会議に関係なく予定を登録済みの人（外部カレンダーか毎週の予定がある）。
 * 会議ごとの手動の予定は会議を作った時点ではまだ無いので見ない。
 */
export async function registeredMembers(admin: SupabaseClient): Promise<Set<string>> {
  const [connected, { data, error }] = await Promise.all([
    connectedMembers(admin),
    admin.from("weekly_schedules").select("member_name, cells, exclusive"),
  ]);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    if (!isEmptyLayer({ cells: r.cells, exclusive: r.exclusive })) connected.add(r.member_name);
  }
  return connected;
}

/** カレンダーを 1 つ以上つないでいる人の名前 */
export async function connectedMembers(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("calendar_sources").select("member_name");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.member_name as string));
}
