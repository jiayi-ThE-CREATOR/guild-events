"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NameSelect from "@/components/NameSelect";
import RangesInput, { jstDate, rangesReady, toCandidateRanges, type RangeRow } from "@/components/RangesInput";
import PageHeader from "@/components/PageHeader";
import { btn, Dot, ErrorText, field, Note } from "@/components/ui";
import { MEETING_DEADLINE_HOURS, hoursLabel } from "@/lib/meetings";
import { MEMBERS } from "@/lib/members";
import { sizeLabel } from "@/lib/notify-email";
import { loadProfile } from "@/lib/profile";
import { MAX_UPLOAD_BYTES, uploadMeetingFiles } from "@/lib/upload";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 会議を作る。作った時点で募集中になり、選んだ時間が経つと自動で日時が決まる。
 * 日時がもう決まっているなら、募集をせずにその日時で決まった会議として作れる。
 */

const DURATIONS = [30, 60, 90, 120];

/** 日時を 30 分刻みの選択肢にするための値 */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
const hm = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;

export default function NewMeetingPage() {
  // 既定の日付・主催者は開いた時点・この端末の登録で決めたいので、描画はクライアントだけ
  const isClient = useIsClient();
  // ?fixed=1 は「決定済みの会議を作る」から来たとき
  const fixed = isClient && new URLSearchParams(window.location.search).get("fixed") === "1";
  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHeader title={fixed ? "決定済みの会議を作成" : "募集を作成"} />
      {isClient ? (
        <MeetingForm fixed={fixed} />
      ) : (
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      )}
    </div>
  );
}

