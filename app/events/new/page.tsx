"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { createEvent } from "@/lib/data";
import { ORGANIZERS, isOrganizer } from "@/lib/members";
import { useProfile } from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";
import Link from "next/link";
import { composeLocation } from "@/lib/format";
import { VENUES, type Venue } from "@/lib/types";

export default function NewEventPage() {
  const isClient = useIsClient();
  const profile = useProfile();

  if (!isClient) {
    return (
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title="イベントを作成" />
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      </div>
    );
  }

  if (!isOrganizer(profile?.name)) {
    return (
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title="イベントを作成" />
        <div className="border-line mx-4 rounded-2xl border border-dashed p-6 text-center md:mx-0 md:p-8">
          <p className="text-ink text-sm font-bold">
            イベントを作成できるのは運営だけです
          </p>
          <p className="text-ink-soft mt-2 text-xs leading-relaxed">
            現在の作成担当：{ORGANIZERS.join("・")}
            <br />
            {profile
              ? `この端末は「${profile.name}」として登録されています。`
              : "この端末はまだ登録されていません。"}
            <br />
            運営の方は{" "}
            <Link href="/mypage" className="text-navy underline">
              マイページ
            </Link>{" "}
            で自分の名前を選んでから開いてください。
          </p>
        </div>
      </div>
    );
  }

  return <NewEventForm />;
}

function NewEventForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState<Venue | "">("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = title.trim() !== "" && venue !== "" && date !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createEvent({
        title: title.trim(),
        description: description.trim() || null,
        location: composeLocation(venue, detail),
        // datetime-local はローカル時刻。Date に通して ISO（UTC）に直す
        event_date: new Date(date).toISOString(),
        capacity: capacity.trim() === "" ? null : Number(capacity),
      });
      router.replace(`/events/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHeader title="イベントを作成" />

      <form
        onSubmit={handleSubmit}
        className="border-line space-y-5 px-4 pt-4 md:rounded-2xl md:border md:bg-white md:p-8"
      >
        <Field label="イベント名" htmlFor="title" required>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="GUILD勉強会 #2"
            className="border-line focus:border-navy text-ink w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
          />
        </Field>

        <Field label="開催日時" htmlFor="date" required>
          <input
            id="date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="border-line focus:border-navy text-ink w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
          />
        </Field>

        <Field label="場所" required>
          <div
            role="group"
            aria-label="場所"
            className="grid grid-cols-3 gap-2"
          >
            {VENUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVenue(v)}
                aria-pressed={venue === v}
                className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  venue === v
                    ? "bg-navy text-white"
                    : "border-line text-ink-soft border bg-white"
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
            className="border-line focus:border-navy text-ink mt-2 w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
          />
          {venue !== "" && (
            <p className="text-ink-soft mt-1.5 text-[11px]">
              表示される場所：{composeLocation(venue, detail)}
            </p>
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
            className="border-line focus:border-navy text-ink w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
          />
          <p className="text-ink-soft mt-1.5 text-[11px]">
            空欄にすると定員なし。埋まると自動で申請を締め切ります。
          </p>
        </Field>

        <Field label="説明" hint="任意" htmlFor="description">
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="当日やること、持ち物など"
            className="border-line focus:border-navy text-ink w-full resize-none rounded-xl border px-3.5 py-3 text-[15px] outline-none"
          />
        </Field>

        {error && (
          <p className="text-amber bg-amber-soft rounded-xl p-3 text-xs">
            作成できませんでした：{error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready || submitting}
          className="bg-grass w-full rounded-xl py-3.5 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(0,179,126,0.35)] disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? "作成中…" : "このイベントを作成する"}
        </button>
      </form>
    </div>
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
      {required && <span className="text-amber ml-1">*</span>}
    </>
  );

  return (
    <div>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="text-ink mb-1.5 block text-xs font-semibold"
        >
          {text}
        </label>
      ) : (
        <p className="text-ink mb-1.5 text-xs font-semibold">{text}</p>
      )}
      {children}
    </div>
  );
}
