"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import CalendarLinks from "@/components/CalendarLinks";
import PageHeader from "@/components/PageHeader";
import MeetingEntry from "@/components/MeetingEntry";
import RangesInput, { fromCandidateRanges, rangesReady, toCandidateRanges, type RangeRow } from "@/components/RangesInput";
import { fullDateTime, timeOnly } from "@/lib/format";
import { labelOf } from "@/lib/guests";
import { durationLabel, hoursLabel, MEETING_DEADLINE_HOURS, type ParticipantState } from "@/lib/meetings";
import { meetingRanges, rangeLabel, type CandidateRange } from "@/lib/ranges";
import { useProfile } from "@/lib/profile";
import type { SlotResult } from "@/lib/slots";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 会議の詳細。募集中は「今のカレンダーで決めたらどうなるか」の候補と、
 * 参加者本人の「不参加にする」ボタンを出す。決定後は日時とカレンダー登録の導線。
 */

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  organizer: string;
  participants: string[];
  duration_min: number;
  from_date: string;
  days: number;
  day_start_min: number;
  day_end_min: number;
  ranges: CandidateRange[] | null;
  deadline: string;
  status: "open" | "confirmed" | "failed";
  confirmed_start: string | null;
  confirmed_available: number | null;
  confirmed_total: number | null;
  excluded: string[];
  unreadable: string[] | null;
  attendees: string[] | null;
};

type Detail = {
  meeting: Meeting;
  participants: { name: string; state: ParticipantState }[];
  preview: { result: SlotResult; unconnected: string[]; unreadable: string[] } | null;
  rsvpOpen: boolean;
  /** 外部ゲストのキー（guest:<id>）→「名前（ゲスト）」 */
  labels: Record<string, string>;
};

