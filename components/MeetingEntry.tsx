"use client";

import { useEffect, useState } from "react";
import ScheduleEditor from "@/components/ScheduleEditor";
import { fullDateTime } from "@/lib/format";
import type { CellState, Cells } from "@/lib/manual";
import { inRanges, rangeDates, type CandidateRange } from "@/lib/ranges";

/**
 * 「この会議の予定」。候補の範囲の中だけを塗る。ここで塗ったマスは
 * 毎週の予定・外部カレンダーより優先される。下の層での見え方を薄く重ねて出す。
 * メンバーの会議ページと、外部ゲストの招待ページで共用（読み書きする URL だけ違う）。
 * 枠や見出しは置く側が持つ（会議ページは「⋯」から開くパネル、ゲストページは手順の②）。
 */
export default function MeetingEntry({
  ranges,
  loadUrl,
  saveUrl,
  saveBody,
  onSaved,
}: {
  ranges: CandidateRange[];
  loadUrl: string;
  saveUrl: string;
  /** 保存時に cells・exclusive と一緒に送るもの（メンバーなら { member }） */
  saveBody: Record<string, unknown>;
  onSaved: () => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<{
    cells: Cells;
    exclusive: boolean;
    base: Record<string, CellState>;
    calendarError: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(loadUrl)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (alive) setLoaded(json);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [loadUrl]);

  // 列は候補に出てくる日付だけ、行は候補全体の時間帯。候補の外のマスは塗れない
  const days = rangeDates(ranges).map((d) => Date.parse(`${d}T00:00:00+09:00`));
  const startMin = Math.min(...ranges.map((r) => r.dayStartMin));
  const endMin = Math.max(...ranges.map((r) => r.dayEndMin));
  const columns = days.map((d) => {
    const [md, wd] = fullDateTime(new Date(d).toISOString()).split("（");
    return { label: wd.slice(0, 1), sub: md };
  });

  async function save(cells: Cells, exclusive: boolean) {
    const res = await fetch(saveUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...saveBody, cells, exclusive }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await onSaved();
  }

  return (
    <div>
      <p className="text-ink-soft mb-2.5 text-xs leading-relaxed">
        候補の中で、カレンダーと違うところや、カレンダーに無い予定を塗ってください。ここで塗ったところが一番優先されます。
      </p>
      {error && <p className="text-amber bg-amber-soft rounded-lg px-3 py-2 text-[13px]">{error}</p>}
      {loaded?.calendarError && (
        <p className="text-amber bg-amber-soft mb-2.5 rounded-lg px-3 py-2 text-[13px]">
          外部カレンダーを読み込めなかったので、薄い色の表示にカレンダーの予定は入っていません。
        </p>
      )}
      {!loaded && !error && <p className="text-ink-soft py-4 text-center text-[13px]">読み込み中…</p>}
      {loaded && (
        <ScheduleEditor
          columns={columns}
          startMin={startMin}
          endMin={endMin}
          cellKey={(col, min) => String(days[col] + min * 60 * 1000)}
          isDisabled={(col, min) => !inRanges(ranges, days[col] + min * 60 * 1000, 30)}
          initialCells={loaded.cells}
          initialExclusive={loaded.exclusive}
          base={loaded.base}
          baseNote="カレンダー・毎週の予定での予定あり"
          onSave={save}
        />
      )}
    </div>
  );
}
