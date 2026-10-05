import type { EventRecord } from "./types";

/**
 * events に終了時刻の列が無いので、カレンダー登録では既定の所要時間を足す。
 * 実際の終了時刻を持たせるなら events に end_date を追加してここを差し替える。
 */
export const DEFAULT_DURATION_HOURS = 2;

/**
 * カレンダーに登録できるもの。会議のように長さが決まっていれば duration_min を渡す。
 * tentative は日時がまだ決まっていない会議の候補。件名に【仮】を付け、「予定なし（空き）」で
 * 入れる。予定ありで入れると、カレンダー連携している本人がその時間に埋まって見え、
 * その候補が自分の予定で消えてしまうため
 */
export type CalendarItem = Pick<
  EventRecord,
  "id" | "title" | "description" | "location" | "event_date"
> & { duration_min?: number; tentative?: boolean };

const TENTATIVE_NOTE = "まだ決まっていない候補の時間です。結果発表のあと、決まった日時を確かめてください。";

function title(event: CalendarItem) {
  return event.tentative ? `【仮】${event.title}` : event.title;
}

function startEnd(event: CalendarItem) {
  const start = new Date(event.event_date);
  const minutes = event.duration_min ?? DEFAULT_DURATION_HOURS * 60;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  return { start, end };
}

/** 20260808T040000Z 形式（Google / iCal 用） */
function utcCompact(d: Date) {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function details(event: CalendarItem) {
  const text = event.description ?? "";
  return event.tentative ? [TENTATIVE_NOTE, text].filter(Boolean).join("\n\n") : text;
}

export function googleCalendarUrl(event: CalendarItem): string {
  const { start, end } = startEnd(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title(event),
    dates: `${utcCompact(start)}/${utcCompact(end)}`,
    details: details(event),
    location: event.location ?? "",
  });
  // trp=false で「予定なし（空き）」として入る
  if (event.tentative) params.set("trp", "false");
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookUrl(host: string, event: CalendarItem): string {
  const { start, end } = startEnd(event);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title(event),
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    location: event.location ?? "",
    body: details(event),
  });
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
}

/** 個人の Microsoft アカウント */
export function outlookLiveUrl(event: CalendarItem): string {
  return outlookUrl("outlook.live.com", event);
}

/** 組織アカウント（Office365） */
export function outlookOffice365Url(event: CalendarItem): string {
  return outlookUrl("outlook.office.com", event);
}

/** ics のテキスト値はカンマ・セミコロン・改行をエスケープする必要がある */
function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[,;]/g, (m) => `\\${m}`)
    .replace(/\r?\n/g, "\\n");
}

export function icsContent(event: CalendarItem): string {
  const { start, end } = startEnd(event);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GUILD//events//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@guild-events`,
    `DTSTAMP:${utcCompact(new Date())}`,
    `DTSTART:${utcCompact(start)}`,
    `DTEND:${utcCompact(end)}`,
    `SUMMARY:${escapeIcs(title(event))}`,
    `DESCRIPTION:${escapeIcs(details(event))}`,
    `LOCATION:${escapeIcs(event.location ?? "")}`,
    ...(event.tentative ? ["STATUS:TENTATIVE", "TRANSP:TRANSPARENT"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** ics をその場で生成してダウンロードさせる（サーバー不要） */
export function downloadIcs(event: CalendarItem) {
  const blob = new Blob([icsContent(event)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title(event).replace(/[/\\?%*:|"<>]/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 「カレンダーに追加 ▾」の中身。仮の候補では Outlook を出さない（リンクで「空き」を指定できない）。
 * Outlook の人は .ics を開けば空きのまま入る
 */
export function calendarMenu(event: CalendarItem): { label: string; href?: string; onClick?: () => void }[] {
  if (event.tentative) {
    return [
      { label: "Google カレンダー", href: googleCalendarUrl(event) },
      { label: "iPhone・Mac・Outlook（.ics）", onClick: () => downloadIcs(event) },
    ];
  }
  return [
    { label: "Google カレンダー", href: googleCalendarUrl(event) },
    { label: "iPhone・Mac（.ics）", onClick: () => downloadIcs(event) },
    { label: "Outlook（個人）", href: outlookLiveUrl(event) },
    { label: "Outlook（Office365）", href: outlookOffice365Url(event) },
  ];
}

/** Google Meet のリンクがあれば、場所（空いていれば）と説明の先頭に入れる */
export function withMeet(item: CalendarItem, meetUrl: string | null | undefined): CalendarItem {
  if (!meetUrl) return item;
  return {
    ...item,
    location: item.location || meetUrl,
    description: [`Google Meet：${meetUrl}`, item.description].filter(Boolean).join("\n\n"),
  };
}
