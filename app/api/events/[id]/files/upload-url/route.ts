import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { eventOf } from "@/lib/server/events";
import { EVENT_FILES, filesOf, MAX_FILE_BYTES, MAX_FILES_PER_MEETING, uploadTarget } from "@/lib/server/files";

/** 資料を 1 つ上げるための上げ先 URL を発行する（本体はブラウザから直接 Storage へ） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { name, size } = (await req.json()) as { name?: string; size?: number };
  if (!name?.trim()) return Response.json({ error: "ファイル名がありません" }, { status: 400 });
  if (!(typeof size === "number" && size > 0)) return Response.json({ error: "空のファイルは上げられません" }, { status: 400 });
  if (size > MAX_FILE_BYTES) return Response.json({ error: `「${name}」は 50MB を超えています` }, { status: 400 });

  try {
    if (!(await eventOf(admin, id))) return Response.json({ error: "イベントが見つかりません" }, { status: 404 });
    if ((await filesOf(admin, id, EVENT_FILES)).length >= MAX_FILES_PER_MEETING) {
      return Response.json({ error: `資料は 1 つのイベントに ${MAX_FILES_PER_MEETING} 個までです` }, { status: 400 });
    }
    return Response.json(await uploadTarget(admin, id, name, EVENT_FILES));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
