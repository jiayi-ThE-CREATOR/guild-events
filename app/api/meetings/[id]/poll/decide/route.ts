import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import type { Meeting } from "@/lib/server/meetings";
import { decidePoll } from "@/lib/server/poll";

/** 締め切りを待たずに、選んだ日程に決める（主催者用）。中身は decidePoll */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { optionId } = (await req.json()) as { optionId?: string };
  if (!optionId) return Response.json({ error: "日程を選んでください" }, { status: 400 });

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (meeting.status !== "voting") return Response.json({ error: "投票中の会議ではありません" }, { status: 409 });
  try {
    const decided = await decidePoll(admin, meeting, req.nextUrl.origin, optionId);
    if (decided.status !== "confirmed") return Response.json({ error: "会議の状態が変わりました。ページを開き直してください" }, { status: 409 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
