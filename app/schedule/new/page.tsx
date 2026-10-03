"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NameSelect from "@/components/NameSelect";
import RangesInput, { jstDate, rangesReady, toCandidateRanges, type RangeRow } from "@/components/RangesInput";
import PageHeader from "@/components/PageHeader";
import { btn, Dot, ErrorText, field, Note } from "@/components/ui";
import { MEETING_DEADLINE_HOURS, hoursLabel } from "@/lib/meetings";
import { MEMBERS } from "@/lib/members";
import { loadProfile } from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";

/** 会議を作る。作った時点で募集中になり、選んだ時間が経つと自動で日時が決まる */

const DURATIONS = [30, 60, 90, 120];



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
  // 候補（複数可）。1 件は「fromDate〜toDate の毎日 startHour〜endHour 時」
  const [ranges, setRanges] = useState<RangeRow[]>(() => [
    { fromDate: jstDate(3), toDate: jstDate(9), startHour: 9, endHour: 21 },
  ]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 外部ゲスト（メンバー以外）。作成後に招待リンクを 1 回だけ表示する
  const [guests, setGuests] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [created, setCreated] = useState<{ id: string; guests: { name: string; url: string }[] } | null>(null);

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
    title.trim() !== "" &&
    organizer !== "" &&
    // メンバーを選ばなくても、外部ゲストがいれば作れる
    (participants.size > 0 || guests.length > 0) &&
    rangesReady(ranges);

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
          ranges: toCandidateRanges(ranges),
          location,
          description,
          guests,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.guests?.length > 0) setCreated(json);
      else router.replace(`/schedule/${json.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const label = "text-ink mb-1 block text-[13px] font-semibold";
  const req = <span className="text-amber ml-0.5">*</span>;

  function addGuest() {
    const name = guestName.trim();
    if (!name || guests.includes(name)) return;
    setGuests([...guests, name]);
    setGuestName("");
  }

  if (created) {
    return <GuestLinks created={created} onDone={() => router.replace(`/schedule/${created.id}`)} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-line space-y-4 px-4 pt-3 pb-8 md:rounded-xl md:border md:bg-white md:p-6"
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
        <legend className={label}>
          参加者（{participants.size}人）{guests.length === 0 && req}
        </legend>
        <ul className="flex flex-wrap gap-1.5">
          {MEMBERS.map((name) => {
            const unconnected = connected !== null && !connected.includes(name);
            const on = participants.has(name);
            return (
              <li key={name}>
                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 pl-2.5 text-[13px] ${
                    on ? "border-navy bg-navy-soft text-navy font-semibold" : "border-line text-ink bg-white"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(name)} className="sr-only" />
                  <Dot className={unconnected ? "bg-white border border-ink-soft/50" : "bg-grass"} />
                  {name}
                </label>
              </li>
            );
          })}
        </ul>
        <Note className="mt-1.5">
          押して選びます。<Dot className="bg-grass" /> 予定登録あり　<Dot className="bg-white border border-ink-soft/50" /> 未登録（結果発表までに登録しないと計算に入りません）。
          外部ゲストがいれば、メンバーは選ばなくても作れます（主催者も出るなら自分を選ぶ）。
        </Note>
      </fieldset>

      <div>
        <span className={label}>外部ゲスト（任意・{guests.length}人）</span>
        <div className="flex gap-2">
          <input
            aria-label="ゲストの名前"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              // 日本語変換の確定の Enter では追加しない
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addGuest();
              }
            }}
            maxLength={50}
            placeholder="メンバー以外の人の名前"
            className={`${field} min-w-0 flex-1`}
          />
          <button type="button" onClick={addGuest} disabled={!guestName.trim()} className={`${btn.secondary} shrink-0`}>
            追加
          </button>
        </div>
        {guests.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {guests.map((g) => (
              <li key={g} className="border-navy bg-navy-soft text-navy flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-3 text-[13px] font-semibold">
                {g}
                <button type="button" aria-label={`${g}を外す`} onClick={() => setGuests(guests.filter((x) => x !== g))} className="px-1 text-sm leading-none">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <Note className="mt-1.5">作成すると一人ずつ招待リンクができます。相手に送ると、ログイン無しで予定を入れてもらえます。</Note>
      </div>

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
        <span className={label}>候補（{ranges.length}件）</span>
        <RangesInput ranges={ranges} onChange={setRanges} field={field} />
        <Note className="mt-1.5">1 日だけなら、始まりと終わりを同じ日に。結果発表より後の時間から、一番早くそろう時間に決まります。</Note>
      </div>

      <div>
        <label htmlFor="location" className={label}>場所（任意）</label>
        <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord / 豊中キャンパス など" className={field} />
      </div>

      <div>
        <label htmlFor="description" className={label}>説明（任意）</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="話すこと、準備してほしいことなど" className={field} />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <button type="submit" disabled={!ready || submitting} className={`${btn.primary} w-full py-3`}>
        {submitting ? "作成中…" : "この会議で募集を始める"}
      </button>
    </form>
  );
}

/** 作成直後の招待リンク。ここでしか表示されない（DB にはハッシュだけが残る） */
function GuestLinks({
  created,
  onDone,
}: {
  created: { id: string; guests: { name: string; url: string }[] };
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="px-4 pt-3 pb-8 md:rounded-xl md:border md:border-line md:bg-white md:p-6">
      <p className="text-grass text-[13px] font-bold">会議を作りました</p>
      <h2 className="text-ink mt-0.5 text-lg font-bold">ゲストの招待リンク</h2>
      <p className="text-amber bg-amber-soft mt-2 rounded-lg px-3 py-2 text-[13px]">
        リンクはこの画面でしか表示されません。今コピーして、それぞれの相手に送ってください。
        （なくしたら会議ページの「外部ゲスト」で作り直せます）
      </p>
      <ul className="mt-3 space-y-2.5">
        {created.guests.map((g) => (
          <li key={g.url}>
            <p className="text-ink mb-1 text-[13px] font-semibold">{g.name}</p>
            <div className="flex gap-2">
              <input readOnly value={g.url} onFocus={(e) => e.target.select()} className={`${field} min-w-0 flex-1 text-[13px]`} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(g.url);
                  setCopied(g.url);
                }}
                className={`${btn.primary} shrink-0`}
              >
                {copied === g.url ? "コピー済み" : "コピー"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone} className={`${btn.primary} mt-5 w-full py-3`}>
        コピーしたので会議ページへ
      </button>
    </div>
  );
}
