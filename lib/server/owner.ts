import type { SupabaseClient } from "@supabase/supabase-js";
import { guestKey } from "../guests";
import { isMember } from "../members";
import { guestByToken, type Guest } from "./guests";

/**
 * カレンダー連携などの「誰の分か」を決める。メンバーは名前、ゲストは招待リンクの合言葉で来る。
 * 返す key は calendar_sources などの member_name に入れる値。
 */
export async function resolveOwner(
  admin: SupabaseClient,
  who: { member?: string | null; guest?: string | null },
): Promise<{ key: string; guest: Guest | null } | null> {
  if (who.guest) {
    const guest = await guestByToken(admin, who.guest);
    return guest ? { key: guestKey(guest.id), guest } : null;
  }
  if (who.member && isMember(who.member)) return { key: who.member, guest: null };
  return null;
}
