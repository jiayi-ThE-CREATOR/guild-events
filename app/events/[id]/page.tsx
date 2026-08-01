"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CampusBadge, SeatBadge } from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import { getEvent, listApplicationsByName } from "@/lib/data";
import { campusOf, fullDateTime, remainingSeats } from "@/lib/format";
import { loadProfile } from "@/lib/profile";
import type { EventWithCount } from "@/lib/types";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventWithCount | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  useEffect(() => {
    getEvent(id)
      .then((found) => (found ? setEvent(found) : setNotFound(true)))
      .catch((e: Error) => setError(e.message));

    const profile = loadProfile();
    if (profile) {
      listApplicationsByName(profile.name)
        .then((rows) => setAlreadyApplied(rows.some((r) => r.event_id === id)))
        .catch(() => setAlreadyApplied(false));
    }
  }, [id]);

  if (error) {
    return (
      <>
        <PageHeader title="イベント詳細" />
        <p className="text-amber bg-amber-soft m-4 rounded-xl p-3 text-xs">
          読み込みに失敗しました：{error}
        </p>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageHeader title="イベント詳細" />
        <p className="text-ink-soft py-16 text-center text-xs">
          このイベントは見つかりませんでした
        </p>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <PageHeader title="イベント詳細" />
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      </>
    );
  }

  const remaining = remainingSeats(event.capacity, event.applied);

  return (
    <>
      <PageHeader title="イベント詳細" />

      <div className="cover-stripes h-36 w-full" aria-hidden="true" />

      <div className="px-4 pt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <CampusBadge campus={campusOf(event.location)} />
          <SeatBadge remaining={remaining} />
        </div>

        <h1 className="text-ink text-xl leading-snug font-bold">
          {event.title}
        </h1>

        <dl className="border-line mt-4 divide-y divide-[var(--color-line)] rounded-2xl border">
          <Row label="日時" value={fullDateTime(event.event_date)} />
          <Row label="場所" value={event.location ?? "場所未定"} />
          <Row
            label="定員"
            value={
              event.capacity === null
                ? "定員なし"
                : `${event.capacity}名（残り${remaining}席）`
            }
          />
        </dl>

        {event.description && (
          <p className="text-ink-soft mt-4 text-sm leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        )}
      </div>

      <div className="px-4 pt-6">
        {alreadyApplied ? (
          <>
            <div className="bg-canvas text-ink-soft w-full rounded-xl py-3.5 text-center text-[15px] font-bold">
              申請済み
            </div>
            <p className="text-ink-soft mt-2 text-center text-[11px]">
              取り消しは{" "}
              <Link href="/mypage" className="text-navy underline">
                マイページ
              </Link>{" "}
              から
            </p>
          </>
        ) : (
          <>
            <Link
              href={`/events/${event.id}/apply`}
              className="bg-grass block w-full rounded-xl py-3.5 text-center text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(0,179,126,0.35)]"
            >
              参加申請する
            </Link>
            <p className="text-ink-soft mt-2 text-center text-[11px]">
              キャンセルはマイページからいつでも
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="text-ink-soft w-12 shrink-0 text-xs">{label}</dt>
      <dd className="text-ink text-sm font-semibold">{value}</dd>
    </div>
  );
}
