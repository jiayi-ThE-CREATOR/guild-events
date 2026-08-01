"use client";

import { mockStore } from "./mockStore";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  ApplicationRecord,
  ApplicationWithEvent,
  EventRecord,
  EventWithCount,
  NewApplication,
} from "./types";

/**
 * 画面から DB を触る唯一の入口。
 * Supabase が設定されていれば本番 DB、無ければ localStorage モックに落ちる。
 * 呼び出し側はどちらで動いているかを意識しない。
 */

export { isSupabaseConfigured };

function byDateAsc(a: EventRecord, b: EventRecord) {
  return a.event_date.localeCompare(b.event_date);
}

function countByEvent(rows: { event_id: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  return counts;
}

/** 開催予定のイベント（今日 0:00 以降）を日付昇順で返す */
export async function listUpcomingEvents(): Promise<EventWithCount[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const sb = getSupabase();
  if (sb) {
    const { data: events, error } = await sb
      .from("events")
      .select("id, title, description, location, event_date, capacity")
      .gte("event_date", startOfToday.toISOString())
      .order("event_date", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: apps, error: appsError } = await sb
      .from("applications")
      .select("event_id");
    if (appsError) throw new Error(appsError.message);

    const counts = countByEvent(apps ?? []);
    return (events ?? []).map((e) => ({
      ...(e as EventRecord),
      applied: counts.get(e.id) ?? 0,
    }));
  }

  const counts = countByEvent(mockStore.applications());
  return mockStore
    .events()
    .filter((e) => new Date(e.event_date) >= startOfToday)
    .sort(byDateAsc)
    .map((e) => ({ ...e, applied: counts.get(e.id) ?? 0 }));
}

export async function getEvent(id: string): Promise<EventWithCount | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("events")
      .select("id, title, description, location, event_date, capacity")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const { count, error: countError } = await sb
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    if (countError) throw new Error(countError.message);

    return { ...(data as EventRecord), applied: count ?? 0 };
  }

  const event = mockStore.events().find((e) => e.id === id);
  if (!event) return null;
  const applied = mockStore
    .applications()
    .filter((a) => a.event_id === id).length;
  return { ...event, applied };
}

export async function createApplication(
  input: NewApplication,
): Promise<ApplicationRecord> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("applications")
      .insert({
        event_id: input.event_id,
        name: input.name,
        university: input.university,
        discord: input.discord,
        note: input.note,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ApplicationRecord;
  }
  return mockStore.insert(input);
}

export async function cancelApplication(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("applications").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  mockStore.remove(id);
}

/** 名前で自分の申請を引く（認証なしのため「名前＋大学」が本人識別子） */
export async function listApplicationsByName(
  name: string,
): Promise<ApplicationWithEvent[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("applications")
      .select(
        "id, event_id, name, university, status, discord, note, created_at, events(id, title, description, location, event_date, capacity)",
      )
      .eq("name", trimmed);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const { events, ...application } = row as ApplicationRecord & {
        events: EventRecord | EventRecord[] | null;
      };
      const event = Array.isArray(events) ? (events[0] ?? null) : events;
      return { ...application, event };
    });
  }

  const events = new Map(mockStore.events().map((e) => [e.id, e]));
  return mockStore
    .applications()
    .filter((a) => a.name === trimmed)
    .map((a) => ({ ...a, event: events.get(a.event_id) ?? null }));
}