const iso = (ms: number) => new Date(ms).toISOString();

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const isClient = useIsClient();
  const profile = useProfile();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/meetings/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json as Detail;
  }, [id]);

  useEffect(() => {
    let alive = true;
    fetchDetail()
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchDetail]);

  async function setAttending(attending: boolean) {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: profile.name, attending }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDetail(await fetchDetail());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setDeclined(declined: boolean) {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: profile.name, declined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDetail(await fetchDetail());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <div className="md:mx-auto md:max-w-3xl">
        <PageHeader title="会議" />
        {error ? (
          <p className="text-amber bg-amber-soft m-4 rounded-xl p-3 text-xs md:mx-0">{error}</p>
        ) : (
          <p className="text-ink-soft py-16 text-center text-xs">
            みんなのカレンダーを確認中…
          </p>
        )}
      </div>
    );
  }

  const { meeting: m, participants, preview } = detail;
  const label = (key: string) => labelOf(detail.labels, key);
  const me = isClient && profile ? participants.find((p) => p.name === profile.name) : undefined;

  return (
    <div className="md:mx-auto md:max-w-3xl">
      <PageHeader title="会議" />
      <div className="px-4 pt-4 pb-6 md:px-0 md:pt-2">
        <div className="mb-2">
          {m.status === "open" && <Badge tone="amber">募集中</Badge>}
          {m.status === "confirmed" && <Badge tone="grass">決定</Badge>}
          {m.status === "failed" && <Badge tone="muted">不成立</Badge>}
        </div>
        <h1 className="text-ink text-xl leading-snug font-bold md:text-3xl">{m.title}</h1>

        <dl className="border-line mt-4 divide-y divide-[var(--color-line)] rounded-2xl border bg-white text-sm">
          <Row label="主催">{m.organizer}</Row>
          <Row label="長さ">{durationLabel(m.duration_min)}</Row>
          <Row label="候補">
            {meetingRanges(m).map((r, i) => (
              <span key={i} className="block">{rangeLabel(r)}</span>
            ))}
          </Row>
          <Row label="結果発表">{fullDateTime(m.deadline)}</Row>
          {m.location && <Row label="場所">{m.location}</Row>}
        </dl>
        {m.description && (
          <p className="text-ink-soft mt-4 text-sm leading-relaxed whitespace-pre-wrap">{m.description}</p>
        )}

        {error && <p className="text-amber bg-amber-soft mt-4 rounded-xl p-3 text-xs">{error}</p>}

        {m.status === "confirmed" && m.confirmed_start && (
          <section className="mt-6 space-y-4">
            <div className="bg-grass-soft rounded-2xl p-5 text-center">
              <p className="text-grass text-xs font-bold">この日時に決まりました</p>
              <p className="text-ink mt-1 text-xl font-bold md:text-2xl">
                {fullDateTime(m.confirmed_start)}〜
                {timeOnly(iso(Date.parse(m.confirmed_start) + m.duration_min * 60 * 1000))}
              </p>
              <p className="text-ink-soft mt-1 text-xs">
                {m.attendees
                  ? `参加者 ${participants.length}人中 ${m.attendees.length}人が参加できます`
                  : `参加者 ${participants.length}人中 ${m.confirmed_available}人が参加できます`}
              </p>
            </div>
            {isClient && m.attendees && detail.rsvpOpen && (
              <RsvpCard
                meeting={m}
                member={profile?.name ?? null}
                saving={saving}
                onChange={setAttending}
              />
            )}
            {m.attendees && <AttendanceLists meeting={m} participants={participants} label={label} />}
            {detail.rsvpOpen && <Alternatives meeting={m} />}
            {!m.attendees && <Excluded names={m.excluded.map(label)} settled />}
            <CalendarLinks
              event={{
                id: m.id,
                title: m.title,
                description: m.description,
                location: m.location,
                event_date: m.confirmed_start,
                duration_min: m.duration_min,
              }}
            />
          </section>
        )}

        {m.status === "failed" && (
          <section className="mt-6">
            <p className="border-line text-ink-soft rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
              候補の範囲の中に、{Math.max((m.confirmed_total ?? 1) - 1, 1)}人以上がそろう時間がありませんでした。
              <br />
              範囲や時間帯を広げて、会議を作り直してください。
              <br />
              <Link href="/schedule/new" className="text-navy mt-2 inline-block underline">
                会議を作成する
              </Link>
            </p>
            <Excluded names={m.excluded.map(label)} settled />
            <Excluded names={(m.unreadable ?? []).map(label)} settled unreadable />
          </section>
        )}

        {m.status === "open" && (
          <>
            {me && (
              <section className="border-line mt-6 rounded-2xl border bg-white p-4">
                {me.state === "declined" ? (
                  <>
                    <p className="text-ink text-sm font-bold">「不参加」で回答しています</p>
                    <p className="text-ink-soft mt-1 text-xs">この会議の日時の計算には入りません。</p>
                    <button type="button" disabled={saving} onClick={() => setDeclined(false)} className="border-line text-ink mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-40">
                      やっぱり参加できる
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-ink text-sm font-bold">
                      {me.state === "connected"
                        ? "あなたのカレンダーから空き時間を読んでいます"
                        : me.state === "manual"
                          ? "手動で入れた予定で計算しています"
                          : me.state === "unreadable"
                            ? "あなたのカレンダーを読み込めていません"
                            : "まだ予定が登録されていません"}
                    </p>
                    <p className="text-ink-soft mt-1 text-xs">
                      {me.state === "connected" || me.state === "manual" ? (
                        "何もしなくて大丈夫です。カレンダーと違う予定があれば下の「この会議の予定」で直せます。どの日時でも出られない場合は「不参加にする」を押してください。"
                      ) : me.state === "unreadable" ? (
                        <>
                          <Link href="/mypage" className="text-navy underline">マイページ</Link>
                          で一度オフにしてからつなぎ直してください（Google は同意画面のチェックをすべてオンに）。
                        </>
                      ) : (
                        <>
                          <Link href="/mypage" className="text-navy underline">マイページ</Link>
                          でカレンダーをつなぐか毎週の予定を入れる、または下の「この会議の予定」を塗ると、結果発表のときに計算に入ります。
                        </>
                      )}
                    </p>
                    <button type="button" disabled={saving} onClick={() => setDeclined(true)} className="border-line text-ink-soft hover:border-ink-soft mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold transition-colors disabled:opacity-40">
                      不参加にする
                    </button>
                  </>
                )}
              </section>
            )}
            {me && me.state !== "declined" && profile && (
              <MeetingEntry
                ranges={meetingRanges(m)}
                loadUrl={`/api/meetings/${m.id}/entry?member=${encodeURIComponent(profile.name)}`}
                saveUrl={`/api/meetings/${m.id}/entry`}
                saveBody={{ member: profile.name }}
                onSaved={async () => setDetail(await fetchDetail())}
              />
            )}
            {isClient && !profile && (
              <p className="text-ink-soft mt-6 text-xs">
                参加者の方は{" "}
                <Link href="/mypage" className="text-navy underline">マイページ</Link>{" "}
                で名前を選ぶと「不参加にする」を押せます。
              </p>
            )}

            {preview && (
              <section className="mt-6">
                <h2 className="text-ink text-sm font-bold md:text-base">今の時点の候補</h2>
                <p className="text-ink-soft mt-1 mb-3 text-xs">
                  結果発表（{fullDateTime(m.deadline)}）のときに、みんなの最新のカレンダーで
                  もう一度計算し、一番早い時間に決まります。
                </p>
                <Preview result={preview.result} durationMin={m.duration_min} />
                <Excluded names={preview.unconnected.map(label)} />
                <Excluded names={preview.unreadable.map(label)} unreadable />
              </section>
            )}
          </>
        )}

        <ExtendSection meeting={m} onDone={async () => setDetail(await fetchDetail())} />

        {m.status !== "failed" && (
          <GuestsSection meetingId={m.id} onChange={async () => setDetail(await fetchDetail())} />
        )}

        {/* 決定後は「参加できる／できない」の 2 列が参加者一覧を兼ねる */}
        {!(m.status === "confirmed" && m.attendees) && (
        <section className="mt-8">
          <h2 className="text-ink mb-3 text-sm font-bold md:text-base">参加者（{participants.length}人）</h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {participants.map((p) => (
              <li key={p.name} className="border-line flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5">
                <span className="text-ink truncate text-sm">{label(p.name)}</span>
                {p.state === "connected" && <Badge tone="navy">カレンダー連携</Badge>}
                {p.state === "manual" && <Badge tone="navy">手動入力</Badge>}
                {p.state === "unconnected" && <Badge tone="outline">未登録</Badge>}
                {p.state === "unreadable" && <Badge tone="amber">読み込めない</Badge>}
                {p.state === "declined" && <Badge tone="muted">不参加</Badge>}
              </li>
            ))}
          </ul>
        </section>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="text-ink-soft w-16 shrink-0 text-xs leading-5">{label}</dt>
      <dd className="text-ink min-w-0 flex-1 leading-5">{children}</dd>
    </div>
  );
}

function Preview({ result, durationMin }: { result: SlotResult; durationMin: number }) {
  if (result.total === 0) {
    return (
      <p className="border-line text-ink-soft rounded-2xl border border-dashed p-5 text-center text-xs">
        カレンダーをつないでいる参加者がまだいません
      </p>
    );
  }
  if (result.available === null || result.windows.length === 0) {
    return (
      <p className="border-line text-ink-soft rounded-2xl border border-dashed p-5 text-center text-xs">
        今のところ、{result.total}人中 {Math.max(result.total - 1, 1)}人以上がそろう時間はありません
      </p>
    );
  }
  const everyone = result.available === result.total;
  return (
    <>
      <p className={`mb-2 rounded-xl p-3 text-xs ${everyone ? "bg-grass-soft text-grass" : "bg-amber-soft text-amber"}`}>
        {everyone
          ? `全員（${result.total}人）が参加できる時間があります`
          : `全員はそろいません。${result.total}人中 ${result.available}人が参加できる時間です`}
      </p>
      <ul className="space-y-2">
        {result.windows.map((w, i) => (
          <li key={w.start} className="border-line text-ink flex items-center justify-between gap-2 rounded-2xl border bg-white p-3.5 text-sm font-semibold">
            <span>
              {fullDateTime(iso(w.start))}〜{timeOnly(iso(w.end))}
            </span>
            {i === 0 && <Badge tone="grass">今なら決まる</Badge>}
          </li>
        ))}
      </ul>
      <p className="text-ink-soft mt-2 text-[11px]">
        各時間帯の中なら、{durationLabel(durationMin)}をどこに入れても大丈夫です
      </p>
    </>
  );
}

function Excluded({
  names,
  settled,
  unreadable,
}: {
  names: string[];
  settled?: boolean;
  unreadable?: boolean;
}) {
  if (names.length === 0) return null;
  return (
    <p className="text-ink-soft mt-3 text-[11px]">
      {names.join("、")} さんは
      {unreadable
        ? "カレンダーをつないでいますが読み込めなかった（権限が足りない・連携が切れた等）ため、"
        : "予定が登録されていない（カレンダーも手動の予定も無い）ため、"}
      {settled ? "計算に入っていません。" : "今は計算に入っていません。"}
    </p>
  );
}

/**
 * 決定した日時の出欠。3 列に分ける：
 * 参加できる（空いている）／参加できない（出たいが出られない。理由つき）／不参加（自分で不参加と回答）
 */
function AttendanceLists({
  label,
  meeting: m,
  participants,
}: {
  meeting: Meeting;
  participants: Detail["participants"];
  label: (key: string) => string;
}) {
  const attendees = m.attendees ?? [];
  const reasonOf = (name: string) =>
    m.excluded.includes(name)
      ? "予定未登録"
      : (m.unreadable ?? []).includes(name)
        ? "カレンダーを読み込めず"
        : "予定あり";
  const declined = participants.filter((p) => p.state === "declined").map((p) => p.name);
  const absent = participants
    .map((p) => p.name)
    .filter((name) => !attendees.includes(name) && !declined.includes(name));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="border-line rounded-2xl border bg-white p-4">
        <h2 className="text-grass text-sm font-bold">参加できる（{attendees.length}人）</h2>
        <ul className="mt-2 space-y-1.5">
          {attendees.map((name) => (
            <li key={name} className="text-ink text-sm">{label(name)}</li>
          ))}
        </ul>
      </div>
      <div className="border-line rounded-2xl border bg-white p-4">
        <h2 className="text-ink-soft text-sm font-bold">参加できない（{absent.length}人）</h2>
        {absent.length === 0 ? (
          <p className="text-ink-soft mt-2 text-xs">いません</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {absent.map((name) => (
              <li key={name} className="flex items-center justify-between gap-2">
                <span className="text-ink truncate text-sm">{label(name)}</span>
                <span className="text-ink-soft shrink-0 text-[11px]">{reasonOf(name)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-line rounded-2xl border bg-white p-4">
        <h2 className="text-ink-soft text-sm font-bold">不参加（{declined.length}人）</h2>
        {declined.length === 0 ? (
          <p className="text-ink-soft mt-2 text-xs">いません</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {declined.map((name) => (
              <li key={name} className="text-ink text-sm">{label(name)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


/** 決まった会議への参加登録。参加者に選ばれていなかった人も押せる。会議が終わるまで */
function RsvpCard({
  meeting: m,
  member,
  saving,
  onChange,
}: {
  meeting: Meeting;
  member: string | null;
  saving: boolean;
  onChange: (attending: boolean) => void;
}) {
  if (!member) {
    return (
      <p className="text-ink-soft text-xs">
        <Link href="/mypage" className="text-navy underline">マイページ</Link>
        で名前を選ぶと、この会議に参加登録できます。
      </p>
    );
  }
  const attending = (m.attendees ?? []).includes(member);
  return (
    <section className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
      <p className="text-ink text-sm font-bold">
        {attending ? "あなたは参加予定です" : "この会議に参加しますか？"}
      </p>
      {attending ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange(false)}
          className="border-line text-ink-soft rounded-xl border px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          参加をやめる
        </button>
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange(true)}
          className="bg-grass rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          参加する
        </button>
      )}
    </section>
  );
}

/**
 * 決まった時間のほかに、全員が参加できる時間の一覧（日程を動かしたいとき用）。
 * カレンダーを読むので、ページ本体とは別にあとから読み込む。
 */
function Alternatives({ meeting: m }: { meeting: Meeting }) {
  const [data, setData] = useState<{
    total: number;
    windows: { start: number; end: number }[];
    unconnected: string[];
    unreadable: string[];
    labels: Record<string, string>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meetings/${m.id}/alternatives`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (alive) setData(json);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [m.id]);

  return (
    <section className="border-line rounded-2xl border bg-white p-4">
      <h2 className="text-ink text-sm font-bold">ほかに全員が参加できる時間</h2>
      <p className="text-ink-soft mt-1 text-xs">
        決まった時間以外で、候補の中から今のカレンダーで計算しています（決定後に入った予定も反映）。
      </p>
      {error && <p className="text-amber mt-2 text-xs">{error}</p>}
      {!data && !error && <p className="text-ink-soft mt-3 text-xs">みんなのカレンダーを確認中…</p>}
      {data && data.windows.length === 0 && (
        <p className="text-ink-soft mt-3 text-xs">ほかに全員（{data.total}人）がそろう時間はありません</p>
      )}
      {data && data.windows.length > 0 && (
        <>
          <ul className="mt-3 space-y-1.5">
            {data.windows.map((w) => (
              <li key={w.start} className="text-ink text-sm font-semibold">
                {fullDateTime(iso(w.start))}〜{timeOnly(iso(w.end))}
              </li>
            ))}
          </ul>
          <p className="text-ink-soft mt-2 text-[11px]">
            全員 {data.total}人。各時間帯の中なら、{durationLabel(m.duration_min)}をどこに入れても大丈夫です
          </p>
        </>
      )}
      {data && <Excluded names={data.unconnected.map((k) => labelOf(data.labels, k))} />}
      {data && <Excluded names={data.unreadable.map((k) => labelOf(data.labels, k))} unreadable />}
    </section>
  );
}

type GuestRow = { id: string; name: string; state: ParticipantState };

/**
 * 外部ゲスト。名前を入れて招待リンクを作り、相手に送る。
 * リンクは作った直後にだけ出る（DB にはハッシュしか残らない）。なくしたら作り直す。
 */
function GuestsSection({ meetingId, onChange }: { meetingId: string; onChange: () => Promise<void> }) {
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/guests`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json.guests as GuestRow[];
  }, [meetingId]);

  useEffect(() => {
    let alive = true;
    load()
      .then((g) => alive && setGuests(g))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setGuests(await load());
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function show(guestName: string, url: string) {
    setIssued({ name: guestName, url });
    setCopied(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    await run(async () => {
      const res = await fetch(`/api/meetings/${meetingId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      show(name.trim(), json.url);
      setName("");
    });
  }

  async function reissue(g: GuestRow) {
    if (!window.confirm(`${g.name} さんの招待リンクを作り直しますか？\n今のリンクは使えなくなります。`)) return;
    await run(async () => {
      const res = await fetch(`/api/meetings/${meetingId}/guests/${g.id}/token`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      show(g.name, json.url);
    });
  }

  async function remove(g: GuestRow) {
    if (!window.confirm(`${g.name} さんをこの会議から外しますか？\n入れた予定やカレンダー連携も消えます。`)) return;
    await run(async () => {
      const res = await fetch(`/api/meetings/${meetingId}/guests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: g.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (issued?.name === g.name) setIssued(null);
    });
  }

  const stateLabel: Record<string, string> = {
    connected: "カレンダー連携",
    manual: "手動入力",
    unconnected: "未回答",
    declined: "不参加",
  };

  return (
    <section className="mt-8">
      <h2 className="text-ink mb-1 text-sm font-bold md:text-base">外部ゲスト</h2>
      <p className="text-ink-soft mb-3 text-xs">
        メンバー以外の人を招けます。名前を入れて招待リンクを作り、相手に送ってください。
        ゲストのページには、会議の内容・候補・決まった日時と人数だけが出ます（メンバーの名前は出ません）。
      </p>

      {error && <p className="text-amber bg-amber-soft mb-3 rounded-xl p-3 text-xs">{error}</p>}

      {issued && (
        <div className="bg-grass-soft mb-3 rounded-xl p-3">
          <p className="text-ink text-xs font-bold">{issued.name} さんの招待リンク（この画面を閉じると二度と表示されません）</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={issued.url} onFocus={(e) => e.target.select()} className="border-line min-w-0 flex-1 rounded-lg border bg-white px-2 py-1.5 text-xs" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.url);
                setCopied(true);
              }}
              className="bg-navy shrink-0 rounded-lg px-3 text-xs font-bold text-white"
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ゲストの名前（例：教科書センター 山田さん）"
          maxLength={50}
          className="border-line focus:border-navy min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm outline-none"
        />
        <button type="submit" disabled={!name.trim() || busy} className="bg-navy shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-40">
          招待リンクを作る
        </button>
      </form>

      {guests && guests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {guests.map((g) => (
            <li key={g.id} className="border-line flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5">
              <span className="text-ink truncate text-sm">{g.name}</span>
              <span className="flex items-center gap-2">
                <Badge tone={g.state === "unconnected" ? "outline" : g.state === "declined" ? "muted" : "navy"}>
                  {stateLabel[g.state] ?? g.state}
                </Badge>
                <button type="button" disabled={busy} onClick={() => reissue(g)} className="text-navy text-[11px] underline disabled:opacity-40">
                  リンクを作り直す
                </button>
                <button type="button" disabled={busy} onClick={() => remove(g)} className="text-ink-soft text-[11px] underline disabled:opacity-40">
                  外す
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 募集の延長。どの状態の会議でも、結果発表を今から何時間後かに置き直し、候補も入れ直せる。
 * 決まっていた・不成立だった会議は募集中に戻る（決まっていた日時と出欠は取り消し）。
 */
function ExtendSection({ meeting: m, onDone }: { meeting: Meeting; onDone: () => Promise<void> }) {
  const [hours, setHours] = useState(48);
  const [ranges, setRanges] = useState<RangeRow[]>(() => fromCandidateRanges(meetingRanges(m)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "border-line focus:border-navy text-ink w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none";

  async function submit() {
    if (saving || !rangesReady(ranges)) return;
    const warn =
      m.status === "confirmed" && m.confirmed_start
        ? `決まっている日時（${fullDateTime(m.confirmed_start)}〜）は取り消され、もう一度みんなの予定から決め直します。よろしいですか？`
        : m.status === "failed"
          ? "もう一度募集します。よろしいですか？"
          : `結果発表を今から${hoursLabel(hours)}にします。よろしいですか？`;
    if (!window.confirm(warn)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${m.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlineHours: hours, ranges: toCandidateRanges(ranges) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="border-line mt-8 rounded-2xl border bg-white p-4">
      <summary className="text-ink cursor-pointer text-sm font-bold">
        {m.status === "open" ? "募集を延長する" : "募集を延長してやり直す"}
      </summary>
      <p className="text-ink-soft mt-2 text-xs">
        {m.status === "open"
          ? "結果発表を遅らせます。候補も入れ直せます。"
          : "募集中に戻して、新しい結果発表の時刻にもう一度自動で決めます。決まっていた日時と出欠は取り消しになります（各自の予定はそのまま使います）。"}
      </p>
      <label className="text-ink mt-3 mb-1 block text-xs font-semibold" htmlFor={`extend-${m.id}`}>
        結果発表（今から）
      </label>
      <select id={`extend-${m.id}`} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={field}>
        {MEETING_DEADLINE_HOURS.map((h) => (
          <option key={h} value={h}>{hoursLabel(h)}</option>
        ))}
      </select>
      <p className="text-ink mt-3 mb-1 text-xs font-semibold">候補（{ranges.length}件）</p>
      <RangesInput ranges={ranges} onChange={setRanges} field={field} />
      {error && <p className="text-amber bg-amber-soft mt-3 rounded-xl p-3 text-xs">{error}</p>}
      <button
        type="button"
        disabled={saving || !rangesReady(ranges)}
        onClick={submit}
        className="bg-navy mt-4 w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {saving ? "更新中…" : "延長する"}
      </button>
    </details>
  );
}
