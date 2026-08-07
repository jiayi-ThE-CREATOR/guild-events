"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, CampusBadge, SeatBadge } from "@/components/Badge";
import CalendarLinks from "@/components/CalendarLinks";
import PageHeader from "@/components/PageHeader";
import {
  deleteEvent,
  getEvent,
  isPast,
  listApplicantsByEvent,
  listApplicationsByName,
} from "@/lib/data";
import { campusOf, fullDateTime, remainingSeats } from "@/lib/format";
import { isOrganizer } from "@/lib/members";
import { loadProfile, useProfile } from "@/lib/profile";
import type { ApplicationRecord, EventWithCount } from "@/lib/types";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfile();
  const [event, setEvent] = useState<EventWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [applicants, setApplicants] = useState<ApplicationRecord[] | null>(
    null,
  );

  useEffect(() => {
    getEvent(id)
      .then((found) => (found ? setEvent(found) : setNotFound(true)))
      .catch((e: Error) => setError(e.message));

    // 一覧の取得に失敗しても本体は表示したいので、ここでは握りつぶす
    listApplicantsByEvent(id)
      .then(setApplicants)
      .catch(() => setApplicants([]));

    const profile = loadProfile();
    if (profile) {
      listApplicationsByName(profile.name)
        .then((rows) => setAlreadyApplied(rows.some((r) => r.event_id === id)))
        .catch(() => setAlreadyApplied(false));
    }
  }, [id]);

  async function handleDelete() {
    if (!event || deleting) return;
    const count = applicants?.length ?? 0;
    const warning =
      count > 0 ? `\n\n申請中の${count}名の記録も一緒に消えます。` : "";
    if (
      !window.confirm(
        `「${event.title}」を削除します。${warning}\n\nこの操作は取り消せません。`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="md:mx-auto md:max-w-3xl">
        <PageHeader title="イベント詳細" />
        <p className="text-amber bg-amber-soft m-4 rounded-xl p-3 text-xs">
          読み込みに失敗しました：{error}
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="md:mx-auto md:max-w-3xl">
        <PageHeader title="イベント詳細" />
        <p className="text-ink-soft py-16 text-center text-xs">
          このイベントは見つかりませんでした
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="md:mx-auto md:max-w-3xl">
        <PageHeader title="イベント詳細" />
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      </div>
    );
  }

  const remaining = remainingSeats(event.capacity, event.applied);
  const past = isPast(event);

  return (
    <div className="md:mx-auto md:max-w-3xl">
      <PageHeader title="イベント詳細" />

      <div
        className="cover-stripes h-36 w-full md:h-56 md:rounded-2xl"
        aria-hidden="true"
      />

      <div className="px-4 pt-4 md:px-0 md:pt-6">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <CampusBadge campus={campusOf(event.location)} />
          <SeatBadge remaining={remaining} />
        </div>

        <h1 className="text-ink text-xl leading-snug font-bold md:text-3xl">
          {event.title}
        </h1>

        <dl className="border-line mt-4 divide-y divide-[var(--color-line)] rounded-2xl border md:mt-6 md:bg-white">
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
          <p className="text-ink-soft mt-4 text-sm leading-relaxed whitespace-pre-wrap md:mt-6 md:text-base">
            {event.description}
          </p>
        )}
      </div>

      {/* PC では全幅の帯にせず、左寄せのボタン＋補足の並びにする */}
      <div className="px-4 pt-6 md:flex md:items-center md:gap-4 md:px-0 md:pt-8">
        {past ? (
          <>
            <div className="bg-canvas text-ink-soft w-full rounded-xl py-3.5 text-center text-[15px] font-bold md:w-auto md:px-12">
              このイベントは終了しました
            </div>
            <p className="text-ink-soft mt-2 text-center text-[11px] md:mt-0 md:text-left md:text-xs">
              {alreadyApplied ? "参加ありがとうございました" : ""}
            </p>
          </>
        ) : alreadyApplied ? (
          <>
            <div className="bg-canvas text-ink-soft w-full rounded-xl py-3.5 text-center text-[15px] font-bold md:w-auto md:px-12">
              申請済み
            </div>
            <p className="text-ink-soft mt-2 text-center text-[11px] md:mt-0 md:text-left md:text-xs">
              取り消しは{" "}
              <Link href="/mypage" className="text-navy underline">
                マイページ
              </Link>{" "}
              から
            </p>
          </>
        ) : remaining !== null && remaining <= 0 ? (
          <>
            <div className="bg-canvas text-ink-soft w-full rounded-xl py-3.5 text-center text-[15px] font-bold md:w-auto md:px-12">
              満席
            </div>
            <p className="text-ink-soft mt-2 text-center text-[11px] md:mt-0 md:text-left md:text-xs">
              キャンセルが出ると再び申請できます
            </p>
          </>
        ) : (
          <>
            <Link
              href={`/events/${event.id}/apply`}
              className="bg-grass block w-full rounded-xl py-3.5 text-center text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(0,179,126,0.35)] md:w-auto md:px-12"
            >
              参加申請する
            </Link>
            <p className="text-ink-soft mt-2 text-center text-[11px] md:mt-0 md:text-left md:text-xs">
              キャンセルはマイページからいつでも
            </p>
          </>
        )}
      </div>

      {alreadyApplied && !past && (
        <div className="px-4 pt-6 md:px-0 md:pt-8">
          <CalendarLinks event={event} />
        </div>
      )}

      <section className="px-4 pt-8 md:px-0 md:pt-10">
        <h2 className="text-ink mb-3 text-sm font-bold md:text-base">
          参加者（{applicants?.length ?? 0}）
        </h2>

        {applicants === null && (
          <p className="text-ink-soft py-6 text-center text-xs">読み込み中…</p>
        )}

        {applicants?.length === 0 && (
          <p className="border-line text-ink-soft rounded-2xl border border-dashed p-6 text-center text-xs">
            まだ申請はありません
          </p>
        )}

        {applicants !== null && applicants.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {applicants.map((a) => (
              <li
                key={a.id}
                className="border-line flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5"
              >
                <span className="bg-navy-soft text-navy flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {a.name.trim().charAt(0)}
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                  {a.name}
                </span>
                {a.status === "attended" && (
                  <Badge tone="outline">出席済</Badge>
                )}
                <Badge tone="navy">{a.university}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 運営だけに出す。取り消せない操作なので他と離して置く */}
      {isOrganizer(profile?.name) && (
        <section className="px-4 pt-10 pb-2 md:px-0 md:pt-12">
          <h2 className="text-ink-soft mb-2 text-xs font-bold">運営メニュー</h2>
          <Link
            href={`/events/${event.id}/edit`}
            className="border-line text-ink hover:border-navy mb-2 block w-full rounded-xl border py-3 text-center text-sm font-bold transition-colors md:mr-2 md:mb-0 md:inline-block md:w-auto md:px-8"
          >
            このイベントを編集
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="border-kyoto-soft text-kyoto hover:bg-kyoto w-full rounded-xl border py-3 text-sm font-bold transition-colors hover:text-white disabled:opacity-40 md:w-auto md:px-8"
          >
            {deleting ? "削除中…" : "このイベントを削除"}
          </button>
          <p className="text-ink-soft mt-2 text-[11px]">
            イベントを消すと、そのイベントへの申請もすべて消えます。元に戻せません。
          </p>
        </section>
      )}
    </div>
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
