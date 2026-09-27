"use client";

import { useEffect, useState } from "react";
import ScheduleEditor from "@/components/ScheduleEditor";
import type { Cells } from "@/lib/manual";

/**
 * マイページの「毎週の予定」。授業・バイトなど毎週決まった予定を一度入れておくと、
 * 全部の会議の計算に使われる。外部カレンダーと重なったらこちらが優先。
 */

// 月曜始まりで並べる。キーの曜日は Date#getDay と同じ 0=日〜6=土
const DAYS = [
  { label: "月", dow: 1 },
  { label: "火", dow: 2 },
  { label: "水", dow: 3 },
  { label: "木", dow: 4 },
  { label: "金", dow: 5 },
  { label: "土", dow: 6 },
  { label: "日", dow: 0 },
];

type Saved = { cells: Cells; exclusive: boolean };

export default function WeeklySchedule({ member }: { member: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/weekly?member=${encodeURIComponent(member)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (alive) setSaved(json);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [member]);

  async function save(cells: Cells, exclusive: boolean) {
    const res = await fetch("/api/weekly", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member, cells, exclusive }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
  }

  return (
    <section>
      <h2 className="text-ink mb-1 text-sm font-bold md:text-base">毎週の予定</h2>
      <p className="text-ink-soft mb-3 text-xs md:mb-4">
        授業やバイトなど、毎週決まっている予定を入れておくと全部の会議に使われます。
        カレンダーを使っていない人はここだけでもOK。カレンダーと重なったらこちらが優先です。
      </p>
      {error && <p className="text-amber bg-amber-soft rounded-xl p-3 text-xs">{error}</p>}
      {!saved && !error && <p className="text-ink-soft py-4 text-center text-xs">読み込み中…</p>}
      {saved && (
        <ScheduleEditor
          // 名前を切り替えたら入力をまっさらにする
          key={member}
          columns={DAYS.map((d) => ({ label: d.label }))}
          startMin={6 * 60}
          endMin={24 * 60}
          cellKey={(col, min) => `${DAYS[col].dow}-${min}`}
          initialCells={saved.cells}
          initialExclusive={saved.exclusive}
          onSave={save}
        />
      )}
    </section>
  );
}
