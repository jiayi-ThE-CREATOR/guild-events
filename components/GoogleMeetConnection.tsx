"use client";

import { useEffect, useState } from "react";
import { btn } from "@/components/ui";

/**
 * マイページの「Google Meet」。つないでおくと、自分が主催する会議の Meet リンクが
 * 自分の Google アカウントで自動で作られる。カレンダー連携とは別の許可。
 * Google の分類で機密の権限なので、同意画面で「確認されていないアプリ」の警告が一度出る。
 */
export default function GoogleMeetConnection({ member }: { member: string }) {
  const [state, setState] = useState<{ connected: boolean; email: string | null } | null>(null);
  // 同意画面から戻ってきたときの結果（?meet=connected|error）
  const [returned] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState<string | null>(() =>
    returned.get("meet") === "error" ? (returned.get("reason") ?? "Google Meet をつなげませんでした") : null,
  );
  const [notice, setNotice] = useState<string | null>(() =>
    returned.get("meet") === "connected" ? "Google Meet をつなぎました" : null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meet?member=${encodeURIComponent(member)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        if (alive) setState(json);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [member]);

  useEffect(() => {
    if (returned.has("meet")) window.history.replaceState(null, "", window.location.pathname);
  }, [returned]);

  async function disconnect() {
    if (!window.confirm("Google Meet の連携を解除しますか？\nGoogle アカウント側の許可も取り消されます。作り済みのリンクはそのまま使えます。")) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/meet?member=${encodeURIComponent(member)}`, { method: "DELETE" });
    if (res.ok) setState({ connected: false, email: null });
    else setError((await res.json()).error);
    setSaving(false);
  }

  return (
    <section>
      <h2 className="text-ink mb-1 text-sm font-bold">Google Meet</h2>
      <p className="text-ink-soft mb-3 text-xs leading-relaxed">
        つないでおくと、あなたが主催する会議の Google Meet リンクを自動で作ります（リンクを知っている人は誰でも入れます）。
        Google の画面で「このアプリは確認されていません」と出たら、「詳細」→「移動」で進んでください。
      </p>
      {error && <p className="text-amber bg-amber-soft mb-3 rounded-lg px-3 py-2 text-[13px]">{error}</p>}
      {notice && <p className="text-grass bg-grass-soft mb-3 rounded-lg px-3 py-2 text-[13px]">{notice}</p>}
      {!state && !error && <p className="text-ink-soft py-4 text-center text-[13px]">読み込み中…</p>}
      {state && (
        <div className="border-line flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-ink text-sm font-semibold">{state.connected ? "つないでいます" : "つないでいません"}</p>
            {state.email && <p className="text-ink-soft truncate text-[13px]">{state.email}</p>}
          </div>
          {state.connected ? (
            <button type="button" disabled={saving} onClick={disconnect} className={btn.secondary}>解除</button>
          ) : (
            <a href={`/api/calendar/google/start?purpose=meet&member=${encodeURIComponent(member)}`} className={btn.primary}>
              つなぐ
            </a>
          )}
        </div>
      )}
    </section>
  );
}
