"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * マイページの「カレンダー連携」。サービスごとにスイッチを並べ、
 * オンにした分をすべて日程調整で使う（複数オン可）。
 *
 * - Google: スイッチをオン → Google の同意画面へ飛んで戻ってくる
 * - iPhone: 公開カレンダーのリンクを貼る（カレンダーごとに 1 本、何本でも）
 * - Microsoft: 準備中
 *
 * オフにする（または 1 件ずつ「解除」）とサーバーに保存した token / リンクを消す。
 * Google はあわせて Google 側の許可も取り消す。
 */

type Source = { id: string; provider: "google" | "microsoft" | "ics"; label: string };

async function fetchSources(member: string): Promise<Source[]> {
  const res = await fetch(`/api/calendar/sources?member=${encodeURIComponent(member)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json.sources;
}

export default function CalendarConnections({ member }: { member: string }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  // Google の同意画面から戻ってきたときの結果（?calendar=connected|error）。
  // マイページはクライアントでしか描画しないので、初期値で直接 URL を読める
  const [returned] = useState(() => new URLSearchParams(window.location.search));
  const [error, setError] = useState<string | null>(() =>
    returned.get("calendar") === "error"
      ? (returned.get("reason") ?? "Google カレンダーをつなげませんでした")
      : null,
  );
  const [notice, setNotice] = useState<string | null>(() =>
    returned.get("calendar") === "connected" ? "Google カレンダーをつなぎました" : null,
  );
  const [icsOpen, setIcsOpen] = useState(false);

  const load = useCallback(async () => {
    setSources(await fetchSources(member));
  }, [member]);

  useEffect(() => {
    let alive = true;
    fetchSources(member)
      .then((found) => alive && setSources(found))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [member]);

  // 結果は一度出したら URL から消す（再読み込みで二度出さない）
  useEffect(() => {
    if (returned.has("calendar")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [returned]);

  const google = (sources ?? []).filter((s) => s.provider === "google");
  const ics = (sources ?? []).filter((s) => s.provider === "ics");

  function connectGoogle() {
    window.location.href = `/api/calendar/google/start?member=${encodeURIComponent(member)}`;
  }

  async function remove(target: { provider: string } | { id: string }, confirmText: string) {
    if (!window.confirm(confirmText)) return false;
    setError(null);
    setNotice(null);
    const res = await fetch("/api/calendar/sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member, ...target }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return false;
    }
    await load();
    return true;
  }

  async function toggleIcs(on: boolean) {
    if (on) return setIcsOpen(true);
    if (ics.length === 0) return setIcsOpen(false);
    if (await remove({ provider: "ics" }, "iPhone カレンダーの連携をすべて解除しますか？")) {
      setIcsOpen(false);
    }
  }

  return (
    <section>
      <h2 className="text-ink mb-1 text-sm font-bold md:text-base">カレンダー連携</h2>
      <p className="text-ink-soft mb-3 text-xs md:mb-4">
        オンにしたカレンダーの「空いている時間」だけを日程調整に使います。
        予定の中身は他のメンバーには見えません（
        <a href="/privacy" className="text-navy underline">
          プライバシーポリシー
        </a>
        ）。
      </p>

      {error && <p className="text-amber bg-amber-soft mb-3 rounded-xl p-3 text-xs">{error}</p>}
      {notice && <p className="text-grass bg-grass-soft mb-3 rounded-xl p-3 text-xs">{notice}</p>}

      {!sources && !error && <p className="text-ink-soft py-4 text-center text-xs">読み込み中…</p>}

      {sources && (
        <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
          <Row
            title="Google カレンダー"
            on={google.length > 0}
            onChange={(on) =>
              on
                ? connectGoogle()
                : remove(
                    { provider: "google" },
                    "Google カレンダーの連携をすべて解除しますか？\nGoogle アカウント側の許可も取り消されます。",
                  )
            }
          >
            {google.length > 0 && (
              <>
                <Labels
                  items={google}
                  onRemove={(s) =>
                    remove(
                      { id: s.id },
                      `「${s.label}」の連携を解除しますか？\nGoogle アカウント側の許可も取り消されます。`,
                    )
                  }
                />
                <button type="button" onClick={connectGoogle} className="text-navy mt-2 text-xs underline">
                  ＋ 別の Google アカウントも追加
                </button>
              </>
            )}
          </Row>

          <Row title="Microsoft（Outlook）" on={false} disabled note="準備中" onChange={() => {}} />

          <Row title="iPhone カレンダー" on={ics.length > 0 || icsOpen} onChange={toggleIcs}>
            {(ics.length > 0 || icsOpen) && (
              <>
                <Labels
                  items={ics}
                  onRemove={(s) => remove({ id: s.id }, `「${s.label}」の連携を解除しますか？`)}
                />
                <IcsForm member={member} onAdded={load} />
              </>
            )}
          </Row>
        </ul>
      )}
    </section>
  );
}

function Row({
  title,
  on,
  disabled,
  note,
  onChange,
  children,
}: {
  title: string;
  on: boolean;
  disabled?: boolean;
  note?: string;
  onChange: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <li className="p-3.5 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm font-semibold ${disabled ? "text-ink-soft" : "text-ink"}`}>
          {title}
          {note && <span className="text-ink-soft ml-2 text-[11px] font-normal">{note}</span>}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          disabled={disabled}
          onClick={() => onChange(!on)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            on ? "bg-grass" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {children}
    </li>
  );
}

function Labels({ items, onRemove }: { items: Source[]; onRemove?: (s: Source) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((s) => (
        <li key={s.id} className="text-ink-soft flex items-center justify-between gap-2 text-xs">
          <span className="truncate">✓ {s.label}</span>
          {onRemove && (
            <button type="button" onClick={() => onRemove(s)} className="shrink-0 underline">
              解除
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function IcsForm({ member, onAdded }: { member: string; onAdded: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendar/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member, url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setUrl("");
      await onAdded();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <details className="text-ink-soft mb-2 text-xs">
        <summary className="text-navy cursor-pointer">リンクの取り方</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>iPhone の「カレンダー」アプリを開き、下の「カレンダー」をタップ</li>
          <li>「iCloud」の下にある、使いたいカレンダーの ⓘ をタップ</li>
          <li>「公開カレンダー」をオンにして「リンクを共有…」→「コピー」</li>
          <li>下の欄に貼り付けて「追加」。カレンダーが複数あれば 1 つずつ追加</li>
        </ol>
        <p className="mt-2">
          ※ 公開カレンダーは、リンクを知っている人なら中身を見られる状態になります。
          リンクはこのサイトのサーバーにだけ保存され、他のメンバーには表示されません。
          「このiPhone」の下にあるカレンダーは公開できないので、iCloud のカレンダーに移してください。
        </p>
      </details>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="webcal://p00-caldav.icloud.com/…"
          className="border-line focus:border-navy min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!url.trim() || saving}
          className="bg-navy shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {saving ? "確認中…" : "追加"}
        </button>
      </form>
      {message && <p className="text-amber mt-2 text-xs">{message}</p>}
    </div>
  );
}
