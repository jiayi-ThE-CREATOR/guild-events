import { busyFromIcs } from "../ics";
import type { Busy } from "../slots";
import type { CalendarSource } from "./admin";
import { googleBusy } from "./google";
import { fetchIcs } from "./ics-fetch";

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Google は一時的に internal_failure などを返すことがある（実測）。
 * 1 回の失敗でその人を「読み込めない」にしないよう、少し待って何度か試す。
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

/**
 * 1 人ぶんの「埋まっている時間」を、連携しているカレンダー全部から集める。
 * どれか 1 つでも読めなければ、その人は失敗扱いにする
 * （一部だけで判定すると、空いていないのに空いていると出てしまうため）。
 */
export async function memberBusy(
  sources: CalendarSource[],
  from: number,
  to: number,
): Promise<Busy[]> {
  const lists = await Promise.all(
    sources.map((s) =>
      withRetry(async () => {
        if (s.provider === "google") return googleBusy(s.secret, from, to);
        if (s.provider === "ics") return busyFromIcs(await fetchIcs(s.secret), from, to);
        throw new Error(`未対応のカレンダー: ${s.provider}`);
      }),
    ),
  );
  return lists.flat();
}
