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

/** 選択肢の開始時刻の検査。問題があれば日本語の理由 */
export function pollStartsProblem(starts: unknown, now = Date.now()): string | null {
  if (!Array.isArray(starts) || starts.length === 0) return "日程を 1 つ以上選んでください";
  if (starts.length > MAX_POLL_OPTIONS) return `日程は ${MAX_POLL_OPTIONS} 個までです`;
  const ms = starts.map((s) => (typeof s === "string" ? Date.parse(s) : NaN));
  if (ms.some((t) => Number.isNaN(t) || t % HALF_HOUR !== 0)) return "日程の時刻が正しくありません（30 分刻み）";
  if (ms.some((t) => t <= now)) return "今より後の日程だけ選べます";
  if (new Set(ms).size !== ms.length) return "同じ日程が 2 回入っています";
  return null;
}
