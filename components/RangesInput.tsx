"use client";

import { MAX_RANGES, type CandidateRange } from "@/lib/ranges";

/**
 * 会議の候補（複数）の入力欄。会議の作成と、募集の延長で共用。
 * 1 件は「何日〜何日の毎日何時〜何時」。時刻は 1 時間刻み。
 */

export type RangeRow = { fromDate: string; toDate: string; startHour: number; endHour: number };

const HOURS = Array.from({ length: 25 }, (_, h) => h);

/** 日本時間で今日から n 日後の "YYYY-MM-DD" */
export function jstDate(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
}

export function toCandidateRanges(rows: RangeRow[]): CandidateRange[] {
  return rows.map((r) => ({
    fromDate: r.fromDate,
    toDate: r.toDate,
    dayStartMin: r.startHour * 60,
    dayEndMin: r.endHour * 60,
  }));
}

export function fromCandidateRanges(ranges: CandidateRange[]): RangeRow[] {
  return ranges.map((r) => ({
    fromDate: r.fromDate,
    toDate: r.toDate,
    startHour: Math.floor(r.dayStartMin / 60),
    endHour: Math.ceil(r.dayEndMin / 60),
  }));
}

export function rangesReady(rows: RangeRow[]): boolean {
  return rows.every((r) => r.fromDate && r.toDate >= r.fromDate && r.startHour < r.endHour);
}

export default function RangesInput({
  ranges,
  onChange,
  field,
}: {
  ranges: RangeRow[];
  onChange: (rows: RangeRow[]) => void;
  /** 入力欄の見た目（呼び出し側のフォームに合わせる） */
  field: string;
}) {
  return (
    <>
      <ul className="space-y-2">
        {ranges.map((r, i) => {
          const set = (patch: Partial<RangeRow>) =>
            onChange(ranges.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <li key={i} className="border-line rounded-lg border bg-white p-2">
              <div className="flex items-center gap-1.5">
                <input aria-label={`候補${i + 1} いつから`} type="date" value={r.fromDate} min={jstDate(0)} onChange={(e) => set({ fromDate: e.target.value, toDate: r.toDate < e.target.value ? e.target.value : r.toDate })} className={`${field} min-w-0 flex-1`} required />
                <span className="text-ink-soft text-xs">〜</span>
                <input aria-label={`候補${i + 1} いつまで`} type="date" value={r.toDate} min={r.fromDate} onChange={(e) => set({ toDate: e.target.value })} className={`${field} min-w-0 flex-1`} required />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <select aria-label={`候補${i + 1} 何時から`} value={r.startHour} onChange={(e) => set({ startHour: Number(e.target.value) })} className={`${field} min-w-0 flex-1`}>
                  {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{h}時</option>)}
                </select>
                <span className="text-ink-soft text-xs">〜</span>
                <select aria-label={`候補${i + 1} 何時まで`} value={r.endHour} onChange={(e) => set({ endHour: Number(e.target.value) })} className={`${field} min-w-0 flex-1`}>
                  {HOURS.slice(1).map((h) => <option key={h} value={h}>{h}時</option>)}
                </select>
                {ranges.length > 1 && (
                  <button type="button" aria-label={`候補${i + 1}を消す`} onClick={() => onChange(ranges.filter((_, j) => j !== i))} className="text-ink-soft shrink-0 px-2 text-lg leading-none">
                    ×
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {ranges.length < MAX_RANGES && (
        <button
          type="button"
          onClick={() => onChange([...ranges, { ...ranges[ranges.length - 1] }])}
          className="text-navy mt-1.5 text-[13px] font-semibold hover:underline"
        >
          ＋ 候補を追加
        </button>
      )}
    </>
  );
}
