import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { filesOf, MAX_FILE_BYTES, storedSize } from "@/lib/server/files";
import { meetingMembers } from "@/lib/server/guests";
import { declinesOf, type Meeting } from "@/lib/server/meetings";
import { notifyFilesAdded } from "@/lib/server/notify";

type Uploaded = { path?: string; name?: string; size?: number; contentType?: string | null };

/**
 * ブラウザが Storage に上げ終えた資料を一覧に載せ、参加者にメールで知らせる。
 * まとめて上げた分は 1 通にまとめる。上げた人はメンバーだけ（ゲストは見る・落とすだけ）
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });

  const rows = [];
  for (const f of files) {
    // 発行した置き場所（この会議の下）に、実際に置かれているものだけ受け付ける
    if (!f.path?.startsWith(`${id}/`) || !f.name?.trim()) {
      return Response.json({ error: "資料の情報が正しくありません" }, { status: 400 });
    }
    const size = await storedSize(admin, f.path);
    if (size === null) return Response.json({ error: `「${f.name}」が見つかりません。もう一度上げてください` }, { status: 400 });
    if (size > MAX_FILE_BYTES) return Response.json({ error: `「${f.name}」は 50MB を超えています` }, { status: 400 });
    rows.push({
      meeting_id: id,
      path: f.path,
      name: f.name.trim().slice(0, 200),
      size: size || f.size || 0,
      content_type: f.contentType?.slice(0, 100) || null,
      uploaded_by: uploader,
    });
  }
  const { error: insertError } = await admin.from("meeting_files").insert(rows);
  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  try {
    const [{ keys }, declined] = await Promise.all([meetingMembers(admin, meeting), declinesOf(admin, id)]);
    await notifyFilesAdded(admin, {
      meeting,
      keys,
      declined,
      uploader,
      files: rows.map((r) => ({ name: r.name, size: r.size })),
      origin: req.nextUrl.origin,
    });
  } catch (e) {
    console.error(`[files] メール通知に失敗: ${(e as Error).message}`);
  }
  return Response.json({ files: await filesOf(admin, id) });
}
