import type { EventRecord } from "./types";

/**
 * events に終了時刻の列が無いので、カレンダー登録では既定の所要時間を足す。
 * 実際の終了時刻を持たせるなら events に end_date を追加してここを差し替える。
 */
export const DEFAULT_DURATION_HOURS = 2;

/** カレンダーに登録できるもの。会議のように長さが決まっていれば duration_min を渡す */
export type CalendarItem = Pick<
  EventRecord,
  "id" | "title" | "description" | "location" | "event_date"
> & { duration_min?: number };

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
  return event.description ?? "";
}

export function googleCalendarUrl(event: CalendarItem): string {
  const { start, end } = startEnd(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcCompact(start)}/${utcCompact(end)}`,
    details: details(event),
    location: event.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookUrl(host: string, event: CalendarItem): string {
  const { start, end } = startEnd(event);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
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
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(details(event))}`,
    `LOCATION:${escapeIcs(event.location ?? "")}`,
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
  a.download = `${event.title.replace(/[/\\?%*:|"<>]/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
