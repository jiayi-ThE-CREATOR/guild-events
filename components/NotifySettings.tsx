"use client";

import { useEffect, useState } from "react";
import { btn, field } from "@/components/ui";

/**
 * マイページの「メール通知」。会議に資料が追加されたときのメールの宛先とオンオフ。
 * アドレスを入れなければ、つないでいる Google などのアドレス（Gmail 優先）に送る。
 */
export default function NotifySettings({ member }: { member: string }) {
  const [state, setState] = useState<{ enabled: boolean; email: string | null; detected: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/notify?member=${encodeURIComponent(member)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        if (!alive) return;
        setState(json);
        setEmail(json.email ?? "");
        setEnabled(json.enabled);
      })
      .catch((e: Error) => alive && setMessage({ ok: false, text: e.message }));
    return () => {
      alive = false;
    };
  }, [member]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/notify", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member, email, enabled }),
    });
    if (res.ok) {
      setState((s) => (s ? { ...s, enabled, email: email.trim() || null } : s));
      setMessage({ ok: true, text: "保存しました" });
    } else {
      setMessage({ ok: false, text: (await res.json()).error });
    }
    setSaving(false);
  }

  const target = email.trim() || state?.detected;
  return (
    <section>
      <h2 className="text-ink mb-1 text-sm font-bold">メール通知</h2>
      <p className="text-ink-soft mb-3 text-xs leading-relaxed">
        参加する会議に資料が追加されたとき、メールで知らせます。アドレスを入れなければ、つないでいる Google などのアドレス（Gmail 優先）に送ります。
      </p>
      {message && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-[13px] ${message.ok ? "text-grass bg-grass-soft" : "text-amber bg-amber-soft"}`}>{message.text}</p>
      )}
      {!state && !message && <p className="text-ink-soft py-4 text-center text-[13px]">読み込み中…</p>}
      {state && (
        <div className="border-line space-y-3 rounded-xl border bg-white px-4 py-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
            <span className="text-ink text-sm font-semibold">メールで知らせてもらう</span>
          </label>
          <div>
            <label htmlFor="notify-email" className="text-ink mb-1 block text-[13px] font-semibold">通知用メール（任意）</label>
            <input
              id="notify-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={state.detected ?? "you@example.com"}
              className={field}
            />
            <p className="text-ink-soft mt-1 text-xs">
              {!enabled
                ? "メールは送りません"
                : target
                  ? `送り先：${target}`
                  : "送り先がありません。アドレスを入れるか、Google カレンダーをつないでください"}
            </p>
          </div>
          <button type="button" disabled={saving} onClick={save} className={btn.primary}>保存</button>
        </div>
      )}
    </section>
  );
}
