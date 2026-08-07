"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import EventForm from "@/components/EventForm";
import OrganizerGate from "@/components/OrganizerGate";
import PageHeader from "@/components/PageHeader";
import { getEvent, updateEvent } from "@/lib/data";
import type { EventRecord } from "@/lib/types";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEvent(id)
      .then((found) => {
        if (!alive) return;
        if (found) setEvent(found);
        else setError("このイベントは見つかりませんでした");
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <OrganizerGate title="イベントを編集">
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title="イベントを編集" />

        {error && (
          <p className="text-amber bg-amber-soft m-4 rounded-xl p-3 text-xs md:mx-0">
            {error}
          </p>
        )}

        {!event && !error && (
          <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
        )}

        {event && (
          <EventForm
            initial={event}
            submitLabel="変更を保存する"
            busyLabel="保存中…"
            onSubmit={async (values) => {
              await updateEvent(event.id, values);
              router.replace(`/events/${event.id}`);
            }}
          />
        )}
      </div>
    </OrganizerGate>
  );
}
