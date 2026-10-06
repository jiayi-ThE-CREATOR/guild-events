import { NextResponse, type NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { downloadUrl, removeFile } from "@/lib/server/files";

type Params = { params: Promise<{ id: string; fileId: string }> };

async function find(id: string, fileId: string) {
  const admin = getAdmin();
  if (!admin) return { error: Response.json({ error: NOT_CONFIGURED }, { status: 503 }) };
  const { data, error } = await admin
    .from("meeting_files")
    .select("id, name, path")
    .eq("id", fileId)
    .eq("meeting_id", id)
    .maybeSingle();
  if (error) return { error: Response.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: Response.json({ error: "資料が見つかりません" }, { status: 404 }) };
  return { admin, file: data as { id: string; name: string; path: string } };
}

/** ダウンロード。1 分だけ有効なリンクへ転送する */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, fileId } = await params;
  const found = await find(id, fileId);
  if (found.error) return found.error;
  return NextResponse.redirect(await downloadUrl(found.admin, found.file.path, found.file.name));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, fileId } = await params;
  const found = await find(id, fileId);
  if (found.error) return found.error;
  try {
    await removeFile(found.admin, found.file);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
