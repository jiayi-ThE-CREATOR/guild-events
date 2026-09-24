import type { Busy } from "../slots";

/**
 * Google カレンダー連携。
 *
 * scope は「空き時間」と「カレンダー一覧」だけで、どちらも Google の分類で非機密。
 * 予定の件名や場所は API の側で最初から返ってこない。
 * 非機密 scope だけなので Google の審査が要らず、未確認アプリの警告も出ない。
 */

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // refresh token を毎回もらうため（2 回目以降の連携でも返ってくるように）
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Google token error");
  return json as { access_token: string; refresh_token?: string; id_token?: string };
}

/** 認可コードを refresh token とメールアドレスに換える */
export async function exchangeCode(code: string, redirectUri: string) {
  const token = await tokenRequest({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!token.refresh_token) throw new Error("refresh token が返ってきませんでした");
  // id_token は Google から TLS で直接受け取ったものなので、署名検証は省いて中身だけ読む
  const payload = token.id_token
    ? JSON.parse(Buffer.from(token.id_token.split(".")[1], "base64url").toString())
    : {};
  return {
    refreshToken: token.refresh_token,
    email: (payload.email as string | undefined) ?? "Google カレンダー",
  };
}

/**
 * Google 側の許可を取り消す（Google アカウントの「サードパーティ製のアプリ」から消える）。
 * 既に取り消されている・期限切れの token でも、こちらの削除は続けたいので失敗は握りつぶす。
 */
export async function revokeGoogle(refreshToken: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error(`[calendar] Google の許可の取り消しに失敗: ${(e as Error).message}`);
  }
}

type CalendarListEntry = { id: string; primary?: boolean; accessRole: string };

/**
 * 本人の予定として数えるカレンダー。
 * 自分のカレンダー（owner）と、URL で取り込んだカレンダー（大学の時間割など）だけ。
 * 他人のカレンダーを購読している分や、祝日・誕生日は数えない。
 */
function ownCalendars(items: CalendarListEntry[]): string[] {
  return items
    .filter(
      (c) =>
        c.primary ||
        c.accessRole === "owner" ||
        c.id.endsWith("@import.calendar.google.com"),
    )
    .filter((c) => !c.id.includes("#holiday@") && !c.id.includes("#contacts@"))
    .map((c) => c.id)
    .slice(0, 50);
}

export async function googleBusy(refreshToken: string, from: number, to: number): Promise<Busy[]> {
  const { access_token } = await tokenRequest({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const auth = { Authorization: `Bearer ${access_token}` };

  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=250",
    { headers: auth },
  );
  if (!listRes.ok) throw new Error(`Google カレンダー一覧の取得に失敗（${listRes.status}）`);
  const ids = ownCalendars(((await listRes.json()).items ?? []) as CalendarListEntry[]);
  if (ids.length === 0) ids.push("primary");

  const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: ids.map((id) => ({ id })),
    }),
  });
  if (!fbRes.ok) throw new Error(`Google の空き時間の取得に失敗（${fbRes.status}）`);
  const calendars = (await fbRes.json()).calendars as Record<
    string,
    { busy?: { start: string; end: string }[] }
  >;
  return Object.values(calendars).flatMap((c) =>
    (c.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })),
  );
}

/** 同意画面へ送り出した人と、戻ってきた人を照合する cookie */
export const STATE_COOKIE = "gcal_oauth";
