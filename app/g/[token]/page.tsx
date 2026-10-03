"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CalendarConnections from "@/components/CalendarConnections";
import CalendarLinks from "@/components/CalendarLinks";
import MeetingEntry from "@/components/MeetingEntry";
import { fullDateTime, timeOnly } from "@/lib/format";
import { durationLabel } from "@/lib/meetings";
import { rangeLabel, type CandidateRange } from "@/lib/ranges";
import type { SlotResult } from "@/lib/slots";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 外部ゲストの招待ページ（/g/<合言葉>）。ログイン無しで、このリンクを知っている人が
 * そのゲストとして予定を入れられる。メンバーの名前は出さず、時間帯と人数だけを見せる。
 */

type GuestView = {
  guest: { name: string; declined: boolean; hasCalendar: boolean };
  meeting: {
    title: string;
    description: string | null;
    location: string | null;
    duration_min: number;
    ranges: CandidateRange[];
    deadline: string;
    status: "open" | "confirmed" | "failed";
    confirmed_start: string | null;
  };
  preview?: SlotResult;
  result?: { attending: number; total: number; youAttend: boolean };
};

const iso = (ms: number) => new Date(ms).toISOString();

export default function GuestPage() {
  const isClient = useIsClient();
  if (!isClient) return <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>;
  return <GuestView />;
}

