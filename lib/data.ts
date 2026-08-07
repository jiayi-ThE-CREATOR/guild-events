"use client";

import { remainingSeats } from "./format";
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
 *
 * キャンセルは行を消さず status='cancelled' にするので、
 * 「有効な申請」を数えるところは必ず cancelled を除く。
 */

export { isSupabaseConfigured };

const ACTIVE = ["applied", "attended"];

export const FULL_MESSAGE = "満席のため申請できません";
export const DUPLICATE_MESSAGE = "このイベントにはすでに申請済みです";

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

function activeApplications(): ApplicationRecord[] {
  return mockStore.applications().filter((a) => a.status !== "cancelled");
}

/** イベントを日付昇順で全件返す。これから／終了の振り分けは画面側で行う */
export async function listEvents(): Promise<EventWithCount[]> {
  const sb = getSupabase();
  if (sb) {
    const { data: events, error } = await sb
      .from("events")
      .select("id, title, description, location, event_date, capacity")
      .order("event_date", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: apps, error: appsError } = await sb
      .from("applications")
      .select("event_id")
      .in("event_id", (events ?? []).map((e) => e.id))
      .in("status", ACTIVE);
    if (appsError) throw new Error(appsError.message);

    const counts = countByEvent(apps ?? []);
    return (events ?? []).map((e) => ({
      ...(e as EventRecord),
      applied: counts.get(e.id) ?? 0,
    }));
  }

  const counts = countByEvent(activeApplications());
  return mockStore
    .events()
    .slice()
    .sort(byDateAsc)
    .map((e) => ({ ...e, applied: counts.get(e.id) ?? 0 }));
}

/** そのイベントが既に終了しているか（当日中は「これから」に残す） */
export function isPast(event: { event_date: string }): boolean {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(event.event_date) < startOfToday;
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
      .eq("event_id", id)
      .in("status", ACTIVE);
    if (countError) throw new Error(countError.message);

    return { ...(data as EventRecord), applied: count ?? 0 };
  }

  const event = mockStore.events().find((e) => e.id === id);
  if (!event) return null;
  const applied = activeApplications().filter((a) => a.event_id === id).length;
  return { ...event, applied };
}

/** そのイベントに申請している人（キャンセル済みは除く）を申請順に返す */
export async function listApplicantsByEvent(
  eventId: string,
): Promise<ApplicationRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("applications")
      .select(
        "id, event_id, name, university, status, discord, note, created_at",
      )
      .eq("event_id", eventId)
      .in("status", ACTIVE)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ApplicationRecord[];
  }

  return activeApplications()
    .filter((a) => a.event_id === eventId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * 定員と二重申請を弾いてから登録する。
 * ここでの検査は「押す前に気づかせる」ためのもので、同時申請の競合までは防げない。
 * 最後の砦は DB 側（unique index と capacity トリガー / supabase/schema.sql）。
 */
export async function createApplication(
  input: NewApplication,
): Promise<ApplicationRecord> {
  const event = await getEvent(input.event_id);
  if (!event) throw new Error("イベントが見つかりません");

  const remaining = remainingSeats(event.capacity, event.applied);
  if (remaining !== null && remaining <= 0) throw new Error(FULL_MESSAGE);

  const mine = await listApplicationsByName(input.name);
  if (mine.some((a) => a.event_id === input.event_id)) {
    throw new Error(DUPLICATE_MESSAGE);
  }

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
    if (error) {
      // 23505＝unique 制約違反。トリガーの満席例外は message にそのまま入る
      if (error.code === "23505") throw new Error(DUPLICATE_MESSAGE);
      throw new Error(error.message);
    }
    return data as ApplicationRecord;
  }
  return mockStore.insert(input);
}

/** 行は消さず status='cancelled' にする（運営に履歴を残す） */
export async function cancelApplication(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from("applications")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  mockStore.cancel(id);
}

/** 名前で自分の有効な申請を引く（認証なしのため「名前＋大学」が本人識別子） */
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
      .eq("name", trimmed)
      .in("status", ACTIVE);
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
  return activeApplications()
    .filter((a) => a.name === trimmed)
    .map((a) => ({ ...a, event: events.get(a.event_id) ?? null }));
}
