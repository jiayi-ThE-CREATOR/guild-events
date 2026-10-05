import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeetSpace } from "./google";

/**
 * 会議の Google Meet リンク。主催者がマイページでつないだ Google アカウント（meet_hosts）で作る。
 * 主催者がつないでいなければ作れない（null を返す）。
 */

export async function meetHost(
  admin: SupabaseClient,
  member: string,
): Promise<{ email: string; refresh_token: string } | null> {
  const { data, error } = await admin
    .from("meet_hosts")
    .select("email, refresh_token")
    .eq("member_name", member)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** 主催者のアカウントで Meet を作り、会議に保存する。主催者が未連携なら null */
export async function createMeetFor(
  admin: SupabaseClient,
  meeting: { id: string; organizer: string },
): Promise<string | null> {
  const host = await meetHost(admin, meeting.organizer);
  if (!host) return null;
  const url = await createMeetSpace(host.refresh_token);
  const { error } = await admin.from("meetings").update({ meet_url: url }).eq("id", meeting.id);
  if (error) throw new Error(error.message);
  return url;
}
