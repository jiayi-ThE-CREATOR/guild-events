"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import GuildLogo from "@/components/GuildLogo";
import { btn, ErrorText, Note, Segmented, Tag } from "@/components/ui";
import { isPast, isSupabaseConfigured, listEvents } from "@/lib/data";
import { campusOf, fullDateTime, remainingSeats, shortLocation } from "@/lib/format";
import { isScheduled, type EventWithCount } from "@/lib/types";

/**
 * イベントの一覧。会議の一覧（/schedule）と同じ作り：見出し＋作成ボタン、タブ、1 行ずつのリスト。
 * 大学の区分は 阪大（青）／京大（赤）の2つだけ。オンラインは場所欄で表す
 */

const TABS = [
  { key: "upcoming", label: "これから" },
  { key: "past", label: "終了" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const FILTERS = ["すべて", "阪大", "京大"] as const;
type Filter = (typeof FILTERS)[number];

export default function EventListPage() {
  const [events, setEvents] = useState<EventWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("すべて");
  const [tab, setTab] = useState<Tab>("upcoming");

  useEffect(() => {
    listEvents()
      .then(setEvents)
      .catch((e: Error) => setError(e.message));
  }, []);

  // 日程調整中の event_date は仮なので「終了」にはしない
  const ended = (e: EventWithCount) => isScheduled(e) && isPast(e);
  const inTab = (t: Tab) => (events ?? []).filter((e) => (t === "past" ? ended(e) : !ended(e)));

  const visible = useMemo(() => {
    const rows = (events ?? []).filter((e) => (tab === "past" ? isScheduled(e) && isPast(e) : !(isScheduled(e) && isPast(e))));
    // 終了したものは新しい順、これからのものは近い順
    const sorted = tab === "past" ? [...rows].reverse() : rows;
    return filter === "すべて" ? sorted : sorted.filter((e) => campusOf(e.location) === filter);
  }, [events, filter, tab]);

  return (
    <div className="px-4 pt-5 pb-10 md:mx-auto md:max-w-3xl md:px-0 md:pt-0">
      <div className="flex items-center gap-3">
        {/* PC は上部ヘッダーにロゴがあるので、ここではスマホだけ出す */}
        <GuildLogo className="h-10 w-10 shrink-0 md:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="text-ink text-xl font-bold md:text-2xl">イベント</h1>
          <Note>阪大 × 京大 AIコミュニティ。メンバーはイベントページの「参加する」で参加できます。</Note>
        </div>
        <Link href="/events/new" className={`${btn.primary} shrink-0 text-center`}>
          ＋ イベントを作る
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ value: t.key, label: `${t.label} ${inTab(t.key).length}` }))}
        />
        <Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: f }))} />
      </div>

      {error && <div className="mt-3"><ErrorText>読み込みに失敗しました：{error}</ErrorText></div>}
      {!events && !error && <Note className="py-16 text-center">読み込み中…</Note>}

      {events && visible.length === 0 && (
        <p className="border-line text-ink-soft mt-3 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {tab === "past" ? "終了したイベントはありません" : "予定されているイベントはありません"}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="border-line divide-line mt-3 divide-y overflow-hidden rounded-lg border bg-white">
          {visible.map((e) => (
            <EventRow key={e.id} event={e} past={tab === "past"} />
          ))}
        </ul>
      )}

      {!isSupabaseConfigured && (
        <Note className="pt-6 text-center">
          モックデータで表示中 — <code>.env.local</code> を設定すると Supabase に切り替わります
        </Note>
      )}
    </div>
  );
}

function EventRow({ event: e, past }: { event: EventWithCount; past: boolean }) {
  const remaining = remainingSeats(e.capacity, e.applied);
  const campus = campusOf(e.location);
  return (
    <li>
      <Link href={`/events/${e.id}`} className="hover:bg-canvas/60 flex items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {e.date_status === "scheduling" ? (
              <Tag tone="amber">日程調整中</Tag>
            ) : e.date_status === "failed" ? (
              <Tag tone="muted">日程未定</Tag>
            ) : past ? (
              <Tag tone="muted">終了</Tag>
            ) : remaining === 0 ? (
              <Tag tone="muted">満席</Tag>
            ) : remaining !== null && remaining <= 5 ? (
              <Tag tone="amber">あと{remaining}席</Tag>
            ) : (
              <Tag tone="grass">受付中</Tag>
            )}
            <h2 className={`truncate text-[15px] font-bold ${past ? "text-ink-soft" : "text-ink"}`}>{e.title}</h2>
          </div>
          <p className="text-ink-soft mt-0.5 truncate text-[13px]">
            <span className={past ? "" : "text-ink font-semibold"}>
              {isScheduled(e)
                ? `${fullDateTime(e.event_date)}〜`
                : e.date_status === "failed"
                  ? "日時未定"
                  : e.schedule_deadline
                    ? `${fullDateTime(e.schedule_deadline)} 結果発表`
                    : "日程調整中"}
            </span>
            {" · "}
            {(campus === "阪大" || campus === "京大") && (
              <span className={`font-semibold ${campus === "阪大" ? "text-osaka" : "text-kyoto"}`}>{campus} </span>
            )}
            {shortLocation(e.location)}
          </p>
        </div>
        <span className="shrink-0 text-right leading-tight">
          <span className="text-ink-soft block text-[11px]">参加</span>
          <span className="text-ink text-sm font-bold">
            {e.applied}
            {e.capacity !== null && <span className="text-ink-soft text-xs font-normal">/{e.capacity}</span>}
            <span className="text-ink-soft text-xs font-normal">人</span>
          </span>
        </span>
        <span aria-hidden className="text-ink-soft shrink-0 text-lg">›</span>
      </Link>
    </li>
  );
}
