"use client";

import { useEffect, useState } from "react";
import NameSelect from "@/components/NameSelect";
import RangesInput, { jstDate, rangesReady, toCandidateRanges, type RangeRow } from "@/components/RangesInput";
import { btn, Dot, ErrorText, field, Note, Segmented } from "@/components/ui";
import { composeLocation, parseLocation, toDateTimeLocal } from "@/lib/format";
import { hoursLabel, MEETING_DEADLINE_HOURS } from "@/lib/meetings";
import { MEMBERS } from "@/lib/members";
import { loadProfile } from "@/lib/profile";
import type { CandidateRange } from "@/lib/ranges";
import {
  isScheduled,
  VENUES,
  type EventRecord,
  type NewEvent,
  type Venue,
} from "@/lib/types";

/** 「みんなの予定から決める」で作るときの、日程調整（会議）の中身 */
export type EventSchedule = {
  organizer: string;
  participants: string[];
  durationMin: number;
  deadlineHours: number;
  ranges: CandidateRange[];
};

/** イベントの長さの選択肢（分） */
const DURATIONS = [60, 90, 120, 180, 240];

/**
 * 作成と編集で共用するイベントのフォーム（見た目は会議の作成フォームに合わせる）。
 * 作成では「日時が決まっている／みんなの予定から決める」を選べる。後者は会議と同じ日程調整を使い、
 * onSubmit の 2 つめの引数に中身が入る（event_date は使われない）。
 * 日程調整中のイベントを編集するときは、日時の欄を出さない（決まったら自動で入る）。
 */
