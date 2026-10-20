"use client";

import { useState } from "react";
import { btn, ErrorText, field, Note } from "@/components/ui";
import { composeLocation, parseLocation, toDateTimeLocal } from "@/lib/format";
import {
  VENUES,
  type EventRecord,
  type NewEvent,
  type Venue,
} from "@/lib/types";

/** 作成と編集で共用するイベントのフォーム（見た目は会議の作成フォームに合わせる） */
export default function EventForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
}: {
  initial?: EventRecord;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (values: NewEvent) => Promise<void>;
}) {
  const parsed = parseLocation(initial?.location ?? null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [venue, setVenue] = useState<Venue | "">(parsed.venue as Venue | "");
  const [detail, setDetail] = useState(parsed.detail);
  const [date, setDate] = useState(
    initial ? toDateTimeLocal(initial.event_date) : "",
  );
  const [capacity, setCapacity] = useState(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = title.trim() !== "" && venue !== "" && date !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        location: composeLocation(venue, detail),
        // datetime-local はローカル時刻。Date に通して ISO（UTC）に直す
        event_date: new Date(date).toISOString(),
        capacity: capacity.trim() === "" ? null : Number(capacity),
      });
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
