import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用の Supabase クライアント（secret key で RLS を越える）。
 * calendar_sources はブラウザから一切触れないテーブルなので、ここ経由でしか読めない。
 * app/api/ の Route Handler 以外から import しないこと。
 */

let cached: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  if (!cached) {
    cached = createClient(url, secret, { auth: { persistSession: false } });
  }
  return cached;
}

export const NOT_CONFIGURED =
  "カレンダー連携はまだ設定されていません（運営に連絡してください）";

export type CalendarSource = {
  id: string;
  member_name: string;
  provider: "google" | "microsoft" | "ics";
  label: string;
  secret: string;
};