export default function EventForm({
  initial,
  submitLabel,
  busyLabel,
  allowSchedule = false,
  onSubmit,
}: {
  initial?: EventRecord;
  submitLabel: string;
  busyLabel: string;
  allowSchedule?: boolean;
  onSubmit: (values: NewEvent, schedule: EventSchedule | null) => Promise<void>;
}) {
  const parsed = parseLocation(initial?.location ?? null);
  const dateLocked = !!initial && !isScheduled(initial);
  const [mode, setMode] = useState<"fixed" | "schedule">("fixed");
  const scheduling = allowSchedule && mode === "schedule";

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [venue, setVenue] = useState<Venue | "">(parsed.venue as Venue | "");
  const [detail, setDetail] = useState(parsed.detail);
  const [address, setAddress] = useState(initial?.address ?? "");
  const [date, setDate] = useState(
    initial ? toDateTimeLocal(initial.event_date) : "",
  );
  const [capacity, setCapacity] = useState(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 日程調整（作成で「みんなの予定から決める」を選んだときだけ使う）
  const [organizer, setOrganizer] = useState(() => loadProfile()?.name ?? "");
  const [participants, setParticipants] = useState<Set<string>>(() => {
    const me = loadProfile()?.name;
    return new Set(me ? [me] : []);
  });
  const [connected, setConnected] = useState<string[] | null>(null);
  const [durationMin, setDurationMin] = useState(120);
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [ranges, setRanges] = useState<RangeRow[]>(() => [
    { fromDate: jstDate(7), toDate: jstDate(14), startHour: 10, endHour: 21 },
  ]);

  // 参加者を選ぶときの目安（予定を登録していない人が分かるように）
  useEffect(() => {
    if (!scheduling || connected) return;
    fetch("/api/schedule/members")
      .then((res) => res.json())
      .then((json) => setConnected(json.members ?? []))
      .catch(() => setConnected([]));
  }, [scheduling, connected]);

  function toggle(name: string) {
    const next = new Set(participants);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setParticipants(next);
  }

  const ready =
    title.trim() !== "" &&
    venue !== "" &&
    (scheduling
      ? organizer !== "" && participants.size > 0 && rangesReady(ranges)
      : dateLocked || date !== "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim() || null,
          location: composeLocation(venue, detail),
          address: address.trim() || null,
          // datetime-local はローカル時刻。Date に通して ISO（UTC）に直す。
          // 日程調整中は仮の日時をそのまま残す（日程調整で作るときはサーバーが入れる）
          event_date: dateLocked || scheduling ? (initial?.event_date ?? new Date().toISOString()) : new Date(date).toISOString(),
          capacity: capacity.trim() === "" ? null : Number(capacity),
        },
        scheduling
          ? {
              organizer,
              participants: MEMBERS.filter((m) => participants.has(m)),
              durationMin,
              deadlineHours,
              ranges: toCandidateRanges(ranges),
            }
          : null,
      );
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-line space-y-4 px-4 pt-3 pb-8 md:rounded-xl md:border md:bg-white md:p-6"
    >
      <Field label="イベント名" htmlFor="title" required>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="GUILD勉強会 #2"
          className={field}
        />
      </Field>

      {allowSchedule && (
        <Field label="日時の決め方">
          <div className="flex">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "fixed", label: "日時が決まっている" },
              { value: "schedule", label: "みんなの予定から決める" },
            ]}
          />
          </div>
        </Field>
      )}

      {dateLocked ? (
        <Note>日時は日程調整で決まります（決まると自動で入ります）。</Note>
      ) : scheduling ? (
        <>
          <Field label="主催者" htmlFor="organizer" required>
            <NameSelect id="organizer" value={organizer} onChange={setOrganizer} />
          </Field>

          <fieldset>
            <legend className="text-ink mb-1 block text-[13px] font-semibold">
              予定を見る人（{participants.size}人）<span className="text-amber ml-0.5">*</span>
            </legend>
            <ul className="flex flex-wrap gap-1.5">
              {MEMBERS.map((name) => {
                const unconnected = connected !== null && !connected.includes(name);
                const on = participants.has(name);
                return (
                  <li key={name}>
                    <label
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 pl-2.5 text-[13px] ${
                        on ? "border-navy bg-navy-soft text-navy font-semibold" : "border-line text-ink bg-white"
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(name)} className="sr-only" />
                      <Dot className={unconnected ? "bg-white border border-ink-soft/50" : "bg-grass"} />
                      {name}
                    </label>
                  </li>
                );
              })}
            </ul>
            <Note className="mt-1.5">
              この人たちの予定から、全員（だめなら 1 人欠け）がそろう一番早い時間に決まります。決まったら、その時間に空いている人は自動で参加になります。
              <Dot className="bg-grass" /> 予定登録あり　<Dot className="bg-white border border-ink-soft/50" /> 未登録
            </Note>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field label="イベントの長さ" htmlFor="duration">
              <select id="duration" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={field}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>{m % 60 === 0 ? `${m / 60}時間` : `${Math.floor(m / 60)}時間${m % 60}分`}</option>
                ))}
              </select>
            </Field>
            <Field label="結果発表" htmlFor="deadline">
              <select id="deadline" value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className={field}>
                {MEETING_DEADLINE_HOURS.map((h) => (
                  <option key={h} value={h}>{hoursLabel(h)}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={`候補（${ranges.length}件）`} required>
            <RangesInput ranges={ranges} onChange={setRanges} field={field} />
            <Note className="mt-1.5">1 日だけなら、始まりと終わりを同じ日に。結果発表より後の時間から選ばれます。</Note>
          </Field>
        </>
      ) : (
        <Field label="開催日時" htmlFor="date" required>
          <input
            id="date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={field}
          />
        </Field>
      )}

      <Field label="場所" required>
        <div role="group" aria-label="場所" className="grid grid-cols-3 gap-2">
          {VENUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVenue(v)}
              aria-pressed={venue === v}
              className={`rounded-lg border py-2 text-sm font-semibold ${
                venue === v
                  ? "border-navy bg-navy-soft text-navy"
                  : "border-line text-ink-soft bg-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          id="detail"
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={
            venue === "オンライン"
              ? "Discord など（任意）"
              : "豊中キャンパス B203 など（任意）"
          }
          aria-label="場所の詳細"
          className={`${field} mt-2`}
        />
        {venue !== "" && (
          <Note className="mt-1.5">
            表示される場所：{composeLocation(venue, detail)}
          </Note>
        )}
      </Field>

      <Field label="住所" hint="任意" htmlFor="address">
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="大阪府豊中市待兼山町1-1 など"
          className={field}
        />
        <Note className="mt-1.5">
          入れると、イベントのページに Google マップへのリンクが出ます。
        </Note>
      </Field>

      <Field label="定員" hint="任意" htmlFor="capacity">
        <input
          id="capacity"
          type="number"
          min={1}
          inputMode="numeric"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="30"
          className={field}
        />
        <Note className="mt-1.5">
          空欄にすると定員なし。埋まると「参加する」が押せなくなります。
        </Note>
      </Field>

      <Field label="説明" hint="任意" htmlFor="description">
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="当日やること、持ち物など"
          className={`${field} resize-none`}
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <button
        type="submit"
        disabled={!ready || submitting}
        className={`${btn.primary} w-full py-3`}
      >
        {submitting ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const text = (
    <>
      {label}
      {hint && (
        <span className="text-ink-soft ml-1 font-normal">（{hint}）</span>
      )}
      {required && <span className="text-amber ml-0.5">*</span>}
    </>
  );

  return (
    <div>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="text-ink mb-1 block text-[13px] font-semibold"
        >
          {text}
        </label>
      ) : (
        <p className="text-ink mb-1 text-[13px] font-semibold">{text}</p>
      )}
      {children}
    </div>
  );
}
