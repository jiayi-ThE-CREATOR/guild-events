import type { SupabaseClient } from "@supabase/supabase-js";
import { pickOption, type PollOption } from "../poll.ts";
import { notifyPollDecided } from "./discord.ts";
import { syncEvent } from "./event-sync.ts";
import type { Meeting } from "./meetings";

/** その会議の投票の選択肢と、それぞれに印を付けた人（開始の早い順） */
export async function pollOf(admin: SupabaseClient, meetingId: string): Promise<PollOption[]> {
  const { data: options, error } = await admin
    .from("meeting_poll_options")
    .select("id, start_at, end_at")
    .eq("meeting_id", meetingId)
    .order("start_at");
  if (error) throw new Error(error.message);
  const ids = (options ?? []).map((o) => o.id as string);
  if (ids.length === 0) return [];
  const { data: votes, error: voteError } = await admin
    .from("meeting_poll_votes")
    .select("option_id, member_name")
    .in("option_id", ids)
    .order("created_at");
  if (voteError) throw new Error(voteError.message);
  return (options ?? []).map((o) => ({
    id: o.id as string,
    start: new Date(o.start_at as string).toISOString(),
    end: new Date(o.end_at as string).toISOString(),
    voters: (votes ?? []).filter((v) => v.option_id === o.id).map((v) => v.member_name as string),
  }));
}

/**
 * 投票中の会議を決める。optionId を渡せばその日程に（主催者が先に決めるとき）、
 * 無ければ一番多く印が付いた日程に（締め切りを過ぎたとき）。誰も付けていなければ不成立。
 * 印を付けた人を「参加できる」にする（イベントでは自動で参加になる。syncEvent）。
 * status='voting' を条件に更新するので、定時ジョブと画面から同時に呼ばれても二重に決めない。
 * 決めた呼び出しだけが Discord に流す。決めた（または既に決まっていた）会議を返す。
 */
export async function decidePoll(
  admin: SupabaseClient,
  meeting: Meeting,
  origin: string,
  optionId?: string,
): Promise<Meeting> {
  if (meeting.status !== "voting") return meeting;
  const options = await pollOf(admin, meeting.id);
  const chosen = optionId ? (options.find((o) => o.id === optionId) ?? null) : pickOption(options);
  if (optionId && !chosen) throw new Error("その日程は選択肢にありません");

  const attendees = chosen ? meeting.participants.filter((p) => chosen.voters.includes(p)) : [];
  const { data, error } = await admin
    .from("meetings")
    .update(
      chosen
        ? {
            status: "confirmed",
            confirmed_start: chosen.start,
            duration_min: (Date.parse(chosen.end) - Date.parse(chosen.start)) / 60_000,
            confirmed_available: attendees.length,
            confirmed_total: meeting.participants.length,
            attendees,
            excluded: [],
            unreadable: [],
            ...(optionId ? { deadline: new Date().toISOString() } : {}),
          }
        : { status: "failed", confirmed_total: meeting.participants.length, excluded: [], unreadable: [] },
    )
    .eq("id", meeting.id)
    .eq("status", "voting")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { data: fresh } = await admin.from("meetings").select().eq("id", meeting.id).single();
    return fresh as Meeting;
  }
  await syncEvent(admin, data as Meeting);
  await notifyPollDecided(data as Meeting, chosen, origin);
  return data as Meeting;
}

/** 締め切りを過ぎた投票中の会議をまとめて決める（定時ジョブ・一覧を開いたとき） */
export async function settleDuePolls(admin: SupabaseClient, origin: string): Promise<number> {
  const { data, error } = await admin
    .from("meetings")
    .select()
    .eq("status", "voting")
    .lte("deadline", new Date().toISOString());
  if (error) throw new Error(error.message);
  for (const m of (data ?? []) as Meeting[]) {
    try {
      await decidePoll(admin, m, origin);
    } catch (e) {
      console.error(`[poll] ${m.id} の決定に失敗: ${(e as Error).message}`);
    }
  }
  return data?.length ?? 0;
}
