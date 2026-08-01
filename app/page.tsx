"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EventCard from "@/components/EventCard";
import { isSupabaseConfigured, listUpcomingEvents } from "@/lib/data";
import { campusOf } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import type { EventWithCount } from "@/lib/types";

const FILTERS = ["すべて", "阪大", "京大", "オンライン"] as const;
type Filter = (typeof FILTERS)[number];

export default function EventListPage() {
  const [events, setEvents] = useState<EventWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("すべて");
  const profile = useProfile();

  useEffect(() => {
    listUpcomingEvents()
      .then(setEvents)
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    if (!events) return [];
    if (filter === "すべて") return events;
    return events.filter((e) => campusOf(e.location) === filter);
  }, [events, filter]);

  return (
    <>
      <header className="flex items-start justify-between px-4 pt-6 pb-4 md:px-0 md:pt-0 md:pb-6">
        <div>
          <h1 className="text-ink text-2xl font-bold md:text-3xl">イベント</h1>
          <p className="text-ink-soft mt-0.5 text-xs md:text-sm">
            阪大 × 京大 AIコミュニティ
          </p>
        </div>
        {/* PC ではヘッダー右上のアバターと重複するので隠す */}
        <Link
          href="/mypage"
          aria-label="マイページ"
          className="bg-navy-soft text-navy flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold md:hidden"
        >
          {profile ? (
            profile.name.trim().charAt(0)
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.5" fill="currentColor" />
              <path
                d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
                fill="currentColor"
              />
            </svg>
          )}
        </Link>
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 pb-4 md:px-0 md:pb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              filter === f
                ? "bg-navy text-white"
                : "border-line text-ink-soft border bg-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-0">
        {error && (
          <p className="text-amber bg-amber-soft rounded-xl p-3 text-xs">
            読み込みに失敗しました：{error}
          </p>
        )}

        {!events && !error && (
          <p className="text-ink-soft py-10 text-center text-xs">読み込み中…</p>
        )}

        {events && visible.length === 0 && (
          <p className="text-ink-soft py-10 text-center text-xs">
            該当するイベントはありません
          </p>
        )}

        {/* スマホは1列、PC は2列（広い画面で3列） */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {!isSupabaseConfigured && (
        <p className="text-ink-soft px-4 pt-6 text-center text-[11px]">
          モックデータで表示中 — <code>.env.local</code> を設定すると Supabase
          に切り替わります
        </p>
      )}
    </>
  );
}