function GuestView() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<GuestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchView = useCallback(async () => {
    const res = await fetch(`/api/g/${token}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json as GuestView;
  }, [token]);

  useEffect(() => {
    let alive = true;
    fetchView()
      .then((v) => alive && setView(v))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchView]);

  async function refresh() {
    setView(await fetchView());
  }

  async function setDeclined(declined: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/g/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!view) {
    return (
      <div className="px-4 pt-10 md:mx-auto md:max-w-2xl md:px-0">
        {error ? (
          <p className="text-amber bg-amber-soft rounded-xl p-4 text-sm">{error}</p>
        ) : (
          <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
        )}
      </div>
    );
  }

  const { guest, meeting: m } = view;
  const end = m.confirmed_start ? iso(Date.parse(m.confirmed_start) + m.duration_min * 60 * 1000) : null;

  return (
    <div className="px-4 pt-8 pb-12 md:mx-auto md:max-w-2xl md:px-0">
      <p className="text-ink-soft text-xs">{guest.name} さんへのご招待</p>
      <h1 className="text-ink mt-1 text-2xl font-bold">{m.title}</h1>

      <dl className="border-line mt-4 divide-y divide-[var(--color-line)] rounded-2xl border bg-white text-sm">
        <Row label="長さ">{durationLabel(m.duration_min)}</Row>
        <Row label="候補">
          {m.ranges.map((r, i) => (
            <span key={i} className="block">{rangeLabel(r)}</span>
          ))}
        </Row>
        <Row label="結果発表">{fullDateTime(m.deadline)}</Row>
        {m.location && <Row label="場所">{m.location}</Row>}
      </dl>
      {m.description && <p className="text-ink-soft mt-4 text-sm leading-relaxed whitespace-pre-wrap">{m.description}</p>}

      {error && <p className="text-amber bg-amber-soft mt-4 rounded-xl p-3 text-xs">{error}</p>}

      {m.status === "confirmed" && m.confirmed_start && end && view.result && (
        <section className="mt-6 space-y-4">
          <div className="bg-grass-soft rounded-2xl p-5 text-center">
            <p className="text-grass text-xs font-bold">この日時に決まりました</p>
            <p className="text-ink mt-1 text-xl font-bold md:text-2xl">
              {fullDateTime(m.confirmed_start)}〜{timeOnly(end)}
            </p>
            <p className="text-ink-soft mt-1 text-xs">
              {view.result.total}人中 {view.result.attending}人が参加できます
            </p>
            <p className="text-ink mt-2 text-sm font-semibold">
              {view.result.youAttend ? "あなたも参加できます" : "あなたはこの日時は参加できない扱いです"}
            </p>
          </div>
          {view.result.youAttend && (
            <CalendarLinks
              event={{
                id: token,
                title: m.title,
                description: m.description,
                location: m.location,
                event_date: m.confirmed_start,
                duration_min: m.duration_min,
              }}
            />
          )}
        </section>
      )}

      {m.status === "failed" && (
        <p className="border-line text-ink-soft mt-6 rounded-2xl border border-dashed p-6 text-center text-xs">
          候補の中に、みんながそろう時間が見つかりませんでした。主催者からの連絡をお待ちください。
        </p>
      )}

      {m.status === "open" && (
        <>
          {guest.declined ? (
            <section className="border-line mt-6 rounded-2xl border bg-white p-4">
              <p className="text-ink text-sm font-bold">「不参加」で回答しています</p>
              <button type="button" disabled={saving} onClick={() => setDeclined(false)} className="border-line text-ink mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-40">
                やっぱり参加できる
              </button>
            </section>
          ) : (
            <>
              <section className="mt-6">
                <h2 className="text-ink text-base font-bold">あなたの予定を教えてください</h2>
                <p className="text-ink-soft mt-1 text-xs">
                  結果発表（{fullDateTime(m.deadline)}）までに、次のどちらかでお願いします。
                  予定の中身（件名など）は誰にも見えません。
                </p>
              </section>

              <section className="border-line mt-4 rounded-2xl border bg-white p-4">
                <p className="text-ink mb-3 text-sm font-bold">① カレンダーをつなぐ（自動）</p>
                <CalendarConnections guestToken={token} />
              </section>

              <MeetingEntry
                ranges={m.ranges}
                loadUrl={`/api/g/${token}/entry`}
                saveUrl={`/api/g/${token}/entry`}
                saveBody={{}}
                onSaved={refresh}
                defaultOpen={!guest.hasCalendar}
              />

              <button type="button" disabled={saving} onClick={() => setDeclined(true)} className="border-line text-ink-soft mt-4 w-full rounded-xl border bg-white py-2.5 text-sm font-semibold disabled:opacity-40">
                どの日時でも参加できない
              </button>
            </>
          )}

          {view.preview && <Preview result={view.preview} durationMin={m.duration_min} deadline={m.deadline} />}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="text-ink-soft w-16 shrink-0 text-xs leading-5">{label}</dt>
      <dd className="text-ink min-w-0 flex-1 leading-5">{children}</dd>
    </div>
  );
}

/** 「今の時点の候補」は、これより多いと残りを折りたたむ */
const PREVIEW_LIMIT = 5;

function Preview({ result, durationMin, deadline }: { result: SlotResult; durationMin: number; deadline: string }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <section className="mt-8">
      <h2 className="text-ink text-sm font-bold">今の時点の候補</h2>
      <p className="text-ink-soft mt-1 mb-3 text-xs">
        結果発表（{fullDateTime(deadline)}）のときに、みんなの最新の予定で一番早くそろう時間に決まります。
      </p>
      {result.available === null || result.windows.length === 0 ? (
        <p className="border-line text-ink-soft rounded-2xl border border-dashed p-5 text-center text-xs">
          今のところ、みんながそろう時間はまだありません
        </p>
      ) : (
        <>
          <p className="text-ink-soft mb-2 text-xs">
            {result.available === result.total
              ? `全員（${result.total}人）が参加できる時間`
              : `${result.total}人中 ${result.available}人が参加できる時間`}
          </p>
          <ul className="space-y-2">
            {(showAll ? result.windows : result.windows.slice(0, PREVIEW_LIMIT)).map((w) => (
              <li key={w.start} className="border-line text-ink rounded-2xl border bg-white p-3.5 text-sm font-semibold">
                {fullDateTime(iso(w.start))}〜{timeOnly(iso(w.end))}
              </li>
            ))}
          </ul>
          {result.windows.length > PREVIEW_LIMIT && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="text-navy mt-2 text-xs font-semibold">
              {showAll ? "閉じる" : `すべて表示（ほか ${result.windows.length - PREVIEW_LIMIT}件）`}
            </button>
          )}
          <p className="text-ink-soft mt-2 text-[11px]">各時間帯の中なら、{durationLabel(durationMin)}をどこに入れても大丈夫です</p>
        </>
      )}
    </section>
  );
}
