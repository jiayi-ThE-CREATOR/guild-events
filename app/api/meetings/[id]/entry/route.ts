import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { readEntry, writeEntry } from "@/lib/server/entry";
import type { Meeting } from "@/lib/server/meetings";

/**
 * 会議ページの「この会議の予定」の読み書き（メンバー本人が使う前提）。
 * 中身は lib/server/entry.ts。ゲストは /api/g/[token]/entry から同じ処理を通る。
 */

type Params = { params: Promise<{ id: string }> };

async function loadMeeting(id: string) {
  const admin = getAdmin();
  if (!admin) return { error: Response.json({ error: NOT_CONFIGURED }, { status: 503 }) };
  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return { error: Response.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: Response.json({ error: "会議が見つかりません" }, { status: 404 }) };
  return { admin, meeting: data as Meeting };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const loaded = await loadMeeting(id);
  if (loaded.error) return loaded.error;
  const { admin, meeting } = loaded;
  const member = req.nextUrl.searchParams.get("member") ?? "";
  if (!meeting.participants.includes(member)) {
    return Response.json({ error: "この会議の参加者ではありません" }, { status: 403 });
  }
  return Response.json(await readEntry(admin, meeting, member));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const loaded = await loadMeeting(id);
  if (loaded.error) return loaded.error;
  const { admin, meeting } = loaded;
  const { member, cells, exclusive } = (await req.json()) as {
    member?: string;
    cells?: unknown;
    exclusive?: unknown;
  };
  if (!member || !meeting.participants.includes(member)) {
    return Response.json({ error: "この会議の参加者ではありません" }, { status: 403 });
  }
  const problem = await writeEntry(admin, meeting, member, cells, exclusive);
  if (problem) return Response.json({ error: problem.error }, { status: problem.status });
  return Response.json({ ok: true });
}
