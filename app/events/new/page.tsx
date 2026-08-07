"use client";

import { useRouter } from "next/navigation";
import EventForm from "@/components/EventForm";
import OrganizerGate from "@/components/OrganizerGate";
import PageHeader from "@/components/PageHeader";
import { createEvent } from "@/lib/data";

export default function NewEventPage() {
  const router = useRouter();

  return (
    <OrganizerGate title="イベントを作成">
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title="イベントを作成" />
        <EventForm
          submitLabel="このイベントを作成する"
          busyLabel="作成中…"
          onSubmit={async (values) => {
            const created = await createEvent(values);
            router.replace(`/events/${created.id}`);
          }}
        />
      </div>
    </OrganizerGate>
  );
}
