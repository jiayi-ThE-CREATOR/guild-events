/**
 * 日程調整の空き時間探し。副作用なしの純関数だけを置く（tests/slots.test.ts）。
 *
 * 時刻はすべて UTC のミリ秒。「何日の何時」は日本時間で解釈する。
 * JST は夏時間が無いので、UTC に 9 時間足すだけで換算できる。
 *
 * 誰がどの時間に埋まっているかは呼び出し側に返さない。
 * 返すのは「その時間に何人参加できるか」だけ。
 */

export type Busy = { start: number; end: number };

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export type SlotQuery = {
  /** 参加者ごとの予定。キーは名前 */
  busyByMember: Record<string, Busy[]>;
  /** 探し始める日（日本時間の "YYYY-MM-DD"） */
  fromDate: string;
  /** 探す日数（fromDate を含む） */
  days: number;
  /** 会議の長さ（分） */
  durationMin: number;
  /** 1日のうち探す時間帯（日本時間、0時からの分） */
  dayStartMin: number;
  dayEndMin: number;
  /** 開始時刻の刻み（分） */
  stepMin?: number;
  /** これより前に始まる枠は出さない */
  notBefore?: number;
};

/** 連続する候補をまとめた時間帯。この中の durationMin 分ならどこでも取れる */
export type SlotWindow = { start: number; end: number };

export type SlotResult = {
  /** 参加者の人数（A） */
  total: number;
  /** 見つかった枠に参加できる人数。A か A-1、どちらも無ければ null */
  available: number | null;
  windows: SlotWindow[];
};

/** 日本時間の "YYYY-MM-DD" 0:00 を UTC ミリ秒にする */
export function jstMidnight(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
}

function isFree(busy: Busy[], start: number, end: number): boolean {
  return busy.every((b) => b.end <= start || b.start >= end);
}

export function findSlots(q: SlotQuery): SlotResult {
  const members = Object.keys(q.busyByMember);
  const total = members.length;
  const step = (q.stepMin ?? 30) * MINUTE;
  const duration = q.durationMin * MINUTE;

  // 候補ごとの参加可能人数。日をまたいで窓がつながらないよう日ごとに分ける
  const days: { start: number; count: number }[][] = [];
  const firstDay = jstMidnight(q.fromDate);
  for (let i = 0; i < q.days; i++) {
    const midnight = firstDay + i * DAY;
    const candidates: { start: number; count: number }[] = [];
    for (
      let start = midnight + q.dayStartMin * MINUTE;
      start + duration <= midnight + q.dayEndMin * MINUTE;
      start += step
    ) {
      if (q.notBefore !== undefined && start < q.notBefore) continue;
      const count = members.filter((m) =>
        isFree(q.busyByMember[m], start, start + duration),
      ).length;
      candidates.push({ start, count });
    }
    days.push(candidates);
  }

  const best = Math.max(0, ...days.flat().map((c) => c.count));
  // 全員がそろわなければ 1 人欠けまでは許す。それ以上は「見つからない」
  const available =
    total > 0 && best === total
      ? total
      : total > 1 && best === total - 1
        ? total - 1
        : null;
  if (available === null) return { total, available, windows: [] };

  const windows: SlotWindow[] = [];
  for (const candidates of days) {
    let open: SlotWindow | null = null;
    let lastStart = -Infinity;
    for (const c of candidates) {
      if (c.count >= available) {
        if (open && c.start - lastStart === step) {
          open.end = c.start + duration;
        } else {
          open = { start: c.start, end: c.start + duration };
          windows.push(open);
        }
        lastStart = c.start;
      } else {
        open = null;
      }
    }
  }
  return { total, available, windows };
}
