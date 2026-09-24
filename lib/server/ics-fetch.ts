/**
 * iPhone などの共有リンクから ICS を取ってくる。
 * webcal:// は https:// に読み替える（iPhone の「リンクを共有」はこの形で出てくる）。
 */

const MAX_BYTES = 5 * 1024 * 1024;

export function normalizeIcsUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "text/calendar" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`カレンダーを読み込めませんでした（${res.status}）`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("カレンダーが大きすぎます");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("カレンダーのリンクではないようです");
  return text;
}
