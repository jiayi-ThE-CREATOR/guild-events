"use client";

import { useRouter } from "next/navigation";
import EventForm from "@/components/EventForm";
import PageHeader from "@/components/PageHeader";
import { createEvent, isSupabaseConfigured } from "@/lib/data";
import { useIsClient } from "@/lib/useIsClient";

export default function NewEventPage() {
  const router = useRouter();
  // 主催者・参加者の既定値をこの端末の登録から入れるので、描画はクライアントだけ
  const isClient = useIsClient();

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHeader title="イベントを作成" />
      {isClient ? (
        <EventForm
          submitLabel="このイベントを作成する"
          busyLabel="作成中…"
          allowSchedule
          onSubmit={async (values, schedule) => {
            if (!schedule) {
              const created = await createEvent(values);
              router.replace(`/events/${created.id}`);
              return;
            }
            if (!isSupabaseConfigured) throw new Error("日程調整は本番 DB につないだときだけ使えます");
            // 日程調整は会議の仕組みを使う。サーバーがイベント（日程調整中）と会議を一緒に作る
            const res = await fetch("/api/meetings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: values.title,
                description: values.description,
                location: values.location,
                ...schedule,
                event: { capacity: values.capacity },
              }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            router.replace(`/events/${json.eventId}`);
          }}
        />
      ) : (
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      )}
    </div>
  );
}
