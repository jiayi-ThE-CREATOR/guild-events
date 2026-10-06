/**
 * 会議の資料をブラウザから上げる（会議ページと会議作成フォームで共用）。
 * 1 つずつ上げ先 URL をもらって Storage に直接 PUT し、最後にまとめて一覧に載せる
 * （メール通知はまとめて 1 通）。
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function uploadMeetingFiles(
  meetingId: string,
  files: File[],
  uploader: string,
  onProgress?: (done: number) => void,
): Promise<void> {
  const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
  if (tooBig) throw new Error(`「${tooBig.name}」は 50MB を超えています`);

  const uploaded = [];
  for (const [i, file] of files.entries()) {
    const res = await fetch(`/api/meetings/${meetingId}/files/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size }),
    });
    const target = await res.json();
    if (!res.ok) throw new Error(target.error);
    const put = await fetch(target.url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error(`「${file.name}」を上げられませんでした（${put.status}）`);
    uploaded.push({ path: target.path, name: file.name, size: file.size, contentType: file.type || null });
    onProgress?.(i + 1);
  }

  const res = await fetch(`/api/meetings/${meetingId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploader, files: uploaded }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}
