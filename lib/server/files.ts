import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 会議の資料。本体は Supabase Storage の非公開バケットに、ブラウザから直接上げる
 * （Vercel の関数は 1 回 4.5MB までしか受け取れないため）。
 *
 * 1. サーバーが置き場所と「一度だけ使える上げ先 URL」を発行する（uploadTarget）
 * 2. ブラウザがその URL にファイル本体を PUT する
 * 3. サーバーが本当に置かれたか確かめてから一覧（meeting_files）に載せる（registerFiles）
 */

export const FILES_BUCKET = "meeting-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_MEETING = 50;

export type MeetingFile = {
  id: string;
  name: string;
  size: number;
  content_type: string | null;
  uploaded_by: string;
  created_at: string;
};

export async function filesOf(admin: SupabaseClient, meetingId: string): Promise<MeetingFile[]> {
  const { data, error } = await admin
    .from("meeting_files")
    .select("id, name, size, content_type, uploaded_by, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as MeetingFile[];
}

/** 置き場所に使う名前。日本語はそのまま残し、パスに使えない文字だけ置き換える */
function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|#%{}^~[\]`\x00-\x1f]/g, "_").trim();
  return (cleaned || "file").slice(-100);
}

export async function uploadTarget(
  admin: SupabaseClient,
  meetingId: string,
  name: string,
): Promise<{ path: string; url: string }> {
  // Storage のキーは ASCII が無難なので、元の名前は DB にだけ持ち、置き場所はランダム＋拡張子にする
  const ext = (safeName(name).match(/\.[A-Za-z0-9]{1,10}$/)?.[0] ?? "").toLowerCase();
  const path = `${meetingId}/${crypto.randomUUID()}${ext}`;
  const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, url: data.signedUrl };
}

/** 置かれたファイルの大きさ。無ければ null */
export async function storedSize(admin: SupabaseClient, path: string): Promise<number | null> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const file = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(FILES_BUCKET).list(dir, { search: file, limit: 10 });
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find((o) => o.name === file);
  return hit ? Number((hit.metadata as { size?: number } | null)?.size ?? 0) : null;
}

/** ダウンロード用の、1 分だけ有効なリンク。元のファイル名で保存されるようにする */
export async function downloadUrl(admin: SupabaseClient, path: string, name: string): Promise<string> {
  const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUrl(path, 60, { download: name });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function removeFile(admin: SupabaseClient, file: { id: string; path: string }): Promise<void> {
  const { error } = await admin.storage.from(FILES_BUCKET).remove([file.path]);
  if (error) throw new Error(error.message);
  const { error: dbError } = await admin.from("meeting_files").delete().eq("id", file.id);
  if (dbError) throw new Error(dbError.message);
}
