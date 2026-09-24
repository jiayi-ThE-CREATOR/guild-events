"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NameSelect from "@/components/NameSelect";
import PageHeader from "@/components/PageHeader";
import { MEETING_DEADLINE_HOURS, hoursLabel } from "@/lib/meetings";
import { MEMBERS } from "@/lib/members";
import { loadProfile } from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";

/** 会議を作る。作った時点で募集中になり、選んだ時間が経つと自動で日時が決まる */

const DURATIONS = [30, 60, 90, 120];
const HOURS = Array.from({ length: 25 }, (_, h) => h);

/** 日本時間で今日から n 日後の "YYYY-MM-DD" */
function jstDate(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
}

export default function NewMeetingPage() {
  // 既定の日付・主催者は開いた時点・この端末の登録で決めたいので、描画はクライアントだけ
  const isClient = useIsClient();
  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHeader title="会議を作成" />
      {isClient ? (
        <MeetingForm />
      ) : (
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      )}
    </div>
  );
}

function MeetingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState(() => loadProfile()?.name ?? "");
  const [participants, setParticipants] = useState<Set<string>>(() => {
    const me = loadProfile()?.name;
    return new Set(me ? [me] : []);
  });
  const [connected, setConnected] = useState<string[] | null>(null);
  const [durationMin, setDurationMin] = useState(60);
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [fromDate, setFromDate] = useState(() => jstDate(3));
  const [days, setDays] = useState(7);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 参加者を選ぶときの目安（カレンダーをつないでいない人が分かるように）
  useEffect(() => {
    fetch("/api/schedule/members")
      .then((res) => res.json())
      .then((json) => setConnected(json.members ?? []))
      .catch(() => setConnected([]));
  }, []);

  function toggle(name: string) {
    const next = new Set(participants);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setParticipants(next);
  }

  const ready =
    title.trim() !== "" && organizer !== "" && participants.size > 0 && startHour < endHour;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          organizer,
          participants: MEMBERS.filter((m) => participants.has(m)),
          durationMin,
          deadlineHours,
          fromDate,
          days,
          dayStartMin: startHour * 60,
          dayEndMin: endHour * 60,
          location,
          description,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.replace(`/schedule/${json.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const field =
    "border-line focus:border-navy text-ink w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] outline-none";
  const label = "text-ink mb-1.5 block text-xs font-semibold";
  const req = <span className="text-amber ml-0.5">*</span>;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-line space-y-5 px-4 pt-4 pb-6 md:rounded-2xl md:border md:bg-white md:p-8"
    >
      <div>
        <label htmlFor="title" className={label}>会議名{req}</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="運営ミーティング"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="organizer" className={label}>主催者{req}</label>
        <NameSelect id="organizer" value={organizer} onChange={setOrganizer} />
      </div>

      <fieldset>
        <legend className={label}>参加者（{participants.size}人）{req}</legend>
        <ul className="grid grid-cols-2 gap-1.5">
          {MEMBERS.map((name) => {
            const unconnected = connected !== null && !connected.includes(name);
            return (
              <li key={name}>
                <label className="border-line text-ink flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={participants.has(name)}
                    onChange={() => toggle(name)}
                  />
                  <span className="truncate">{name}</span>
                  {unconnected && (
                    <span className="text-ink-soft ml-auto shrink-0 text-[10px]">未連携</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-ink-soft mt-1.5 text-[11px]">
          「未連携」の人は、結果発表までにマイページでカレンダーをつながないと計算に入りません。
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="duration" className={label}>会議の長さ</label>
          <select id="duration" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={field}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m}分` : `${m / 60}時間`}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deadline" className={label}>結果発表</label>
          <select id="deadline" value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className={field}>
            {MEETING_DEADLINE_HOURS.map((h) => (
              <option key={h} value={h}>{hoursLabel(h)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={label}>候補の範囲</span>
        <div className="grid grid-cols-2 gap-3">
          <input aria-label="いつから" type="date" value={fromDate} min={jstDate(0)} onChange={(e) => setFromDate(e.target.value)} className={field} required />
          <select aria-label="何日間" value={days} onChange={(e) => setDays(Number(e.target.value))} className={field}>
            {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>から{n}日間</option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select aria-label="何時から" value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className={field}>
            {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{h}時</option>)}
          </select>
          <span className="text-ink-soft text-xs">〜</span>
          <select aria-label="何時まで" value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className={field}>
            {HOURS.slice(1).map((h) => <option key={h} value={h}>{h}時</option>)}
          </select>
        </div>
        <p className="text-ink-soft mt-1.5 text-[11px]">
          結果発表より後の時間の中から、一番早くそろう時間に決まります。
        </p>
      </div>

      <div>
        <label htmlFor="location" className={label}>場所（任意）</label>
        <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord / 豊中キャンパス など" className={field} />
      </div>

      <div>
        <label htmlFor="description" className={label}>説明（任意）</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="話すこと、準備してほしいことなど" className={field} />
      </div>

      {error && <p className="text-amber bg-amber-soft rounded-xl p-3 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={!ready || submitting}
        className="bg-grass w-full rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
      >
        {submitting ? "作成中…" : "この会議で募集を始める"}
      </button>
    </form>
  );
}
