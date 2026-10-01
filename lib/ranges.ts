import type { Busy } from "./slots";

/**
 * 会議の候補（複数可）。1 件は「fromDate〜toDate の毎日 dayStartMin〜dayEndMin」。
 * 日付は日本時間の "YYYY-MM-DD"、時刻は日本時間 0 時からの分。
 * 副作用なしの純関数だけを置く（tests/ranges.test.ts）。
 */
export type CandidateRange = {
  fromDate: string;
  toDate: string;
  dayStartMin: number;
  dayEndMin: number;
};

export const MAX_RANGES = 10;
const MAX_DAYS_PER_RANGE = 31;
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

function midnight(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`);
}

/** 候補の日付（重複なし・昇順）。会議ページの手動入力のマスの列になる */
export function rangeDates(ranges: CandidateRange[]): string[] {
  const dates = new Set<string>();
  for (const r of ranges) {
    for (let t = midnight(r.fromDate); t <= midnight(r.toDate); t += DAY) {
      dates.add(new Date(t + 9 * 60 * MIN).toISOString().slice(0, 10));
    }
  }
  return [...dates].sort();
}

/** 候補を実際の時間帯（UTC ミリ秒）に展開する。重なり・隣り合いはまとめる */
export function rangeIntervals(ranges: CandidateRange[]): Busy[] {
  const spans: Busy[] = [];
  for (const r of ranges) {
    for (let t = midnight(r.fromDate); t <= midnight(r.toDate); t += DAY) {
      spans.push({ start: t + r.dayStartMin * MIN, end: t + r.dayEndMin * MIN });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** その時刻（マスの開始）が候補のどれかに入っているか */
export function inRanges(ranges: CandidateRange[], cellStart: number, cellMin: number): boolean {
  return rangeIntervals(ranges).some((s) => s.start <= cellStart && cellStart + cellMin * MIN <= s.end);
}

/** 「10/3〜10/5・13時〜18時」。1 日だけなら「10/3・13時〜18時」 */
export function rangeLabel(r: CandidateRange): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const hm = (m: number) => (m % 60 === 0 ? `${m / 60}時` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
  const days = r.fromDate === r.toDate ? md(r.fromDate) : `${md(r.fromDate)}〜${md(r.toDate)}`;
  return `${days}・${hm(r.dayStartMin)}〜${hm(r.dayEndMin)}`;
}

/** 保存前の検査。問題があれば日本語の理由、無ければ null */
export function rangesProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return "候補を 1 つ以上入れてください";
  if (value.length > MAX_RANGES) return `候補は ${MAX_RANGES} 件までです`;
  for (const r of value as CandidateRange[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.fromDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(r?.toDate ?? "")) {
      return "候補の日付が正しくありません";
    }
    const days = (midnight(r.toDate) - midnight(r.fromDate)) / DAY + 1;
    if (!(days >= 1 && days <= MAX_DAYS_PER_RANGE)) return "候補の終わりの日は、始まりの日から 31 日以内にしてください";
    if (
      !Number.isInteger(r.dayStartMin) || !Number.isInteger(r.dayEndMin) ||
      r.dayStartMin < 0 || r.dayEndMin > 24 * 60 || r.dayStartMin >= r.dayEndMin ||
      r.dayStartMin % 30 !== 0 || r.dayEndMin % 30 !== 0
    ) {
      return "候補の時間帯が正しくありません";
    }
  }
  return null;
}

/** 候補全体を覆う範囲（古い列 from_date / days / day_start_min / day_end_min に入れる値） */
export function envelope(ranges: CandidateRange[]) {
  const from = ranges.map((r) => r.fromDate).sort()[0];
  const to = ranges.map((r) => r.toDate).sort().at(-1)!;
  return {
    from_date: from,
    days: (midnight(to) - midnight(from)) / DAY + 1,
    day_start_min: Math.min(...ranges.map((r) => r.dayStartMin)),
    day_end_min: Math.max(...ranges.map((r) => r.dayEndMin)),
  };
}

/** 会議の候補。ranges 列が無い（005〜008 のころに作った）会議は古い列から 1 件にする */
export function meetingRanges(m: {
  ranges?: CandidateRange[] | null;
  from_date: string;
  days: number;
  day_start_min: number;
  day_end_min: number;
}): CandidateRange[] {
  if (m.ranges && m.ranges.length > 0) return m.ranges;
  const to = new Date(midnight(m.from_date) + (m.days - 1) * DAY + 9 * 60 * MIN).toISOString().slice(0, 10);
  return [{ fromDate: m.from_date, toDate: to, dayStartMin: m.day_start_min, dayEndMin: m.day_end_min }];
}
