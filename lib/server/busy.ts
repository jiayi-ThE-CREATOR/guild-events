import { busyFromIcs } from "../ics";
import type { Busy } from "../slots";
import type { CalendarSource } from "./admin";
import { googleBusy } from "./google";
import { fetchIcs } from "./ics-fetch";

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
    sources.map(async (s) => {
      if (s.provider === "google") return googleBusy(s.secret, from, to);
      if (s.provider === "ics") return busyFromIcs(await fetchIcs(s.secret), from, to);
      throw new Error(`未対応のカレンダー: ${s.provider}`);
    }),
  );
  return lists.flat();
}
