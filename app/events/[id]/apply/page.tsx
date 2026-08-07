"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NameSelect from "@/components/NameSelect";
import PageHeader from "@/components/PageHeader";
import { createApplication, getEvent } from "@/lib/data";
import { fullDateTime, shortLocation } from "@/lib/format";
import { loadProfile, saveProfile } from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";
import {
  UNIVERSITIES,
  type EventWithCount,
  type University,
} from "@/lib/types";

export default function ApplyPage() {
  const { id } = useParams<{ id: string }>();
  const isClient = useIsClient();

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHeader title="参加申請" />
      {isClient ? (
        <ApplyForm eventId={id} />
      ) : (
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      )}
    </div>
  );
}

/**
 * ハイドレーション後にだけマウントされるので、
 * 前回入力（localStorage）を初期値としてそのまま使える。
 */
function ApplyForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [profile] = useState(() => loadProfile());

  const [event, setEvent] = useState<EventWithCount | null>(null);
  const [name, setName] = useState(profile?.name ?? "");
  const [university, setUniversity] = useState<University>(
    profile?.university ?? "阪大",
  );
  const [discord, setDiscord] = useState(profile?.discord ?? "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEvent(eventId)
      .then((found) => alive && setEvent(found))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await createApplication({
        event_id: eventId,
        name: name.trim(),
        university,
        discord: discord.trim() || null,
        note: note.trim() || null,
      });
      saveProfile({
        name: name.trim(),
        university,
        discord: discord.trim() || null,
      });
      router.replace("/mypage");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-line space-y-5 px-4 pt-4 md:rounded-2xl md:border md:bg-white md:p-8"
    >
      {event && (
        <div className="border-line flex items-center gap-3 rounded-2xl border p-3">
          <div
            className="cover-stripes h-12 w-12 shrink-0 rounded-lg"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-bold">{event.title}</p>
            <p className="text-ink-soft mt-0.5 text-xs">
              {fullDateTime(event.event_date)}
              <span className="mx-1.5">・</span>
              {shortLocation(event.location)}
            </p>
          </div>
        </div>
      )}

      <Field label="お名前" htmlFor="name" required>
        <NameSelect id="name" value={name} onChange={setName} />
      </Field>

      <Field label="所属" required>
        <div role="group" aria-label="所属" className="grid grid-cols-3 gap-2">
          {UNIVERSITIES.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUniversity(u)}
              aria-pressed={university === u}
              className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                university === u
                  ? "bg-navy text-white"
                  : "border-line text-ink-soft border bg-white"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Discord名" htmlFor="discord">
        <input
          id="discord"
          type="text"
          value={discord}
          onChange={(e) => setDiscord(e.target.value)}
          placeholder="taro_yamada"
          className="border-line focus:border-navy text-ink w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
        />
      </Field>

      <Field label="ひとこと" hint="任意" htmlFor="note">
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="当日つくりたいものなど"
          className="border-line focus:border-navy text-ink w-full resize-none rounded-xl border px-3.5 py-3 text-[15px] outline-none"
        />
      </Field>

      {error && (
        <p className="text-amber bg-amber-soft rounded-xl p-3 text-xs">
          申請できませんでした：{error}
        </p>
      )}

      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="bg-grass w-full rounded-xl py-3.5 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(0,179,126,0.35)] disabled:opacity-40 disabled:shadow-none"
      >
        {submitting ? "送信中…" : "この内容で申請する"}
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
