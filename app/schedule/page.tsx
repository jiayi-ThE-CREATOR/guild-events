"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
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
    <div className="px-4 pt-6 md:mx-auto md:max-w-3xl md:px-0 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">日程調整</h1>
          <p className="text-ink-soft mt-1 text-xs md:text-sm">
            会議を作ると、結果発表の時刻にみんなのカレンダーから日時が自動で決まります。
          </p>
        </div>
        <Link
          href="/schedule/new"
          aria-label="会議を作成"
          className="bg-navy hover:bg-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl py-2.5 text-xs font-bold transition-colors md:text-sm ${
              tab === t.key ? "bg-navy text-white" : "border-line text-ink-soft border bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-amber bg-amber-soft mt-4 rounded-xl p-3 text-xs">{error}</p>}
      {!meetings && !error && <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>}

      {meetings && visible.length === 0 && (
        <p className="border-line text-ink-soft mt-4 rounded-2xl border border-dashed p-6 text-center text-xs">
          {tab === "open" ? "募集中の会議はありません" : "決定済みの会議はありません"}
          <br />
          <Link href="/schedule/new" className="text-navy mt-1 inline-block underline">
            会議を作成する
          </Link>
        </p>
      )}

      <ul className="mt-4 space-y-3 pb-4">
        {visible.map((m) => (
          <li key={m.id}>
            <Link
              href={`/schedule/${m.id}`}
              className="border-line block rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm md:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-ink text-sm font-bold md:text-base">{m.title}</h2>
                {m.status === "open" && <Badge tone="amber">募集中</Badge>}
                {m.status === "confirmed" && <Badge tone="grass">決定</Badge>}
                {m.status === "failed" && <Badge tone="muted">不成立</Badge>}
              </div>
              <p className="text-ink-soft mt-1 text-xs">
                {m.status === "confirmed" && m.confirmed_start
                  ? `${fullDateTime(m.confirmed_start)}〜（${durationLabel(m.duration_min)}）`
                  : m.status === "open"
                    ? `${fullDateTime(m.deadline)} に結果発表`
                    : "そろう時間が見つかりませんでした"}
              </p>
              <p className="text-ink-soft mt-1 text-[11px]">
                主催 {m.organizer}・参加者 {m.participants.length}人
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
