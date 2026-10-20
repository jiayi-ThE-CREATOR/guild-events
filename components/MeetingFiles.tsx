"use client";

import { useRef, useState } from "react";
import { btn, ErrorText, Note, SectionTitle } from "@/components/ui";
import { fullDateTime } from "@/lib/format";
import { sizeLabel } from "@/lib/notify-email";
import { uploadFiles } from "@/lib/upload";

/**
 * 会議・イベントの「資料」。一覧・ダウンロードは誰でも。追加・削除はメンバーの会議ページ・イベントページだけ
 * （uploader に名前が入っているとき）。追加すると参加者にメールが届く。
 */

export type FileItem = { id: string; name: string; size: number; uploaded_by?: string; created_at: string };

export default function MeetingFiles({
  files,
  downloadBase,
  apiBase,
  uploader,
  onChanged,
}: {
  files: FileItem[];
  /** 例：/api/meetings/<id>/files ・ /api/g/<token>/files */
  downloadBase: string;
  /** 追加・削除できるときだけ渡す。例：/api/meetings/<id> ・ /api/events/<id> */
  apiBase?: string;
  uploader?: string | null;
  onChanged?: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = !!apiBase && !!onChanged;

  async function add(list: FileList | null) {
    if (!list || list.length === 0 || !apiBase || !onChanged) return;
    if (!uploader) return setError("マイページで名前を選ぶと、資料を追加できます");
    const chosen = [...list];
    setError(null);
    setBusy(`上げています… 0/${chosen.length}`);
    try {
      await uploadFiles(apiBase, chosen, uploader, (n) => setBusy(`上げています… ${n}/${chosen.length}`));
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(f: FileItem) {
    if (!apiBase || !onChanged || !window.confirm(`「${f.name}」を削除しますか？`)) return;
    setError(null);
    setBusy("削除しています…");
    const res = await fetch(`${apiBase}/files/${f.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error);
    await onChanged();
    setBusy(null);
  }

  return (
    <section>
      <SectionTitle
        title="資料"
        meta={files.length > 0 ? `${files.length}件` : undefined}
        right={
          editable && (
            <>
              <input ref={input} type="file" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
              <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={btn.text}>
                ＋ 追加
              </button>
            </>
          )
        }
      />
      {busy && <Note className="mb-1.5">{busy}</Note>}
      {error && <div className="mb-1.5"><ErrorText>{error}</ErrorText></div>}
      {files.length === 0 ? (
        <p className="text-ink-soft text-[13px]">
          まだありません{editable && "。追加すると、参加者にメールで知らせます（50MB まで）"}
        </p>
      ) : (
        <ul className="border-line divide-line divide-y rounded-lg border bg-white">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <a href={`${downloadBase}/${f.id}`} className="min-w-0 flex-1">
                <span className="text-navy block truncate text-sm font-semibold hover:underline">{f.name}</span>
                <span className="text-ink-soft block text-xs">
                  {sizeLabel(f.size)}
                  {f.uploaded_by && ` · ${f.uploaded_by}`} · {fullDateTime(f.created_at)}
                </span>
              </a>
              {editable && (
                <button type="button" disabled={!!busy} onClick={() => remove(f)} className={`${btn.text} text-ink-soft shrink-0 text-[13px]`}>
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
