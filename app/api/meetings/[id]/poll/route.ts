import type { NextRequest } from "next/server";
import { pollStartsProblem, POLL_DEADLINE_HOURS } from "@/lib/poll";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { notifyPollOpened } from "@/lib/server/discord";
import { syncEvent } from "@/lib/server/event-sync";
import type { Meeting } from "@/lib/server/meetings";

/**
 * 日程の投票を始める（イベントの日程調整の 2 回目）。募集中の、イベントにつながった会議だけ。
 * 選んだ開始時刻（1〜10 個）を、会議の長さぶんの選択肢にする。会議は voting（投票中）になり、
 * deadline は投票の締め切りに置き直す。Discord に @everyone で流す。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { starts, deadlineHours } = (await req.json()) as { starts?: string[]; deadlineHours?: number };

  const problem = pollStartsProblem(starts);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (!POLL_DEADLINE_HOURS.includes(deadlineHours!)) {
    return Response.json({ error: "締め切りの時間が不正です" }, { status: 400 });
  }
  const deadline = Date.now() + deadlineHours! * 60 * 60 * 1000;
  const startMs = starts!.map((s) => Date.parse(s)).sort((a, b) => a - b);
  if (startMs[0] <= deadline) {
    return Response.json({ error: "締め切りより後の日程だけ選べます。締め切りを早めるか、日程を選び直してください" }, { status: 400 });
  }

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (!meeting.event_id) return Response.json({ error: "投票はイベントの日程調整でだけ使えます" }, { status: 409 });
  if (meeting.status !== "open") return Response.json({ error: "募集中のときだけ投票を始められます" }, { status: 409 });

  const durationMs = meeting.duration_min * 60 * 1000;
  // 前に途中まで作った選択肢が残っていれば消してから入れる
  await admin.from("meeting_poll_options").delete().eq("meeting_id", id);
  const options = startMs.map((s) => ({
    meeting_id: id,
    start_at: new Date(s).toISOString(),
    end_at: new Date(s + durationMs).toISOString(),
  }));
  const { error: insertError } = await admin.from("meeting_poll_options").insert(options);
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  const { data: updated, error: updateError } = await admin
    .from("meetings")
    .update({ status: "voting", deadline: new Date(deadline).toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select()
    .maybeSingle();
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    await admin.from("meeting_poll_options").delete().eq("meeting_id", id);
    return Response.json({ error: "会議の状態が変わりました。ページを開き直してください" }, { status: 409 });
  }

  await syncEvent(admin, updated as Meeting);
  await notifyPollOpened(
    updated as Meeting,
    options.map((o) => ({ start: o.start_at, end: o.end_at })),
    req.nextUrl.origin,
  );
  return Response.json({ ok: true });
}
