import { XMLParser } from "fast-xml-parser";
import { busyFromIcs } from "../ics.ts";
import type { Busy } from "../slots";

/**
 * CalDAV でカレンダーを読む（Lark など。Lark は「設定 → カレンダー → CalDAV 同期」で
 * サーバー・ユーザー名・専用パスワードを発行できる）。
 *
 * 1. サーバーの URL から本人（principal）→ カレンダーの置き場（calendar-home-set）を探す
 * 2. 置き場の中のカレンダー（予定 VEVENT を持てるもの）を全部挙げる
 * 3. 各カレンダーに期間を指定して予定を問い合わせ（calendar-query）、返ってきた ICS を
 *    lib/ics.ts で「埋まっている時間」にする。件名などはそこで捨てる
 *
 * XML の読み取りは純関数にして tests/caldav.test.ts で確かめている。
 */

export type CaldavCreds = { url: string; username: string; password: string };

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => ["response", "propstat", "comp"].includes(name),
});

type Props = Record<string, unknown>;
export type DavResponse = { href: string; props: Props };

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) return String((v as Record<string, unknown>)["#text"]);
  return "";
}

/** 207 Multi-Status を「href と、200 で返ってきたプロパティ」の並びにする */
export function parseMultistatus(xml: string): DavResponse[] {
  const root = parser.parse(xml)?.multistatus;
  const responses = (root?.response ?? []) as Record<string, unknown>[];
  return responses.map((r) => {
    const props: Props = {};
    for (const ps of (r.propstat ?? []) as Record<string, unknown>[]) {
      if (!/\s200\s/.test(` ${text(ps.status)} `)) continue;
      Object.assign(props, (ps.prop ?? {}) as Props);
    }
    return { href: text(r.href).trim(), props };
  });
}

/** <d:href> を 1 つ持つプロパティ（current-user-principal・calendar-home-set）の中身 */
export function hrefProp(responses: DavResponse[], name: string): string | null {
  for (const r of responses) {
    const v = r.props[name];
    if (v && typeof v === "object" && "href" in v) {
      const href = (v as Record<string, unknown>).href;
      return text(Array.isArray(href) ? href[0] : href).trim() || null;
    }
  }
  return null;
}

/** 置き場の一覧から、予定（VEVENT）を入れられるカレンダーだけを返す */
export function calendarsFrom(responses: DavResponse[]): { href: string; name: string }[] {
  return responses
    .filter((r) => {
      const type = r.props.resourcetype;
      if (!type || typeof type !== "object" || !("calendar" in type)) return false;
      const set = r.props["supported-calendar-component-set"] as Record<string, unknown> | undefined;
      const comps = (set?.comp ?? []) as Record<string, unknown>[];
      // 宣言が無ければ予定も入れられるものとみなす
      return comps.length === 0 || comps.some((c) => c["@_name"] === "VEVENT");
    })
    .map((r) => ({ href: r.href, name: text(r.props.displayname).trim() }));
}

/** calendar-query の結果から ICS 本文を取り出す */
export function icsTexts(responses: DavResponse[]): string[] {
  return responses.map((r) => text(r.props["calendar-data"])).filter((t) => t.includes("BEGIN:VCALENDAR"));
}

function utcStamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 入力されたサーバー（ホスト名だけでも可）を https の URL にする */
export function normalizeServer(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    // 手元の確認用サーバー（http://localhost）だけは http を許す
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function dav(
  creds: CaldavCreds,
  method: string,
  url: string,
  depth: "0" | "1",
  body: string,
): Promise<{ responses: DavResponse[]; url: string }> {
  const auth = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
  let target = url;
  // リダイレクトは自分で追う（fetch に任せると別ホストへ移るとき認証ヘッダーが落ちるため）
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(target, {
      method,
      headers: { Authorization: auth, Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      target = new URL(location, target).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("CalDAV のユーザー名かパスワードが違います");
    }
    if (res.status !== 207 && !res.ok) throw new Error(`CalDAV の ${method} に失敗（${res.status}）`);
    return { responses: parseMultistatus(await res.text()), url: target };
  }
  throw new Error("CalDAV のリダイレクトが多すぎます");
}

const PROPFIND = (props: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`;

/** そのアカウントのカレンダー（予定を入れられるもの）を探す */
export async function discoverCalendars(creds: CaldavCreds): Promise<{ href: string; name: string }[]> {
  // 本人の principal。サーバーの URL そのもの → /.well-known/caldav の順に試す
  let principal: string | null = null;
  let base = creds.url;
  for (const candidate of [creds.url, new URL("/.well-known/caldav", creds.url).toString()]) {
    try {
      const r = await dav(creds, "PROPFIND", candidate, "0", PROPFIND("<d:current-user-principal/>"));
      principal = hrefProp(r.responses, "current-user-principal");
      base = r.url;
      if (principal) break;
    } catch (e) {
      if ((e as Error).message.includes("パスワード")) throw e;
    }
  }
  const principalUrl = principal ? new URL(principal, base).toString() : creds.url;

  const homeRes = await dav(creds, "PROPFIND", principalUrl, "0", PROPFIND("<c:calendar-home-set/>"));
  const home = hrefProp(homeRes.responses, "calendar-home-set");
  const homeUrl = home ? new URL(home, homeRes.url).toString() : principalUrl;

  const list = await dav(
    creds,
    "PROPFIND",
    homeUrl,
    "1",
    PROPFIND("<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/>"),
  );
  return calendarsFrom(list.responses).map((c) => ({ ...c, href: new URL(c.href, list.url).toString() }));
}

/** 期間内の「埋まっている時間」。全カレンダーぶんをまとめて返す */
export async function caldavBusy(creds: CaldavCreds, from: number, to: number): Promise<Busy[]> {
  const calendars = await discoverCalendars(creds);
  const query = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${utcStamp(from)}" end="${utcStamp(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const lists = await Promise.all(
    calendars.map(async (c) => {
      const r = await dav(creds, "REPORT", c.href, "1", query);
      return icsTexts(r.responses).flatMap((ics) => busyFromIcs(ics, from, to));
    }),
  );
  return lists.flat();
}
