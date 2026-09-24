import ICAL from "ical.js";
import type { Busy } from "./slots";

/**
 * ICS（iCalendar）の本文から、指定期間の「埋まっている時間」だけを取り出す。
 * 予定の件名・場所などは読み捨てる。
 *
 * - 繰り返し予定（毎週の授業など）は RRULE を展開し、EXDATE と
 *   個別に動かした回（RECURRENCE-ID）も反映する
 * - 終日予定は数えない（Google の freeBusy と同じく、祝日や誕生日で
 *   一日中埋まってしまうのを避けるため）
 * - 「予定なし（TRANSP:TRANSPARENT）」とキャンセル済みも数えない
 * - タイムゾーン指定の無い時刻は日本時間として扱う
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 古い毎日の繰り返しでも回りきれる上限。これを超えたら打ち切る */
const MAX_OCCURRENCES = 20000;

function toMs(t: ICAL.Time): number {
  const tzid = t.zone?.tzid;
  if (!tzid || tzid === "floating") {
    return (
      Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) -
      JST_OFFSET_MS
    );
  }
  return t.toUnixTime() * 1000;
}

function counts(event: ICAL.Event): boolean {
  const c = event.component;
  if (c.getFirstPropertyValue("status") === "CANCELLED") return false;
  if (c.getFirstPropertyValue("transp") === "TRANSPARENT") return false;
  return !event.startDate?.isDate;
}

/** カレンダー名（X-WR-CALNAME）。無ければ null */
export function calendarName(text: string): string | null {
  const root = new ICAL.Component(ICAL.parse(text));
  const name = root.getFirstPropertyValue("x-wr-calname");
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function busyFromIcs(text: string, from: number, to: number): Busy[] {
  const root = new ICAL.Component(ICAL.parse(text));

  // 時刻の値は読んだ時点で解釈されるので、先にタイムゾーンを登録しておく
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(vtz);
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  const singles: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) exceptions.push(event);
    else if (event.isRecurring()) masters.set(event.uid, event);
    else singles.push(event);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    // 親の無い例外回は単発の予定として扱う
    if (master) master.relateException(ex);
    else singles.push(ex);
  }

  const busy: Busy[] = [];
  const push = (start: number, end: number) => {
    if (end > from && start < to) busy.push({ start, end });
  };

  for (const event of singles) {
    if (!counts(event)) continue;
    push(toMs(event.startDate), toMs(event.endDate));
  }

  for (const master of masters.values()) {
    const it = master.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      if (toMs(next) >= to) break;
      const detail = master.getOccurrenceDetails(next);
      // 動かされた回は動かした先の内容（時間・予定なし設定など）で判定する
      if (!counts(detail.item)) continue;
      push(toMs(detail.startDate), toMs(detail.endDate));
    }
  }

  return busy.sort((a, b) => a.start - b.start);
}
