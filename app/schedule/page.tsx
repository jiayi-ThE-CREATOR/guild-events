"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fullDateTime, timeOnly } from "@/lib/format";
import { MEMBERS } from "@/lib/members";
import type { SlotResult } from "@/lib/slots";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 日程調整。参加者と条件を選ぶと、全員（そろわなければ 1 人欠け）が
 * 参加できる時間をサーバーが各自のカレンダーから探して返す。
 * 誰でも使える。他の人の予定の中身はこの画面には一切出てこない。
 */

const DURATIONS = [30, 60, 90, 120];
const HOURS = Array.from({ length: 25 }, (_, h) => h);

/** 日本時間で今日から n 日後の "YYYY-MM-DD" */
function jstDate(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
}

type Failure = { failed: string[]; notConnected: string[] };

export default function SchedulePage() {
  // 既定の日付（明日）はビルド時ではなく開いた時点で決めたいので、描画はクライアントだけ
  const isClient = useIsClient();
  if (!isClient) {
    return <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>;
  }
  return <ScheduleForm />;
}

function ScheduleForm() {
  const [connected, setConnected] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(() => jstDate(1));
  const [days, setDays] = useState(7);
  const [durationMin, setDurationMin] = useState(60);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SlotResult | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/schedule/members")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setConnected(json.members);
        setSelected(new Set(json.members));
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searching || selected.size === 0) return;
    setSearching(true);
    setResult(null);
    setFailure(null);
    setError(null);
    try {
      const res = await fetch("/api/schedule/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: [...selected],
          fromDate,
          days,
          durationMin,
          dayStartMin: startHour * 60,
          dayEndMin: endHour * 60,
        }),
      });
      const json = await res.json();
      if (res.status === 409) setFailure(json);
      else if (!res.ok) throw new Error(json.error);
      else setResult(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const field = "border-line focus:border-navy w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none";
  const label = "text-ink mb-1 block text-xs font-semibold";

  return (
    <div className="px-4 pt-6 md:mx-auto md:max-w-3xl md:px-0 md:pt-0">
      <h1 className="text-ink text-2xl font-bold">日程調整</h1>
      <p className="text-ink-soft mt-1 text-xs md:text-sm">
        みんなのカレンダーから、会議を入れられる時間を探します。
        自分のカレンダーは{" "}
        <Link href="/mypage" className="text-navy underline">
          マイページ
        </Link>{" "}
        でつなげます。
      </p>

      {loadError && <p className="text-amber bg-amber-soft mt-4 rounded-xl p-3 text-xs">{loadError}</p>}

      <form onSubmit={handleSearch} className="mt-5 space-y-5">
        <fieldset>
          <legend className={label}>参加者（{selected.size}人）</legend>
          {!connected && !loadError && <p className="text-ink-soft text-xs">読み込み中…</p>}
          {connected && (
            <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
              {MEMBERS.map((name) => {
                const ok = connected.includes(name);
                return (
                  <li key={name}>
                    <label
                      className={`border-line flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                        ok ? "text-ink bg-white" : "text-ink-soft bg-canvas"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!ok}
                        checked={selected.has(name)}
                        onChange={() => toggle(name)}
                      />
                      <span className="truncate">{name}</span>
                      {!ok && <span className="ml-auto shrink-0 text-[10px]">未連携</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="from" className={label}>いつから</label>
            <input id="from" type="date" value={fromDate} min={jstDate(0)} onChange={(e) => setFromDate(e.target.value)} className={field} required />
          </div>
          <div>
            <label htmlFor="days" className={label}>何日間</label>
            <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={field}>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}日間</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="duration" className={label}>会議の長さ</label>
            <select id="duration" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={field}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m}分` : `${m / 60}時間`}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>時間帯</span>
            <div className="flex items-center gap-1">
              <select aria-label="何時から" value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className={field}>
                {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{h}時</option>)}
              </select>
              <span className="text-ink-soft text-xs">〜</span>
              <select aria-label="何時まで" value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className={field}>
                {HOURS.slice(1).map((h) => <option key={h} value={h}>{h}時</option>)}
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={searching || selected.size === 0 || startHour >= endHour}
          className="bg-navy w-full rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
        >
          {searching ? "みんなのカレンダーを確認中…" : "空いている時間を探す"}
        </button>
      </form>

      {error && <p className="text-amber bg-amber-soft mt-5 rounded-xl p-3 text-xs">{error}</p>}

      {failure && (
        <p className="text-amber bg-amber-soft mt-5 rounded-xl p-3 text-xs">
          {[...failure.failed, ...failure.notConnected].join("、")} さんのカレンダーを読み込めませんでした。
          マイページでつなぎ直してもらうか、参加者から外してもう一度探してください。
        </p>
      )}

      {result && <Results result={result} durationMin={durationMin} />}
    </div>
  );
}

function Results({ result, durationMin }: { result: SlotResult; durationMin: number }) {
  const length = durationMin < 60 ? `${durationMin}分` : `${durationMin / 60}時間`;

  if (result.available === null || result.windows.length === 0) {
    return (
      <p className="border-line text-ink-soft mt-6 rounded-2xl border border-dashed p-6 text-center text-xs">
        {result.total}人中 {Math.max(result.total - 1, 1)}人以上が参加できる時間は見つかりませんでした。
        <br />
        期間や時間帯を広げてみてください。
      </p>
    );
  }

  const everyone = result.available === result.total;
  return (
    <section className="mt-6 pb-4">
      {everyone ? (
        <h2 className="text-ink text-sm font-bold md:text-base">
          全員（{result.total}人）が参加できる時間
        </h2>
      ) : (
        <>
          <p className="text-amber bg-amber-soft mb-3 rounded-xl p-3 text-xs">
            全員がそろう時間はありませんでした。1人だけ欠ける時間を出しています。
          </p>
          <h2 className="text-ink text-sm font-bold md:text-base">
            {result.total}人中 {result.available}人が参加できる時間
          </h2>
        </>
      )}
      <p className="text-ink-soft mt-1 mb-3 text-xs">この時間帯の中なら、{length}をどこに入れても大丈夫です</p>
      <ul className="space-y-2">
        {result.windows.map((w) => (
          <li key={w.start} className="border-line text-ink rounded-2xl border bg-white p-3.5 text-sm font-semibold">
            {fullDateTime(new Date(w.start).toISOString())}〜{timeOnly(new Date(w.end).toISOString())}
          </li>
        ))}
      </ul>
    </section>
  );
}
