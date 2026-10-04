import type { SupabaseClient } from "@supabase/supabase-js";
import { meetingRanges, type CandidateRange } from "../ranges";
import type { Rsvp } from "../rsvp";
import { guestKey } from "../guests";
import { isEmptyLayer } from "../manual";
import { freeMembers } from "../slots";
import { availability } from "./availability";
import { notifyDiscord } from "./discord";
import { meetingMembers } from "./guests";

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
  /** 候補（複数可）。null は 009 より前に作った会議で、古い列の 1 件として扱う */
  ranges: CandidateRange[] | null;
  deadline: string;
  status: "open" | "confirmed" | "failed";
  confirmed_start: string | null;
  confirmed_available: number | null;
  confirmed_total: number | null;
  /** 予定未登録（外部カレンダーも手動の予定も無い）で計算に入らなかった人 */
  excluded: string[];
  /** カレンダーはつないでいるが読み込めなかった人（権限不足・連携切れなど） */
  unreadable: string[];
  /** 決定した時間に予定が空いている人。005 以前に決まった会議は null */
  attendees: string[] | null;
  created_at: string;
};

export function rangeOf(m: Meeting) {
  return { durationMin: m.duration_min, ranges: meetingRanges(m) };
}

export async function declinesOf(admin: SupabaseClient, meetingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("meeting_declines")
    .select("member_name")
    .eq("meeting_id", meetingId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.member_name as string);
}

export async function rsvpsOf(admin: SupabaseClient, meetingId: string): Promise<Rsvp[]> {
  const { data, error } = await admin
    .from("meeting_rsvps")
    .select("member_name, attending")
    .eq("meeting_id", meetingId)
    .order("updated_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Rsvp[];
}

/**
 * 締切を過ぎた募集中の会議を決める。候補のうち一番早い時間に決め、
 * 候補が無ければ不成立にする。
 * 定時ジョブと画面を開いたときの両方から呼ばれるので、status='open' を条件に
 * 更新して、同じ会議を二重に決めないようにしている。
 * 決めた呼び出しだけが Discord に流す（origin はメッセージに載せるリンク用）。
 */
export async function settle(
  admin: SupabaseClient,
  meeting: Meeting,
  origin: string,
): Promise<Meeting> {
  if (meeting.status !== "open" || Date.parse(meeting.deadline) > Date.now()) return meeting;

  const declined = await declinesOf(admin, meeting.id);
  // 参加者は選ばれたメンバーと、招いた外部ゲスト（キーは guest:<id>）
  const { keys, labels } = await meetingMembers(admin, meeting);
  const members = keys.filter((p) => !declined.includes(p));
  const { result, unconnected, unreadable, busyByMember } = await availability(
    admin,
    members,
    rangeOf(meeting),
    Date.now(),
    meeting.id,
  );
  const first = result.windows[0];
  const attendees = first
    ? freeMembers(busyByMember, first.start, first.start + meeting.duration_min * 60 * 1000)
    : [];

  const { data, error } = await admin
    .from("meetings")
    .update(
      first
        ? {
            status: "confirmed",
            confirmed_start: new Date(first.start).toISOString(),
            confirmed_available: result.available,
            confirmed_total: result.total,
            attendees: keys.filter((p) => attendees.includes(p)),
            excluded: unconnected,
            unreadable,
          }
        : { status: "failed", confirmed_total: result.total, excluded: unconnected, unreadable },
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
  await notifyDiscord({ ...(data as Meeting), participants: keys }, declined, origin, labels);
  return data as Meeting;
}

/** 締切を過ぎた募集中の会議をまとめて決める（定時ジョブ用） */
export async function settleDue(admin: SupabaseClient, origin: string): Promise<number> {
  const { data, error } = await admin
    .from("meetings")
    .select()
    .eq("status", "open")
    .lte("deadline", new Date().toISOString());
  if (error) throw new Error(error.message);
  for (const m of (data ?? []) as Meeting[]) {
    try {
      await settle(admin, m, origin);
    } catch (e) {
      console.error(`[meetings] ${m.id} の決定に失敗: ${(e as Error).message}`);
    }
  }
  return data?.length ?? 0;
}

/**
 * 募集中の会議ごとに「予定を入れた人 / 不参加を除いた参加者」を数える（一覧用）。
 * カレンダーをつないでいるか、毎週かその会議に手入力があれば入れたとみなす
 */
export async function enteredCounts(
  admin: SupabaseClient,
  meetings: { id: string; participants: string[] }[],
): Promise<Map<string, { done: number; of: number }>> {
  const counts = new Map<string, { done: number; of: number }>();
  if (meetings.length === 0) return counts;
  const ids = meetings.map((m) => m.id);
  const [guests, declines, entries, weekly, sources] = await Promise.all([
    admin.from("meeting_guests").select("id, meeting_id").in("meeting_id", ids),
    admin.from("meeting_declines").select("meeting_id, member_name").in("meeting_id", ids),
    admin.from("meeting_entries").select("meeting_id, member_name, cells, exclusive").in("meeting_id", ids),
    admin.from("weekly_schedules").select("member_name, cells, exclusive"),
    admin.from("calendar_sources").select("member_name"),
  ]);
  for (const r of [guests, declines, entries, weekly, sources]) if (r.error) throw new Error(r.error.message);

  const registered = new Set<string>((sources.data ?? []).map((r) => r.member_name));
  for (const r of weekly.data ?? []) if (!isEmptyLayer(r)) registered.add(r.member_name);
  const has = (rows: { meeting_id: string; member_name: string }[] | null, id: string, who: string) =>
    (rows ?? []).some((r) => r.meeting_id === id && r.member_name === who);

  for (const m of meetings) {
    const keys = [
      ...m.participants,
      ...(guests.data ?? []).filter((g) => g.meeting_id === m.id).map((g) => guestKey(g.id)),
    ].filter((k) => !has(declines.data, m.id, k));
    const done = keys.filter(
      (k) =>
        registered.has(k) ||
        (entries.data ?? []).some((e) => e.meeting_id === m.id && e.member_name === k && !isEmptyLayer(e)),
    ).length;
    counts.set(m.id, { done, of: keys.length });
  }
  return counts;
}
