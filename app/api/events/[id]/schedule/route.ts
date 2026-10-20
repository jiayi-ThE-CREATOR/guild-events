import type { NextRequest } from "next/server";
import { meetingRanges } from "@/lib/ranges";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { enteredCounts, settle, type Meeting } from "@/lib/server/meetings";

/**
 * イベントの日程調整（つないでいる会議）の要約。日程調整を使っていないイベントは { meeting: null }。
 * 結果発表を過ぎていれば、ここで決める（会議ページと同じく、定時ジョブより先に開かれた場合）
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { data, error } = await admin
    .from("meetings")
    .select()
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ meeting: null });

  let m = data as Meeting;
  const before = m.status;
  try {
    m = await settle(admin, m, req.nextUrl.origin);
  } catch (e) {
    console.error(`[events/schedule] ${(e as Error).message}`);
  }
  const entered = m.status === "open" ? (await enteredCounts(admin, [m]).catch(() => null))?.get(m.id) : undefined;
  return Response.json({
    meeting: {
      id: m.id,
      status: m.status,
      organizer: m.organizer,
      participants: m.participants.length,
      duration_min: m.duration_min,
      ranges: meetingRanges(m),
      deadline: m.deadline,
      entered: entered ?? null,
    },
    // ここで決まったときは、画面がイベントを読み直す
    settled: before !== m.status,
  });
}
