"use client";

import { useEffect, useState } from "react";
import { btn, ErrorText, field, Note } from "@/components/ui";
import { fullDateTime, timeOnly } from "@/lib/format";
import { hoursLabel } from "@/lib/meetings";
import { MAX_POLL_OPTIONS, POLL_DEADLINE_HOURS, type PollOption } from "@/lib/poll";

/**
 * イベントの日程調整の 2 回目：候補から日程をいくつか選んで、参加者に投票してもらう。
 * PollStart は投票を始めるパネル（1 回目の「今の時点の候補」から選ぶか、日時を足す）、
 * PollVote は投票中の表（「参加できる」に印を付ける・主催者は先に決められる）。
 */

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
const hm = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
const span = (start: number, end: number) =>
  `${fullDateTime(new Date(start).toISOString())}〜${timeOnly(new Date(end).toISOString())}`;

/** 会議の詳細（api/meetings/[id]）の「今の時点の候補」 */
type Preview = { result: { total: number; available: number | null; windows: { start: number; end: number }[] } } | null;

export function PollStart({
  meetingId,
  durationMin,
  onDone,
}: {
  meetingId: string;
  durationMin: number;
  onDone: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  // 選んだ開始時刻（UTC ミリ秒）
  const [chosen, setChosen] = useState<number[]>([]);
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [addDate, setAddDate] = useState("");
  const [addStart, setAddStart] = useState(18 * 60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duration = durationMin * 60 * 1000;

  // 1 回目の計算の候補（みんなのカレンダーを読むので、パネルを開いたときだけ）
  useEffect(() => {
    let alive = true;
    fetch(`/api/meetings/${meetingId}`)
      .then((res) => res.json())
      .then((json) => alive && setPreview(json.preview ?? null))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
  }, [meetingId]);

  const windows = preview?.result.windows ?? [];
  const extra = chosen.filter((s) => !windows.some((w) => w.start === s));
  const toggle = (s: number) =>
    setChosen(chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s].sort((a, b) => a - b));

  function addManual() {
    if (!addDate) return;
    const s = Date.parse(`${addDate}T00:00:00+09:00`) + addStart * 60 * 1000;
    if (!chosen.includes(s)) setChosen([...chosen, s].sort((a, b) => a - b));
  }

  async function start() {
    if (saving || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts: chosen.map((s) => new Date(s).toISOString()), deadlineHours }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Note>
        日程を選んで投票にします（{MAX_POLL_OPTIONS} 個まで）。締め切りで、一番多く「参加できる」が付いた日程に決まり、
        印を付けた人が自動で参加になります。
      </Note>

      <div>
        <p className="text-ink mb-1 text-[13px] font-semibold">今の時点の候補から選ぶ</p>
        {preview === undefined ? (
          <Note>みんなのカレンダーを確認中…</Note>
        ) : windows.length === 0 ? (
          <Note>今のところ、そろう時間はありません。下で日時を足してください。</Note>
        ) : (
          <ul className="border-line divide-line max-h-72 divide-y overflow-y-auto rounded-lg border bg-white">
            {windows.map((w) => (
              <li key={w.start}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                  <input type="checkbox" checked={chosen.includes(w.start)} onChange={() => toggle(w.start)} className="size-4" />
                  <span className="text-ink font-semibold tabular-nums">{span(w.start, w.start + duration)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {preview && preview.result.available !== null && preview.result.available !== preview.result.total && (
          <Note className="mt-1">全員はそろわないので、1 人欠けの時間を出しています。各時間帯の始まりの時刻です。</Note>
        )}
      </div>

      <div>
        <p className="text-ink mb-1 text-[13px] font-semibold">日時を足す</p>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="日付" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className={`${field} w-auto`} />
          <select aria-label="開始時刻" value={addStart} onChange={(e) => setAddStart(Number(e.target.value))} className={`${field} w-auto`}>
            {HALF_HOURS.map((x) => <option key={x} value={x}>{hm(x)}</option>)}
          </select>
          <button type="button" onClick={addManual} disabled={!addDate} className={btn.secondary}>追加</button>
        </div>
        {extra.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {extra.map((s) => (
              <li key={s} className="border-navy bg-navy-soft text-navy flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-3 text-[13px] font-semibold">
                {span(s, s + duration)}
                <button type="button" aria-label="外す" onClick={() => toggle(s)} className="px-1 text-sm leading-none">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-ink text-[13px] font-semibold">
          締め切り
          <select value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className={`${field} mt-1 block w-auto`}>
            {POLL_DEADLINE_HOURS.map((h) => <option key={h} value={h}>{hoursLabel(h)}</option>)}
          </select>
        </label>
        <button type="button" onClick={start} disabled={saving || chosen.length === 0} className={btn.primary}>
          {saving ? "始めています…" : `${chosen.length}個の日程で投票を始める`}
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function PollVote({
  meetingId,
  options,
  participants,
  deadline,
  member,
  canDecide,
  onChanged,
}: {
  meetingId: string;
  options: PollOption[];
  participants: string[];
  deadline: string;
  /** この端末の名前（投票できるのは参加者だけ） */
  member: string | null;
  /** 先に決められるか（主催者・運営） */
  canDecide: boolean;
  onChanged: () => Promise<void>;
}) {
  const canVote = !!member && participants.includes(member);
  const mine = options.filter((o) => member && o.voters.includes(member)).map((o) => o.id);
  const [picked, setPicked] = useState<string[]>(mine);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = picked.length !== mine.length || picked.some((id) => !mine.includes(id));
  const voted = new Set(options.flatMap((o) => o.voters));
  const notYet = participants.filter((p) => !voted.has(p));
  const top = Math.max(0, ...options.map((o) => o.voters.length));

  async function send(path: string, body: unknown) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/poll/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ul className="border-line divide-line divide-y rounded-lg border bg-white">
        {options.map((o) => {
          const on = picked.includes(o.id);
          return (
            <li key={o.id} className="flex flex-col gap-1.5 px-3 py-2.5 md:flex-row md:items-center md:gap-3">
              <label className={`flex min-w-0 flex-1 items-center gap-2.5 ${canVote ? "cursor-pointer" : ""}`}>
                {canVote && (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setSaved(false);
                      setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id]);
                    }}
                    className="size-4 shrink-0"
                  />
                )}
                <span className="min-w-0">
                  <span className="text-ink block text-sm font-semibold tabular-nums">
                    {span(Date.parse(o.start), Date.parse(o.end))}
                    <span className={`ml-2 text-[13px] ${o.voters.length === top && top > 0 ? "text-grass font-bold" : "text-ink-soft font-normal"}`}>
                      {o.voters.length}/{participants.length}人
                    </span>
                  </span>
                  <span className="text-ink-soft block truncate text-xs">{o.voters.join("、") || "—"}</span>
                </span>
              </label>
              {canDecide && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!window.confirm(`締め切りを待たずに、${span(Date.parse(o.start), Date.parse(o.end))} に決めます。\n印を付けた ${o.voters.length} 人が参加になり、Discord にも流れます。よろしいですか？`)) return;
                    void send("decide", { optionId: o.id });
                  }}
                  className={`${btn.text} shrink-0 self-start md:self-auto`}
                >
                  この日程に決める
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {canVote && (
          <button
            type="button"
            disabled={saving || !changed}
            onClick={async () => setSaved(await send("vote", { member, optionIds: picked }))}
            className={btn.primary}
          >
            {saving ? "送っています…" : mine.length > 0 || saved ? "投票を変更する" : "投票する"}
          </button>
        )}
        {saved && !changed && <span className="text-grass text-[13px] font-semibold">投票しました</span>}
        <Note>
          {fullDateTime(deadline)} 締め切り。参加できる日程すべてに印を付けてください（何度でも変えられます）。
        </Note>
      </div>
      {!canVote && (
        <Note className="mt-1">
          {member ? "投票できるのは、日程調整の参加者だけです。" : "マイページで名前を選ぶと投票できます。"}
        </Note>
      )}
      {notYet.length > 0 && <Note className="mt-1">まだ投票していない人：{notYet.join("、")}</Note>}
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}
