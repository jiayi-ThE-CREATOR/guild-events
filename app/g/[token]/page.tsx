"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CalendarConnections from "@/components/CalendarConnections";
import MeetingEntry from "@/components/MeetingEntry";
import { btn, Dot, DOT, Dropdown, ErrorText, Note, SectionTitle, Tag } from "@/components/ui";
import { calendarMenu, type CalendarItem } from "@/lib/calendar";
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
  if (!isClient) return <Note className="py-16 text-center">読み込み中…</Note>;
  return <GuestView />;
}

function GuestView() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<GuestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // ② 手入力は、カレンダーをつないでいない人には最初から開いておく
  const [entryOpen, setEntryOpen] = useState<boolean | null>(null);

  const fetchView = useCallback(async () => {
    const res = await fetch(`/api/g/${token}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json as GuestView;
  }, [token]);

  useEffect(() => {
    let alive = true;
    fetchView()
      .then((v) => {
        if (!alive) return;
        setView(v);
        setEntryOpen((o) => o ?? !v.guest.hasCalendar);
      })
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
          <ErrorText>{error}</ErrorText>
        ) : (
          <Note className="py-16 text-center">読み込み中…</Note>
        )}
      </div>
    );
  }

  const { guest, meeting: m } = view;
  const endMs = m.confirmed_start ? Date.parse(m.confirmed_start) + m.duration_min * 60 * 1000 : null;
  const calendarItem = m.confirmed_start
    ? { id: token, title: m.title, description: m.description, location: m.location, event_date: m.confirmed_start, duration_min: m.duration_min }
    : null;

  return (
    <div className="px-4 pt-6 pb-12 md:mx-auto md:max-w-3xl md:px-0">
      {/* 見出し：メンバー向けの会議ページと同じ並び（主催者などメンバーの名前は出さない） */}
      <header className="border-line border-b pb-3">
        <div className="flex items-center gap-2">
          {m.status === "open" && <Tag tone="amber">募集中</Tag>}
          {m.status === "confirmed" && <Tag tone="grass">決定</Tag>}
          {m.status === "failed" && <Tag tone="muted">不成立</Tag>}
          <span className="text-ink-soft text-[13px]">{guest.name} さんへのご招待</span>
        </div>
        <h1 className="text-ink mt-1 text-xl leading-snug font-bold md:text-2xl">{m.title}</h1>
        <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">
          {durationLabel(m.duration_min)} · {m.ranges.map(rangeLabel).join(" / ")}
          {m.location && ` · ${m.location}`}
          {m.status === "open" && (
            <>
              {" · "}
              <span className="text-ink font-semibold whitespace-nowrap">{fullDateTime(m.deadline)} 結果発表</span>
            </>
          )}
        </p>
        {m.description && <p className="text-ink mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{m.description}</p>}
      </header>

      {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}

      {m.status === "confirmed" && m.confirmed_start && endMs && view.result && calendarItem && (
        <section className="border-grass/40 bg-grass-soft/50 mt-4 rounded-xl border px-4 py-3.5">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-grass text-xs font-bold">この日時に決まりました</p>
              <p className="text-ink text-xl font-bold whitespace-nowrap tabular-nums">
                {fullDateTime(m.confirmed_start)}–{timeOnly(iso(endMs))}
              </p>
            </div>
            {view.result.youAttend && (
              <Dropdown
                label="カレンダーに追加"
                items={calendarMenu(calendarItem)}
              />
            )}
          </div>
          <p className="text-ink mt-2 text-sm">
            {view.result.total}人中 {view.result.attending}人が参加できます。
            <b>{view.result.youAttend ? "あなたも参加できます" : "あなたはこの日時は参加できない扱いです"}</b>
          </p>
        </section>
      )}

      {m.status === "failed" && (
        <p className="border-line text-ink-soft mt-4 rounded-xl border border-dashed px-4 py-5 text-center text-sm">
          候補の中に、みんながそろう時間が見つかりませんでした。主催者からの連絡をお待ちください。
        </p>
      )}

      {m.status === "open" && (
        <>
          {guest.declined ? (
            <div className="bg-navy-soft/60 mt-4 flex flex-col gap-2 rounded-xl px-3.5 py-2.5 md:flex-row md:items-center">
              <p className="text-ink flex flex-1 items-center gap-2 text-sm">
                <Dot className={DOT.declined} />
                <b>「不参加」で回答しています</b>
              </p>
              <button type="button" disabled={saving} onClick={() => setDeclined(false)} className={btn.secondary}>
                やっぱり参加できる
              </button>
            </div>
          ) : (
            <>
              <section className="mt-4">
                <SectionTitle title="あなたの予定を教えてください" />
                <Note>
                  結果発表（{fullDateTime(m.deadline)}）までに、①か②のどちらかでお願いします。予定の中身（件名など）は誰にも見えません。
                </Note>
              </section>

              <section className="border-line mt-3 rounded-xl border bg-white p-3.5">
                <p className="text-ink mb-2 text-sm font-bold">① カレンダーをつなぐ（自動）</p>
                <CalendarConnections guestToken={token} />
              </section>

              <section className="border-line mt-3 rounded-xl border bg-white p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-sm font-bold">② 予定を手入力する</p>
                  <button type="button" onClick={() => setEntryOpen(!entryOpen)} className={btn.text}>
                    {entryOpen ? "閉じる" : "開く"}
                  </button>
                </div>
                {entryOpen && (
                  <div className="mt-2.5">
                    <MeetingEntry
                      ranges={m.ranges}
                      loadUrl={`/api/g/${token}/entry`}
                      saveUrl={`/api/g/${token}/entry`}
                      saveBody={{}}
                      onSaved={refresh}
                    />
                  </div>
                )}
              </section>

              <div className="mt-3 flex justify-end">
                <button type="button" disabled={saving} onClick={() => setDeclined(true)} className={btn.secondary}>
                  どの日時でも参加できない
                </button>
              </div>
            </>
          )}

          {view.preview && <Preview
              result={view.preview}
              durationMin={m.duration_min}
              deadline={m.deadline}
              calendarBase={{ id: token, title: m.title, description: m.description, location: m.location, duration_min: m.duration_min }}
            />}
        </>
      )}
    </div>
  );
}

/** 「今の時点の候補」は、これより多いと残りを折りたたむ */
const PREVIEW_LIMIT = 5;

function Preview({
  result,
  durationMin,
  deadline,
  calendarBase,
}: {
  result: SlotResult;
  durationMin: number;
  deadline: string;
  calendarBase: Omit<CalendarItem, "event_date">;
}) {
  const [showAll, setShowAll] = useState(false);
  const ok = result.available !== null && result.windows.length > 0;
  return (
    <section className="mt-6">
      <SectionTitle
        title="今の時点の候補"
        meta={
          ok
            ? result.available === result.total
              ? `全員そろう ${result.windows.length}件`
              : `${result.available}/${result.total}人 ${result.windows.length}件`
            : undefined
        }
      />
      {!ok ? (
        <p className="border-line text-ink-soft rounded-lg border border-dashed px-4 py-5 text-center text-sm">
          今のところ、みんながそろう時間はまだありません
        </p>
      ) : (
        <>
          <ul className="border-line divide-line divide-y rounded-lg border bg-white">
            {(showAll ? result.windows : result.windows.slice(0, PREVIEW_LIMIT)).map((w) => (
              <li key={w.start} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="text-ink-soft w-20 shrink-0 text-[13px]">{fullDateTime(iso(w.start)).split("）")[0]}）</span>
                <span className="text-ink flex-1 text-[15px] font-semibold tabular-nums">
                  {timeOnly(iso(w.start))}–{timeOnly(iso(w.end))}
                </span>
                {/* 候補を【仮】・空きのまま自分のカレンダーに入れる。時間帯の頭から会議の長さぶん */}
                <Dropdown
                  label="仮で追加"
                  alignRight
                  buttonClass={`${btn.text} shrink-0 text-[13px]`}
                  items={calendarMenu({ ...calendarBase, id: `${calendarBase.id}-${w.start}`, event_date: iso(w.start), tentative: true })}
                />
              </li>
            ))}
          </ul>
          {result.windows.length > PREVIEW_LIMIT && (
            <button type="button" onClick={() => setShowAll(!showAll)} className={`${btn.text} mt-1.5`}>
              {showAll ? "閉じる" : `ほか ${result.windows.length - PREVIEW_LIMIT}件を表示`}
            </button>
          )}
          <Note className="mt-1">
            {fullDateTime(deadline)} の結果発表で、みんなの最新の予定から一番早くそろう時間に決まります。各時間帯の中なら {durationLabel(durationMin)} をどこに入れても大丈夫です。
          </Note>
        </>
      )}
    </section>
  );
}