function MeetingForm({ fixed }: { fixed: boolean }) {
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
  // 日時がもう決まっているときは募集をしない。日付と開始・終了（その日の 0:00 からの分）
  const [fixedDate, setFixedDate] = useState(() => jstDate(1));
  const [fixedStart, setFixedStart] = useState(13 * 60);
  const [fixedEnd, setFixedEnd] = useState(14 * 60);
  const fixedStartMs = Date.parse(`${fixedDate}T00:00:00+09:00`) + fixedStart * 60 * 1000;
  const fixedEndMs = Date.parse(`${fixedDate}T00:00:00+09:00`) + fixedEnd * 60 * 1000;
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 外部ゲスト（メンバー以外）。作成後に招待リンクを 1 回だけ表示する
  const [guests, setGuests] = useState<string[]>([]);
  // Google Meet リンクを作るか。主催者がマイページで Google Meet をつないでいるときだけ作れる
  const [meet, setMeet] = useState(true);
  // 一緒に付ける資料。会議を作ったあとに上げる（上げた人は主催者として記録）
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [meetHost, setMeetHost] = useState<{ member: string; connected: boolean } | null>(null);
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
    (fixed ? fixedDate !== "" && fixedEnd > fixedStart : rangesReady(ranges)) &&
    attachments.every((f) => f.size <= MAX_UPLOAD_BYTES);

  // 主催者が変わるたびに、Meet をつないでいるかを確かめる
  useEffect(() => {
    if (!organizer) return;
    let alive = true;
    fetch(`/api/meet?member=${encodeURIComponent(organizer)}`)
      .then((r) => r.json())
      .then((j) => alive && setMeetHost({ member: organizer, connected: !!j.connected }))
      .catch(() => alive && setMeetHost({ member: organizer, connected: false }));
    return () => {
      alive = false;
    };
  }, [organizer]);
  const meetReady = meetHost?.member === organizer && meetHost.connected;

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
          ...(fixed
            ? { fixed: { start: new Date(fixedStartMs).toISOString(), end: new Date(fixedEndMs).toISOString() } }
            : { durationMin, deadlineHours, ranges: toCandidateRanges(ranges) }),
          location,
          description,
          guests,
          meet: meet && meetReady,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (attachments.length > 0) {
        try {
          setUploading(`資料を上げています… 0/${attachments.length}`);
          await uploadMeetingFiles(json.id, attachments, organizer, (n) =>
            setUploading(`資料を上げています… ${n}/${attachments.length}`),
          );
        } catch (e) {
          // 会議はできているので先へ進む。資料は会議ページから上げ直せる
          window.alert(`会議は作りましたが、資料を上げられませんでした（${(e as Error).message}）。会議ページから追加してください。`);
        }
      }
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

      {fixed ? (
        <div>
          <span className={label}>日時{req}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="日付" type="date" value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} className={`${field} w-auto`} />
            <div className="flex items-center gap-2">
              <select
                aria-label="開始時刻"
                value={fixedStart}
                onChange={(e) => {
                  // 開始を動かしたら、長さを保ったまま終了も動かす
                  const next = Number(e.target.value);
                  setFixedEnd(Math.min(next + (fixedEnd - fixedStart > 0 ? fixedEnd - fixedStart : 60), 24 * 60));
                  setFixedStart(next);
                }}
                className={`${field} w-auto`}
              >
                {HALF_HOURS.map((x) => (
                  <option key={x} value={x}>{hm(x)}</option>
                ))}
              </select>
              <span className="text-ink-soft">–</span>
              <select aria-label="終了時刻" value={fixedEnd} onChange={(e) => setFixedEnd(Number(e.target.value))} className={`${field} w-auto`}>
                {[...HALF_HOURS, 24 * 60].filter((x) => x > fixedStart).map((x) => (
                  <option key={x} value={x}>{hm(x)}</option>
                ))}
              </select>
            </div>
          </div>
          <Note className="mt-1.5">募集をせず、この日時に決まった会議として作ります。作った時点のみんなの予定から出欠を出し、Discord には「決定」が流れます。</Note>
        </div>
      ) : (
      <>
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
      </>
      )}

      <div>
        <label htmlFor="location" className={label}>場所（任意）</label>
        <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord / 豊中キャンパス など" className={field} />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={meet && meetReady} disabled={!meetReady} onChange={(e) => setMeet(e.target.checked)} className="size-4" />
          <span className={`text-[13px] font-semibold ${meetReady ? "text-ink" : "text-ink-soft"}`}>Google Meet リンクを作る</span>
        </label>
        {organizer && meetHost?.member === organizer && !meetHost.connected && (
          <Note className="mt-1">
            主催者（{organizer}）が Google Meet をつないでいないので作れません。主催者が{" "}
            <Link href="/mypage" className="text-navy underline">マイページ</Link> でつなぐと作れるようになります。
          </Note>
        )}
      </div>

      <div>
        <label htmlFor="description" className={label}>説明（任意）</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="話すこと、準備してほしいことなど" className={field} />
      </div>

      <div>
        <span className={label}>資料（任意・{attachments.length}件）</span>
        {attachments.length > 0 && (
          <ul className="border-line divide-line mb-2 divide-y rounded-lg border bg-white">
            {attachments.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                <span className="text-ink min-w-0 flex-1 truncate">{f.name}</span>
                <span className={`shrink-0 ${f.size > MAX_UPLOAD_BYTES ? "text-amber font-semibold" : "text-ink-soft"}`}>
                  {f.size > MAX_UPLOAD_BYTES ? "50MB 超" : sizeLabel(f.size)}
                </span>
                <button type="button" aria-label={`${f.name}を外す`} onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-ink-soft px-1">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className={`${btn.secondary} cursor-pointer`}>
          ＋ ファイルを選ぶ
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              setAttachments([...attachments, ...(e.target.files ? [...e.target.files] : [])]);
              e.target.value = "";
            }}
          />
        </label>
        <Note className="mt-1.5">1 ファイル 50MB まで。会議を作ると、参加者にメールで知らせます。</Note>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <button type="submit" disabled={!ready || submitting} className={`${btn.primary} w-full py-3`}>
        {uploading ?? (submitting ? "作成中…" : fixed ? "この日時で会議を作る" : "この会議で募集を始める")}
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
