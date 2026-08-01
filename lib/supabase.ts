import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_* はビルド時に静的置換されるため、必ず直接参照する
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** .env.local に 2 つの値が入っていれば本番 DB、無ければモックで動く */
export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!cached) cached = createClient(url, anonKey);
  return cached;
}
