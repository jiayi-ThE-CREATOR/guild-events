import { NextResponse, type NextRequest } from "next/server";
import { loadGuest } from "@/lib/server/guest-access";
import { downloadUrl } from "@/lib/server/files";

/** ゲストのダウンロード。招待された会議の資料だけ */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const loaded = await loadGuest(token);
  if (loaded.error) return loaded.error;
  const { admin, meeting } = loaded;
  const { data, error } = await admin
    .from("meeting_files")
    .select("name, path")
    .eq("id", fileId)
    .eq("meeting_id", meeting.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "資料が見つかりません" }, { status: 404 });
  return NextResponse.redirect(await downloadUrl(admin, data.path, data.name));
}
