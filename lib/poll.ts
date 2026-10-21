/**
 * 日程の投票（イベントの日程調整の 2 回目）。画面とサーバーで共有する純関数（tests/poll.test.ts）。
 * 選択肢ごとに「参加できる」に印を付けた人を数え、一番多いもの（同数なら早いもの）に決める。
 */

export type PollOption = {
  id: string;
  /** ISO8601 */
  start: string;
  end: string;
  /** 「参加できる」に印を付けた人 */
  voters: string[];
};

/** 選べる選択肢の数 */
export const MAX_POLL_OPTIONS = 10;
/** 投票の締め切り（今から何時間後）の選択肢 */
export const POLL_DEADLINE_HOURS = [6, 12, 24, 48, 72];

/** 決める選択肢。誰も印を付けていなければ null（不成立） */
export function pickOption(options: PollOption[]): PollOption | null {
  const best = [...options]
    .filter((o) => o.voters.length > 0)
    .sort((a, b) => b.voters.length - a.voters.length || a.start.localeCompare(b.start))[0];
  return best ?? null;
}

const HALF_HOUR = 30 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 投票の選択肢 1 つ（ISO8601）。開始〜終了の時間帯 */
export type PollRange = { start: string; end: string };

/**
 * 選択肢（時間帯）の検査。問題があれば日本語の理由。
 * 30 分刻み・今より後・終了は開始より後で、その日のうちに終わる（24:00 まで）・同じ開始は 1 つまで
 */
export function pollOptionsProblem(options: unknown, now = Date.now()): string | null {
  if (!Array.isArray(options) || options.length === 0) return "日程を 1 つ以上選んでください";
  if (options.length > MAX_POLL_OPTIONS) return `日程は ${MAX_POLL_OPTIONS} 個までです`;
  const ms = (options as Partial<PollRange>[]).map((o) => ({
    start: typeof o?.start === "string" ? Date.parse(o.start) : NaN,
    end: typeof o?.end === "string" ? Date.parse(o.end) : NaN,
  }));
  if (ms.some((o) => Number.isNaN(o.start) || Number.isNaN(o.end) || o.start % HALF_HOUR !== 0 || o.end % HALF_HOUR !== 0)) {
    return "日程の時刻が正しくありません（30 分刻み）";
  }
  if (ms.some((o) => o.start <= now)) return "今より後の日程だけ選べます";
  if (ms.some((o) => o.end <= o.start)) return "終わりは始まりより後にしてください";
  // 日本時間でその日の 24:00 を超えない
  if (ms.some((o) => o.end > Math.floor((o.start + JST) / DAY) * DAY - JST + DAY)) return "その日のうちに終わる時間帯にしてください";
  if (new Set(ms.map((o) => o.start)).size !== ms.length) return "同じ時刻に始まる日程が 2 つあります";
  return null;
}
