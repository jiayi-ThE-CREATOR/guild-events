"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PollStart, PollVote } from "@/components/EventPoll";
import MeetingFiles, { type FileItem } from "@/components/MeetingFiles";
import PageHeader from "@/components/PageHeader";
import { btn, Dropdown, ErrorText, MapLink, Menu, Note, SectionTitle, Tag } from "@/components/ui";
import { calendarMenu, withAddress } from "@/lib/calendar";
import {
  deleteEvent,
  getEvent,
  isPast,
  isSupabaseConfigured,
  listApplicantsByEvent,
  setAttendance,
} from "@/lib/data";
import { campusOf, fullDateTime, remainingSeats } from "@/lib/format";
import { durationLabel } from "@/lib/meetings";
import { isMember, isOrganizer } from "@/lib/members";
import type { PollOption } from "@/lib/poll";
import { useProfile } from "@/lib/profile";
import { rangeLabel, type CandidateRange } from "@/lib/ranges";
import { isScheduled, type ApplicationRecord, type EventWithCount } from "@/lib/types";
import { useIsClient } from "@/lib/useIsClient";

/**
 * イベントの詳細。会議ページと同じ作り：見出し＋「⋯」メニュー、自分の状態の帯、本文と参加者の 2 列。
 * 参加はメンバーのワンタップ（申請フォームは無い）。資料は会議と同じ部品で、追加すると参加者にメールが届く。
 * 日程調整中のイベントは、つないでいる会議の要約と、会議ページ（予定を入れる場所）への導線を出す。
 * 2 回目として、主催者は候補から日程を選んで投票にできる。投票はこのページで行う（EventPoll）。
 */

