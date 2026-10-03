"use client";

import { useEffect, useState } from "react";
import DayPager, { DAYS_PER_PAGE, pageColumns, pageCount } from "@/components/DayPager";
import { fullDateTime, timeOnly } from "@/lib/format";
import { labelOf } from "@/lib/guests";
import { CELL_MIN } from "@/lib/manual";
import { inRanges, rangeDates, type CandidateRange } from "@/lib/ranges";

/**
 * 会議ページの「みんなの予定」。候補の日付を列、30 分を行にした週表示で、
 * マスごとに予定がある人数を濃さと数字で出す。マスを押す（PC はカーソルを載せる）と誰かが出る。
 * 予定の中身は出さない。決まった会議なら、その時間を緑の枠で囲む。
 */

type BusyData = {
  members: string[];
  cells: Record<string, string[]>;
  unconnected: string[];
  unreadable: string[];
  labels: Record<string, string>;
};

const CELL_MS = CELL_MIN * 60 * 1000;

function hhmm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export default function MembersBusyGrid({
  meetingId,
  ranges,
  decided,
}: {
  meetingId: string;
  ranges: CandidateRange[];
  /** 決まった時間（あれば枠で囲む） */
  decided?: { start: number; end: number } | null;
}) {
  const [data, setData] = useState<BusyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meetings/${meetingId}/busy`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (alive) setData(json);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [meetingId]);

  const days = rangeDates(ranges).map((d) => Date.parse(`${d}T00:00:00+09:00`));
  const startMin = Math.min(...ranges.map((r) => r.dayStartMin));
  const endMin = Math.max(...ranges.map((r) => r.dayEndMin));
  const rows: number[] = [];
  for (let m = startMin; m < endMin; m += CELL_MIN) rows.push(m);
  const columns = days.map((d) => {
    const [md, wd] = fullDateTime(new Date(d).toISOString()).split("（");
    return { label: wd.slice(0, 1), sub: md };
  });

  // 日数が多いときは 1 週間ずつめくる。決まった会議は、その日を含むページから
  const [page, setPage] = useState(() => {
    if (!decided) return 0;
    const i = days.findIndex((d) => decided.start >= d && decided.start < d + 24 * 60 * 60 * 1000);
    return i < 0 ? 0 : Math.floor(i / DAYS_PER_PAGE);
  });
  const visible = pageColumns(days.length, page);
  const pageLabel = [columns[visible[0]], columns[visible[visible.length - 1]]].map((c) => c.sub).join("〜");

  const total = data?.members.length ?? 0;
  const name = (k: string) => (data ? labelOf(data.labels, k) : k);
  const busyAt = (t: number) => data?.cells[String(t)] ?? [];

  function shade(n: number) {
    if (n === 0 || total === 0) return "bg-white";
    const ratio = n / total;
    if (ratio >= 1) return "bg-kyoto/80 text-white";
    if (ratio >= 0.5) return "bg-kyoto/45 text-ink";
    return "bg-kyoto/20 text-ink";
  }

  return (
    <section className="border-line rounded-2xl border bg-white p-4">
      <h2 className="text-ink text-sm font-bold">みんなの予定</h2>
      <p className="text-ink-soft mt-1 text-xs">
        マスの数字はその 30 分に予定がある人数です（予定の中身は出ません）。マスを押すと誰かが出ます。
        今のカレンダーと手動の予定で計算しています。
      </p>
      {error && <p className="text-amber mt-2 text-xs">{error}</p>}
      {!data && !error && <p className="text-ink-soft mt-3 text-xs">みんなのカレンダーを確認中…</p>}

      {data && (
        <>
          <div className="mt-3">
            <DayPager page={page} pages={pageCount(days.length)} label={pageLabel} onChange={setPage} />
          </div>
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse select-none text-[10px]">
              <thead>
                <tr>
                  <th className="w-10" />
                  {visible.map((i) => (
                    <th key={i} className="text-ink px-0.5 py-1.5 text-center font-semibold">
                      {columns[i].label}
                      <span className="text-ink-soft block font-normal">{columns[i].sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((min) => (
                  <tr key={min}>
                    <th scope="row" className="text-ink-soft w-10 pr-1 text-right align-top font-normal leading-none">
                      {min % 60 === 0 ? hhmm(min) : ""}
                    </th>
                    {visible.map((col) => {
                      const t = days[col] + min * 60 * 1000;
                      if (!inRanges(ranges, t, CELL_MIN)) {
                        return <td key={col} className="border-line cover-stripes h-5 min-w-9 border" />;
                      }
                      const busy = busyAt(t);
                      const inDecided = decided && t >= decided.start && t < decided.end;
                      return (
                        <td
                          key={col}
                          title={busy.length > 0 ? busy.map(name).join("、") : "全員空き"}
                          onClick={() => setSelected(t === selected ? null : t)}
                          className={`border-line h-5 min-w-9 cursor-pointer border text-center font-semibold ${shade(busy.length)} ${
                            selected === t ? "ring-navy ring-2 ring-inset" : inDecided ? "ring-grass ring-2 ring-inset" : ""
                          }`}
                        >
                          {busy.length > 0 ? busy.length : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-ink-soft mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1"><span className="border-line inline-block h-3 w-3 rounded-sm border bg-white" />全員空き</span>
            <span className="flex items-center gap-1"><span className="bg-kyoto/20 inline-block h-3 w-3 rounded-sm" />少し</span>
            <span className="flex items-center gap-1"><span className="bg-kyoto/45 inline-block h-3 w-3 rounded-sm" />半分以上</span>
            <span className="flex items-center gap-1"><span className="bg-kyoto/80 inline-block h-3 w-3 rounded-sm" />全員予定あり</span>
            {decided && <span className="flex items-center gap-1"><span className="ring-grass inline-block h-3 w-3 rounded-sm ring-2 ring-inset" />決まった時間</span>}
          </div>

          {selected !== null && (
            <div className="bg-canvas mt-3 rounded-xl p-3 text-xs">
              <p className="text-ink font-bold">
                {fullDateTime(new Date(selected).toISOString())}〜{timeOnly(new Date(selected + CELL_MS).toISOString())}
              </p>
              <p className="text-ink mt-1">
                予定あり（{busyAt(selected).length}）：{busyAt(selected).map(name).join("、") || "なし"}
              </p>
              <p className="text-ink-soft mt-0.5">
                空き（{total - busyAt(selected).length}）：
                {data.members.filter((k) => !busyAt(selected).includes(k)).map(name).join("、") || "なし"}
              </p>
            </div>
          )}

          {data.unconnected.length > 0 && (
            <p className="text-ink-soft mt-2 text-[11px]">
              予定未登録で表に入っていない人：{data.unconnected.map(name).join("、")}
            </p>
          )}
          {data.unreadable.length > 0 && (
            <p className="text-ink-soft mt-1 text-[11px]">
              カレンダーを読み込めず表に入っていない人：{data.unreadable.map(name).join("、")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
