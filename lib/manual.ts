import type { Busy } from "./slots";

/**
 * 手動で入れた予定と、外部カレンダーの予定を 30 分のマスごとに合成する。
 * 副作用なしの純関数だけを置く（tests/manual.test.ts）。
 *
 * 手動の予定は 2 層ある：
 * - 毎週の予定（マイページ）: キーは "曜日-分"（曜日は日本時間の 0=日〜6=土、分は 0 時からの分）
 * - この会議の予定（会議ページ）: キーはマスの開始時刻（UTC ミリ秒）の文字列
 *
 * 1 マスごとの判定（上が優先）：
 *   この会議の予定 → この会議で「空いている以外は予定あり」→ 毎週の予定
 *   → 毎週で「空いている以外は予定あり」→ 外部カレンダー → 何も無ければ空いている
 */

export const CELL_MIN = 30;
const CELL_MS = CELL_MIN * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type CellState = "busy" | "free";
export type Cells = Record<string, CellState>;
export type ManualLayer = { cells: Cells; exclusive: boolean };

export function isEmptyLayer(layer: ManualLayer | null | undefined): boolean {
  return !layer || (!layer.exclusive && Object.keys(layer.cells).length === 0);
}

/** そのマス（UTC ミリ秒）の毎週キー */
export function weeklyKey(cellStart: number): string {
  const jst = new Date(cellStart + JST_OFFSET_MS);
  return `${jst.getUTCDay()}-${jst.getUTCHours() * 60 + jst.getUTCMinutes()}`;
}

/** 手動の 2 層だけで決まる状態。決まらなければ null（外部カレンダーに任せる） */
export function manualState(
  cellStart: number,
  weekly: ManualLayer | null,
  meeting: ManualLayer | null,
): CellState | null {
  const m = meeting?.cells[String(cellStart)];
  if (m) return m;
  if (meeting?.exclusive) return "busy";
  const w = weekly?.cells[weeklyKey(cellStart)];
  if (w) return w;
  if (weekly?.exclusive) return "busy";
  return null;
}

function merge(intervals: Busy[]): Busy[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

/**
 * [from, to) の「埋まっている時間」を 3 層から合成する。
 * from は 30 分の区切り（日本時間の 0 時など）である前提。
 */
export function combineBusy(
  calendarBusy: Busy[],
  weekly: ManualLayer | null,
  meeting: ManualLayer | null,
  from: number,
  to: number,
): Busy[] {
  const manualBusy: Busy[] = [];
  const calendarCells: Busy[] = [];
  for (let t = from; t < to; t += CELL_MS) {
    const state = manualState(t, weekly, meeting);
    if (state === "busy") manualBusy.push({ start: t, end: t + CELL_MS });
    else if (state === null) calendarCells.push({ start: t, end: t + CELL_MS });
  }

  // 外部カレンダーの予定は、手動で決まっていないマスの中だけ効かせる
  const open = merge(calendarCells);
  const fromCalendar: Busy[] = [];
  for (const b of calendarBusy) {
    for (const o of open) {
      const start = Math.max(b.start, o.start);
      const end = Math.min(b.end, o.end);
      if (start < end) fromCalendar.push({ start, end });
    }
  }
  return merge([...manualBusy, ...fromCalendar]);
}

/** 保存前の検査。キーと値の形が正しい、上限以内のものだけ通す */
export function validCells(value: unknown, kind: "weekly" | "meeting"): value is Cells {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 5000) return false;
  const keyOk =
    kind === "weekly"
      ? (k: string) => /^[0-6]-\d{1,4}$/.test(k) && Number(k.split("-")[1]) % CELL_MIN === 0 && Number(k.split("-")[1]) < 1440
      : (k: string) => /^\d{13}$/.test(k) && Number(k) % CELL_MS === 0;
  return entries.every(([k, v]) => keyOk(k) && (v === "busy" || v === "free"));
}