/** api/events/[id]/schedule の要約 */
type Schedule = {
  id: string;
  status: "open" | "voting" | "confirmed" | "failed";
  organizer: string;
  participants: string[];
  duration_min: number;
  ranges: CandidateRange[];
  deadline: string;
  entered: { done: number; of: number } | null;
  /** 投票中（2 回目）だけ */
  poll: PollOption[] | null;
};
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isClient = useIsClient();
  const profile = useProfile();
  const [event, setEvent] = useState<EventWithCount | null>(null);
  const [applicants, setApplicants] = useState<ApplicationRecord[] | null>(null);
  // 資料はサーバー経由でしか読めない。読めない環境（モックなど）では欄ごと出さない
  const [files, setFiles] = useState<FileItem[] | "loading" | "none">(isSupabaseConfigured ? "loading" : "none");
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  const fetchEvent = useCallback(
    () =>
      Promise.all([
        getEvent(id),
        // 一覧の取得に失敗しても本体は表示したいので、ここでは握りつぶす
        listApplicantsByEvent(id).catch(() => [] as ApplicationRecord[]),
      ]),
    [id],
  );

  const fetchFiles = useCallback(async (): Promise<FileItem[] | "none"> => {
    if (!isSupabaseConfigured) return "none";
    const res = await fetch(`/api/events/${id}/files`);
    return res.ok ? (await res.json()).files : "none";
  }, [id]);

  const show = useCallback(([found, rows]: [EventWithCount | null, ApplicationRecord[]]) => {
    if (!found) return setNotFound(true);
    setEvent(found);
    setApplicants(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchEvent()
      .then((r) => alive && show(r))
      .catch((e: Error) => alive && setError(e.message));
    fetchFiles()
      .then((f) => alive && setFiles(f))
      .catch(() => alive && setFiles("none"));
    return () => {
      alive = false;
    };
  }, [fetchEvent, fetchFiles, show]);

  // 日程調整中・不成立のイベントだけ、会議の要約を読む。ここで結果発表を迎えたらイベントを読み直す
  const dateStatus = event?.date_status;
  const fetchSchedule = useCallback(async (): Promise<{ schedule: Schedule | null; settled: boolean }> => {
    const json = await (await fetch(`/api/events/${id}/schedule`)).json();
    return { schedule: json.meeting ? { ...json.meeting, poll: json.poll ?? null } : null, settled: !!json.settled };
  }, [id]);
  useEffect(() => {
    if (!dateStatus || dateStatus === "fixed" || !isSupabaseConfigured) return;
    let alive = true;
    fetchSchedule()
      .then(async ({ schedule, settled }) => {
        if (!alive) return;
        setSchedule(schedule);
        if (settled) show(await fetchEvent());
      })
      .catch(() => alive && setSchedule(null));
    return () => {
      alive = false;
    };
  }, [dateStatus, fetchSchedule, fetchEvent, show]);
  // 投票を始めた・投票した・決めたあと。決まればイベントも変わるので読み直す
  const reloadSchedule = async () => {
    setSchedule((await fetchSchedule()).schedule);
    show(await fetchEvent());
  };

  const load = async () => show(await fetchEvent());
  const loadFiles = async () => setFiles(await fetchFiles());

  async function attend(attending: boolean) {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setAttendance(id, profile.name, profile.university, attending);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event || saving) return;
    const count = applicants?.length ?? 0;
    const warning =
      (count > 0 ? `\n\n参加予定の${count}名の記録も一緒に消えます。` : "") +
      (isScheduled(event) ? "" : "\n\n日程調整（会議のページ・入れた予定）も一緒に消えます。");
    if (!window.confirm(`「${event.title}」を削除します。${warning}\n\nこの操作は取り消せません。`)) return;
    setSaving(true);
    try {
      await deleteEvent(event.id);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (!event) {
    return (
      <div className="md:mx-auto md:max-w-5xl">
        <PageHeader title="イベント" />
        <div className="px-4 py-6 md:px-0">
          {error ? (
            <ErrorText>読み込みに失敗しました：{error}</ErrorText>
          ) : (
            <Note className="py-10 text-center">{notFound ? "このイベントは見つかりませんでした" : "読み込み中…"}</Note>
          )}
        </div>
      </div>
    );
  }

  const remaining = remainingSeats(event.capacity, event.applied);
  const fixed = isScheduled(event);
  // 日程調整中の event_date は仮なので、終了の判定に使わない
  const past = fixed && isPast(event);
  const campus = campusOf(event.location);
  const me = isClient && profile ? (applicants ?? []).find((a) => a.name === profile.name) : undefined;
  const menuItems =
    isClient && isOrganizer(profile?.name)
      ? [
          { label: "このイベントを編集", onClick: () => router.push(`/events/${event.id}/edit`) },
          { label: "このイベントを削除", onClick: handleDelete, danger: true },
        ]
      : [];

  return (
    <div className="md:mx-auto md:max-w-5xl">
      <PageHeader title="イベント" />
      <div className="px-4 pt-3 pb-10 md:px-0 md:pt-1">
        {/* 見出し */}
        <header className="border-line border-b pb-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusTag past={past} remaining={remaining} dateStatus={event.date_status} />
                {(campus === "阪大" || campus === "京大") && (
                  <span className={`text-[13px] font-semibold ${campus === "阪大" ? "text-osaka" : "text-kyoto"}`}>{campus}</span>
                )}
              </div>
              <h1 className="text-ink mt-1 text-xl leading-snug font-bold md:text-2xl">{event.title}</h1>
              <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">
                <span className="text-ink font-semibold whitespace-nowrap">
                  {fixed
                    ? `${fullDateTime(event.event_date)}〜`
                    : event.date_status === "failed"
                      ? "日時未定"
                      : `日程調整中${event.schedule_deadline ? `（${fullDateTime(event.schedule_deadline)} 結果発表）` : ""}`}
                </span>
                {` · ${event.location ?? "場所未定"} · `}
                {event.capacity === null ? "定員なし" : `定員 ${event.capacity}人（残り ${remaining}）`}
              </p>
              {event.address && <MapLink address={event.address} />}
              {event.description && (
                <p className="text-ink mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{event.description}</p>
              )}
            </div>
            <Menu items={menuItems} />
          </div>
        </header>

        {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}

        {!fixed && (
          <ScheduleBar
            status={event.date_status!}
            schedule={schedule}
            member={isClient ? (profile?.name ?? null) : null}
            onChanged={reloadSchedule}
          />
        )}

        {isClient && fixed && (
          <YouBar
            event={event}
            me={me}
            name={profile?.name ?? null}
            past={past}
            full={remaining !== null && remaining <= 0}
            saving={saving}
            onAttend={attend}
          />
        )}

        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_320px]">
          <div>
            {Array.isArray(files) ? (
              <MeetingFiles
                files={files}
                downloadBase={`/api/events/${event.id}/files`}
                apiBase={isClient && isMember(profile?.name ?? "") ? `/api/events/${event.id}` : undefined}
                uploader={profile?.name ?? null}
                onChanged={loadFiles}
              />
            ) : files === "loading" ? (
              <Note>資料を読み込み中…</Note>
            ) : null}
          </div>
          <aside className="md:border-line md:border-l md:pl-6">
            <People applicants={applicants} capacity={event.capacity} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusTag({
  past,
  remaining,
  dateStatus,
}: {
  past: boolean;
  remaining: number | null;
  dateStatus?: EventWithCount["date_status"];
}) {
  if (dateStatus === "scheduling") return <Tag tone="amber">日程調整中</Tag>;
  if (dateStatus === "failed") return <Tag tone="muted">日程未定</Tag>;
  if (past) return <Tag tone="muted">終了</Tag>;
  if (remaining === 0) return <Tag tone="muted">満席</Tag>;
  if (remaining !== null && remaining <= 5) return <Tag tone="amber">あと{remaining}席</Tag>;
  return <Tag tone="grass">受付中</Tag>;
}

/**
 * 日程調整中・不成立のときの帯。予定を入れる・不参加にする・延長するなどは会議ページで行う
 * （会議と同じ画面をそのまま使う）。決まると、その時間に空いている人は自動で参加になる
 */
function ScheduleBar({
  status,
  schedule,
  member,
  onChanged,
}: {
  status: "scheduling" | "failed" | "fixed";
  schedule: Schedule | null;
  member: string | null;
  onChanged: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  // 投票を始める・先に決めるのは、日程調整の主催者と運営
  const canManage = !!schedule && !!member && (schedule.organizer === member || isOrganizer(member));

  if (schedule?.status === "voting" && schedule.poll) {
    return (
      <section className="bg-amber-soft/60 mt-3 rounded-xl px-3.5 py-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-ink text-sm">
            <b>日程を投票で決めています</b>
            <span className="text-ink-soft ml-2 text-[13px]">締め切り {fullDateTime(schedule.deadline)}</span>
          </p>
          <Link href={`/schedule/${schedule.id}`} className={btn.text}>日程調整ページ</Link>
        </div>
        <PollVote
          key={schedule.poll.map((o) => `${o.id}:${o.voters.join(",")}`).join("|")}
          meetingId={schedule.id}
          options={schedule.poll}
          participants={schedule.participants}
          deadline={schedule.deadline}
          member={member}
          canDecide={canManage}
          onChanged={onChanged}
        />
      </section>
    );
  }

  return (
    <div className={`mt-3 rounded-xl px-3.5 py-2.5 ${status === "failed" ? "bg-canvas" : "bg-amber-soft/60"}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 text-sm">
          {status === "failed" ? (
            <p className="text-ink"><b>候補の中に、そろう時間がありませんでした</b></p>
          ) : (
            <p className="text-ink">
              <b>みんなの予定から日時を決めています</b>
              {schedule?.entered && (
                <span className="text-ink-soft ml-2 text-[13px]">予定入力 {schedule.entered.done}/{schedule.entered.of}人</span>
              )}
            </p>
          )}
          {schedule && (
            <Note className="mt-0.5">
              主催 {schedule.organizer} · {durationLabel(schedule.duration_min)} · 候補 {schedule.ranges.map(rangeLabel).join(" / ")}
            </Note>
          )}
        </div>
        {schedule && (
          <Link href={`/schedule/${schedule.id}`} className={`${status === "failed" ? btn.secondary : btn.primary} shrink-0 text-center`}>
            {status === "failed" ? "日程調整ページで募集をやり直す" : "日程調整ページで予定を入れる"}
          </Link>
        )}
      </div>
      {status === "scheduling" && (
        <Note className="mt-1.5">
          結果発表で、選ばれた人の予定から全員（だめなら 1 人欠け）がそろう一番早い時間に決まります。決まると、その時間に空いている人は自動で参加になります。
        </Note>
      )}
      {status === "scheduling" && schedule?.status === "open" && canManage && (
        <div className="mt-2">
          <button type="button" onClick={() => setStarting(!starting)} className={starting ? btn.secondary : btn.text}>
            {starting ? "閉じる" : "候補から日程を選んで投票にする（2 回目）"}
          </button>
          {starting && (
            <div className="border-line mt-2 rounded-lg border bg-white p-3">
              <PollStart meetingId={schedule.id} durationMin={schedule.duration_min} onDone={onChanged} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 自分の状態を 1 行で。操作はボタンで横に並べる */
function YouBar({
  event,
  me,
  name,
  past,
  full,
  saving,
  onAttend,
}: {
  event: EventWithCount;
  me: ApplicationRecord | undefined;
  name: string | null;
  past: boolean;
  full: boolean;
  saving: boolean;
  onAttend: (attending: boolean) => void;
}) {
  if (past) {
    return (
      <Note className="mt-3">
        このイベントは終了しました{me ? "。参加ありがとうございました" : ""}
      </Note>
    );
  }
  if (!name) {
    return (
      <Note className="mt-3">
        <Link href="/mypage" className="text-navy underline">マイページ</Link> で名前を選ぶと、ワンタップで参加できます。
      </Note>
    );
  }
  if (!me && !isMember(name)) {
    return <Note className="mt-3">参加できるのは GUILD のメンバーだけです（マイページで選んだ名前がメンバー一覧にありません）。</Note>;
  }

  const text = me?.status === "attended" ? "出席済み" : me ? "参加予定です" : full ? "満席です" : "まだ参加していません";
  return (
    <div className={`mt-3 rounded-xl px-3.5 py-2.5 ${me ? "bg-grass-soft/60" : "bg-navy-soft/60"}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="text-ink min-w-0 flex-1 text-sm">
          あなた：<b>{text}</b>
        </p>
        <div className="flex flex-wrap gap-2">
          {me && (
            <Dropdown
              label="カレンダーに追加"
              items={calendarMenu(withAddress(event, event.address))}
            />
          )}
          {me?.status === "applied" && (
            <button type="button" disabled={saving} onClick={() => onAttend(false)} className={btn.secondary}>
              参加をやめる
            </button>
          )}
          {!me && !full && (
            <button type="button" disabled={saving} onClick={() => onAttend(true)} className={btn.primary}>
              参加する
            </button>
          )}
        </div>
      </div>
      {!me && full && <Note className="mt-1.5">キャンセルが出ると参加できます。</Note>}
      {me && <Note className="mt-1.5">終了時刻は登録されていないため、カレンダーには開始から 2 時間で入ります。</Note>}
    </div>
  );
}

/** 参加者を小さなラベルで並べる（申請順） */
function People({ applicants, capacity }: { applicants: ApplicationRecord[] | null; capacity: number | null }) {
  const n = applicants?.length ?? 0;
  return (
    <section>
      <SectionTitle title="参加者" meta={capacity === null ? `${n}人` : `${n}/${capacity}人`} />
      {applicants === null ? (
        <Note>読み込み中…</Note>
      ) : n === 0 ? (
        <p className="text-ink-soft text-[13px]">まだ参加者はいません</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {applicants.map((a) => (
            <li
              key={a.id}
              className="border-line text-ink flex items-center gap-1.5 rounded-full border bg-white py-1 pr-3 pl-3 text-[13px]"
            >
              {a.name}
              {a.status === "attended" && <span className="text-grass text-xs font-bold">出席済</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
