const JST = "Asia/Tokyo";

type Parts = { month: string; day: string; weekday: string; time: string };

/** サーバー / クライアントで結果がぶれないよう、必ず JST 固定で組み立てる */
function jstParts(iso: string): Parts {
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    formatted.find((p) => p.type === type)?.value ?? "";

  return {
    month: pick("month"),
    day: pick("day"),
    weekday: pick("weekday").replace(/[（）]/g, ""),
    time: `${pick("hour")}:${pick("minute")}`,
  };
}

/** 一覧カード左端の日付ブロック用 */
export function dateBlock(iso: string) {
  const { month, day, weekday } = jstParts(iso);
  return { month: `${month}月`, day, weekday };
}

/** 「8/1（土）14:00」 */
export function fullDateTime(iso: string) {
  const { month, day, weekday, time } = jstParts(iso);
  return `${month}/${day}（${weekday}）${time}`;
}

/** 「14:00」 */
export function timeOnly(iso: string) {
  return jstParts(iso).time;
}

export type Campus = "阪大" | "京大" | "オンライン" | "その他";

/** DB に campus 列は無いので、location から表示用のタグを導く */
export function campusOf(location: string | null): Campus {
  const value = location ?? "";
  if (/オンライン|Discord|Zoom/i.test(value)) return "オンライン";
  if (/阪大|大阪大学|豊中|吹田|箕面/.test(value)) return "阪大";
  if (/京大|京都大学|吉田|宇治|桂/.test(value)) return "京大";
  return "その他";
}

/** カードに収まるよう会場名を短くする */
export function shortLocation(location: string | null): string {
  if (!location) return "場所未定";
  const online = location.match(/^オンライン（(.+)）$/);
  if (online) return online[1];
  return location.replace(/^(大阪大学|京都大学)\s*/, "");
}

export function remainingSeats(capacity: number | null, applied: number) {
  if (capacity === null) return null;
  return Math.max(capacity - applied, 0);
}
