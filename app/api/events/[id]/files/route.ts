import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { attendeesOf, eventOf } from "@/lib/server/events";
import { EVENT_FILES, filesDir, filesOf, MAX_FILE_BYTES, storedSize } from "@/lib/server/files";
import { notifyEventFilesAdded } from "@/lib/server/notify";

type Uploaded = { path?: string; name?: string; size?: number; contentType?: string | null };
type Params = { params: Promise<{ id: string }> };

/** イベントの資料の一覧 */
export async function GET(_req: NextRequest, { params }: Params) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  try {
    return Response.json({ files: await filesOf(admin, id, EVENT_FILES) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * ブラウザが Storage に上げ終えた資料を一覧に載せ、参加者にメールで知らせる。
 * まとめて上げた分は 1 通にまとめる。上げられるのはメンバーだけ
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { uploader, files } = (await req.json()) as { uploader?: string; files?: Uploaded[] };
  if (!uploader || !isMember(uploader)) {
    return Response.json({ error: "マイページで名前を選んでから上げてください" }, { status: 400 });
  }
  if (!Array.isArray(files) || files.length === 0 || files.length > 20) {
    return Response.json({ error: "資料が選ばれていません" }, { status: 400 });
  }

  const event = await eventOf(admin, id).catch(() => null);
  if (!event) return Response.json({ error: "イベントが見つかりません" }, { status: 404 });

  const rows = [];
  for (const f of files) {
    // 発行した置き場所（このイベントの下）に、実際に置かれているものだけ受け付ける
    if (!f.path?.startsWith(filesDir(id, EVENT_FILES)) || !f.name?.trim()) {
      return Response.json({ error: "資料の情報が正しくありません" }, { status: 400 });
    }
    const size = await storedSize(admin, f.path);
    if (size === null) return Response.json({ error: `「${f.name}」が見つかりません。もう一度上げてください` }, { status: 400 });
    if (size > MAX_FILE_BYTES) return Response.json({ error: `「${f.name}」は 50MB を超えています` }, { status: 400 });
    rows.push({
      event_id: id,
      path: f.path,
      name: f.name.trim().slice(0, 200),
      size: size || f.size || 0,
      content_type: f.contentType?.slice(0, 100) || null,
      uploaded_by: uploader,
    });
  }
  const { error: insertError } = await admin.from(EVENT_FILES.table).insert(rows);
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  try {
    await notifyEventFilesAdded(admin, {
      event,
      attendees: await attendeesOf(admin, id),
      uploader,
      files: rows.map((r) => ({ name: r.name, size: r.size })),
      origin: req.nextUrl.origin,
    });
  } catch (e) {
    console.error(`[event-files] メール通知に失敗: ${(e as Error).message}`);
  }
  return Response.json({ files: await filesOf(admin, id, EVENT_FILES) });
}
