import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guestKey, guestLabel } from "../guests";
import type { CalendarSource } from "./admin";
import { revokeGoogle } from "./google";

export type Guest = { id: string; meeting_id: string; name: string; created_at: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 招待リンクの合言葉。推測できない長さにする */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function guestsOf(admin: SupabaseClient, meetingId: string): Promise<Guest[]> {
  const { data, error } = await admin
    .from("meeting_guests")
    .select("id, meeting_id, name, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Guest[];
}

export async function guestByToken(admin: SupabaseClient, token: string): Promise<Guest | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data, error } = await admin
    .from("meeting_guests")
    .select("id, meeting_id, name, created_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Guest | null) ?? null;
}

/** ゲストのキー → 表示名 */
export function guestLabels(guests: Guest[]): Record<string, string> {
  return Object.fromEntries(guests.map((g) => [guestKey(g.id), guestLabel(g.name)]));
}

/** 会議の参加者（メンバー名＋ゲストのキー）と表示名 */
export async function meetingMembers(
  admin: SupabaseClient,
  meeting: { id: string; participants: string[] },
): Promise<{ keys: string[]; labels: Record<string, string>; guests: Guest[] }> {
  const guests = await guestsOf(admin, meeting.id);
  return {
    keys: [...meeting.participants, ...guests.map((g) => guestKey(g.id))],
    labels: guestLabels(guests),
    guests,
  };
}

/** ゲストを消す。予定・不参加・参加登録・カレンダー連携（Google は許可も取り消す）も消す */
export async function removeGuest(admin: SupabaseClient, guest: Guest): Promise<void> {
  const key = guestKey(guest.id);
  const { data: sources } = await admin
    .from("calendar_sources")
    .select("provider, secret")
    .eq("member_name", key);
  await Promise.all(
    ((sources ?? []) as Pick<CalendarSource, "provider" | "secret">[])
      .filter((s) => s.provider === "google")
      .map((s) => revokeGoogle(s.secret)),
  );
  await Promise.all([
    admin.from("calendar_sources").delete().eq("member_name", key),
    admin.from("meeting_entries").delete().eq("member_name", key),
    admin.from("meeting_declines").delete().eq("member_name", key),
    admin.from("meeting_rsvps").delete().eq("member_name", key),
  ]);
  const { error } = await admin.from("meeting_guests").delete().eq("id", guest.id);
  if (error) throw new Error(error.message);
}
