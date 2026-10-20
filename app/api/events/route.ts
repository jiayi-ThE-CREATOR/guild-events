import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { notifyEventCreated } from "@/lib/server/discord";
import { EVENT_FIELDS } from "@/lib/server/events";
import type { EventRecord, NewEvent } from "@/lib/types";

/** イベントを作る（誰でも）。作ったら Discord に @everyone で流す */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = (await req.json()) as Partial<NewEvent>;
  const title = b.title?.trim();
  if (!title) return Response.json({ error: "イベント名を入れてください" }, { status: 400 });
  if (!b.event_date || Number.isNaN(Date.parse(b.event_date))) {
    return Response.json({ error: "開催日時が正しくありません" }, { status: 400 });
  }
  const capacity = b.capacity ?? null;
  if (capacity !== null && !(Number.isInteger(capacity) && capacity >= 1)) {
    return Response.json({ error: "定員は 1 以上の整数にしてください" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("events")
    .insert({
      title: title.slice(0, 200),
      description: b.description?.trim() || null,
      location: b.location?.trim() || null,
      event_date: new Date(b.event_date).toISOString(),
      capacity,
    })
    .select(EVENT_FIELDS)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const event = data as EventRecord;
  await notifyEventCreated(event, req.nextUrl.origin);
  return Response.json({ event });
}
