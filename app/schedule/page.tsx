"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { btn, ErrorText, Note, Segmented, Tag } from "@/components/ui";
import { fullDateTime } from "@/lib/format";
import { durationLabel, type MeetingSummary } from "@/lib/meetings";

/**
 * 日程調整＝会議の一覧。「＋」から会議を作ると募集中になり、
 * 結果発表の時刻に参加者のカレンダーから自動で日時が決まる。
 */

const TABS = [
  { key: "open", label: "募集中" },
  { key: "done", label: "決定済み" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function MeetingListPage() {
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("open");

  useEffect(() => {
    fetch("/api/meetings")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setMeetings(json.meetings);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = (meetings ?? [])
    .filter((m) => (tab === "open" ? m.status === "open" : m.status !== "open"))
    .sort((a, b) =>
      tab === "open"
        ? a.deadline.localeCompare(b.deadline)
        : (b.confirmed_start ?? b.deadline).localeCompare(a.confirmed_start ?? a.deadline),
    );

  return (
    <div className="px-4 pt-5 pb-10 md:mx-auto md:max-w-3xl md:px-0 md:pt-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-ink text-xl font-bold md:text-2xl">ミーティング</h1>
          <Note>会議を作ると、結果発表の時刻にみんなの予定から日時が自動で決まります。</Note>
        </div>
        <Link href="/schedule/new" className={`${btn.primary} shrink-0`}>
          ＋ 会議を作る
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({
            value: t.key,
            label: `${t.label} ${(meetings ?? []).filter((m) => (t.key === "open" ? m.status === "open" : m.status !== "open")).length}`,
          }))}
        />
      </div>

      {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
      {!meetings && !error && <Note className="py-16 text-center">読み込み中…</Note>}

      {meetings && visible.length === 0 && (
        <p className="border-line text-ink-soft mt-3 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {tab === "open" ? "募集中の会議はありません" : "決定済みの会議はありません"}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="border-line divide-line mt-3 divide-y overflow-hidden rounded-lg border bg-white">
          {visible.map((m) => (
            <li key={m.id}>
              <Link href={`/schedule/${m.id}`} className="hover:bg-canvas/60 flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {m.status === "open" && <Tag tone="amber">募集中</Tag>}
                    {m.status === "confirmed" && <Tag tone="grass">決定</Tag>}
                    {m.status === "failed" && <Tag tone="muted">不成立</Tag>}
                    <h2 className="text-ink truncate text-[15px] font-bold">{m.title}</h2>
                  </div>
                  <p className="text-ink-soft mt-0.5 truncate text-[13px]">
                    {m.status === "confirmed" && m.confirmed_start ? (
                      <span className="text-ink font-semibold">{fullDateTime(m.confirmed_start)}〜</span>
                    ) : m.status === "open" ? (
                      <>{fullDateTime(m.deadline)} 結果発表</>
                    ) : (
                      "そろう時間なし"
                    )}
                    {` · ${durationLabel(m.duration_min)} · 主催 ${m.organizer}`}
                    {!m.entered && ` · ${m.participants.length}人`}
                  </p>
                </div>
                {m.entered && (
                  <span className="shrink-0 text-right leading-tight">
                    <span className="text-ink-soft block text-[11px]">予定入力</span>
                    <span className="text-ink text-sm font-bold">
                      {m.entered.done}/{m.entered.of}
                      <span className="text-ink-soft text-xs font-normal">人</span>
                    </span>
                  </span>
                )}
                <span aria-hidden className="text-ink-soft shrink-0 text-lg">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
