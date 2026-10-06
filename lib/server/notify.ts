import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuestKey } from "../guests";
import { filesMail, pickEmail } from "../notify-email";
import { sendBcc } from "./mail";

/**
 * 参加者（メンバー名か guest:<id>）ごとのメール通知の宛先。送らない人は入らない。
 * メンバーはマイページの設定（member_notify）が優先。ゲストはつないだカレンダーのメールだけ
 */
export async function notifyEmails(admin: SupabaseClient, keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const [sources, hosts, settings] = await Promise.all([
    admin.from("calendar_sources").select("member_name, label").in("member_name", keys),
    admin.from("meet_hosts").select("member_name, email").in("member_name", keys),
    admin.from("member_notify").select("member_name, notify_email, enabled").in("member_name", keys),
  ]);
  for (const r of [sources, hosts, settings]) if (r.error) throw new Error(r.error.message);

  const result = new Map<string, string>();
  for (const key of keys) {
    const setting = (settings.data ?? []).find((s) => s.member_name === key);
    if (setting && !setting.enabled) continue;
    const labels = [
      ...(sources.data ?? []).filter((s) => s.member_name === key).map((s) => s.label as string),
      ...(isGuestKey(key) ? [] : (hosts.data ?? []).filter((h) => h.member_name === key).map((h) => h.email as string)),
    ];
    const email = pickEmail(labels, setting?.notify_email);
    if (email) result.set(key, email);
  }
  return result;
}

/** 資料が追加されたことを、上げた人と不参加の人以外の参加者にメールで知らせる */
export async function notifyFilesAdded(
  admin: SupabaseClient,
  opts: {
    meeting: { id: string; title: string };
    keys: string[];
    declined: string[];
    uploader: string;
    files: { name: string; size: number }[];
    origin: string;
  },
): Promise<void> {
  const { meeting, keys, declined, uploader, files, origin } = opts;
  const targets = keys.filter((k) => k !== uploader && !declined.includes(k));
  const emails = await notifyEmails(admin, targets);
  const members = targets.filter((k) => !isGuestKey(k)).map((k) => emails.get(k)).filter((e): e is string => !!e);
  const guests = targets.filter(isGuestKey).map((k) => emails.get(k)).filter((e): e is string => !!e);
  // 同じアドレスが両方にいれば、リンク付きのメンバー宛てだけにする
  const guestOnly = guests.filter((g) => !members.includes(g));

  const forMembers = filesMail(meeting.title, uploader, files, `${origin}/schedule/${meeting.id}`);
  const forGuests = filesMail(meeting.title, uploader, files, null);
  await Promise.all([
    sendBcc([...new Set(members)], forMembers.subject, forMembers.text),
    sendBcc([...new Set(guestOnly)], forGuests.subject, forGuests.text),
  ]);
}
