import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRecord } from "../types";

/** イベントまわりのサーバー側の共通処理（参加・資料の API が使う） */

export const EVENT_FIELDS = "id, title, description, location, address, event_date, capacity, date_status, schedule_deadline";

export async function eventOf(admin: SupabaseClient, id: string): Promise<EventRecord | null> {
  const { data, error } = await admin.from("events").select(EVENT_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as EventRecord | null;
}

/** 参加している人（申請中・出席済）の名前を申請順に */
export async function attendeesOf(admin: SupabaseClient, eventId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("applications")
    .select("name")
    .eq("event_id", eventId)
    .in("status", ["applied", "attended"])
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name as string);
}

/**
 * 終わったイベントか。画面側の isPast（lib/data.ts）と同じく開催日だけで見て、当日中は終わっていない扱い。
 * サーバーは UTC で動くので、日本時間の今日の 0:00 と比べる
 */
export function isPastJst(eventDate: string, now = Date.now()): boolean {
  const JST = 9 * 60 * 60 * 1000;
  const today = new Date(now + JST);
  today.setUTCHours(0, 0, 0, 0);
  return Date.parse(eventDate) < today.getTime() - JST;
}
