"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import MeetingEntry from "@/components/MeetingEntry";
import MembersBusyGrid from "@/components/MembersBusyGrid";
import PageHeader from "@/components/PageHeader";
import RangesInput, { fromCandidateRanges, rangesReady, toCandidateRanges, type RangeRow } from "@/components/RangesInput";
import { btn, Dot, DOT, Dropdown, ErrorText, field, Menu, Note, Panel, SectionTitle, Segmented, Tag } from "@/components/ui";
import { downloadIcs, googleCalendarUrl, outlookLiveUrl, outlookOffice365Url } from "@/lib/calendar";
import { fullDateTime, timeOnly } from "@/lib/format";
import { labelOf } from "@/lib/guests";
import { durationLabel, hoursLabel, MEETING_DEADLINE_HOURS, type ParticipantState } from "@/lib/meetings";
import { meetingRanges, rangeLabel, type CandidateRange } from "@/lib/ranges";
import { useProfile } from "@/lib/profile";
import type { SlotResult } from "@/lib/slots";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 会議の詳細（メンバー向け）。
 * 上から：見出し（状態・主催・会議名・要点 1 行・⋯メニュー）→ 開いた操作パネル →
 * 募集中は「あなた」の 1 行と、候補（リスト／表）・参加者の 2 段組み。
 * 決定後は決まった日時と出欠を 1 ブロックにまとめる。
 * めったに使わない操作（延長・日時の変更・ゲスト）は「⋯」から開くパネルにする。
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

type PanelKind = "entry" | "extend" | "reschedule" | "guests";

const iso = (ms: number) => new Date(ms).toISOString();

const STATE_LABEL: Record<ParticipantState, string> = {
  connected: "カレンダー",
  manual: "手入力",
  unconnected: "未登録",
  unreadable: "読み込めない",
  declined: "不参加",
};

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const isClient = useIsClient();
  const profile = useProfile();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  // 「ほかに全員がそろう時間」から押した時間。日時の変更パネルに入れる
  const [picked, setPicked] = useState<number | null>(null);

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

  const refresh = useCallback(async () => setDetail(await fetchDetail()), [fetchDetail]);

  async function post(path: string, body: unknown) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <div className="md:mx-auto md:max-w-5xl">
        <PageHeader title="会議" />
        <div className="px-4 py-6 md:px-0">
          {error ? <ErrorText>{error}</ErrorText> : <Note className="py-10 text-center">みんなのカレンダーを確認中…</Note>}
        </div>
      </div>
    );
  }

  const { meeting: m, participants, preview } = detail;
  const label = (key: string) => labelOf(detail.labels, key);
  const ranges = meetingRanges(m);
  const me = isClient && profile ? participants.find((p) => p.name === profile.name) : undefined;
  const decided =
    m.status === "confirmed" && m.confirmed_start
      ? { start: Date.parse(m.confirmed_start), end: Date.parse(m.confirmed_start) + m.duration_min * 60 * 1000 }
      : null;

  const menuItems = [
    ...(m.status === "open" && me && me.state !== "declined" ? [{ label: "予定を手入力する", onClick: () => setPanel("entry") }] : []),
    ...(m.status === "confirmed" ? [{ label: "日時を変更する", onClick: () => setPanel("reschedule") }] : []),
    { label: m.status === "open" ? "募集を延長する" : "募集をやり直す", onClick: () => setPanel("extend") },
    ...(m.status !== "failed" ? [{ label: "外部ゲストを招く・管理", onClick: () => setPanel("guests") }] : []),
  ];

  return (
    <div className="md:mx-auto md:max-w-5xl">
      <PageHeader title="会議" />
      <div className="px-4 pt-3 pb-10 md:px-0 md:pt-1">
        {/* 見出し */}
        <header className="border-line border-b pb-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {m.status === "open" && <Tag tone="amber">募集中</Tag>}
                {m.status === "confirmed" && <Tag tone="grass">決定</Tag>}
                {m.status === "failed" && <Tag tone="muted">不成立</Tag>}
                <span className="text-ink-soft text-[13px]">主催 {m.organizer}</span>
              </div>
              <h1 className="text-ink mt-1 text-xl leading-snug font-bold md:text-2xl">{m.title}</h1>
              <p className="text-ink-soft mt-1 text-[13px] leading-relaxed">
                {durationLabel(m.duration_min)} · {ranges.map(rangeLabel).join(" / ")}
                {m.location && ` · ${m.location}`}
                {m.status === "open" && (
                  <>
                    {" · "}
                    <span className="text-ink font-semibold whitespace-nowrap">{fullDateTime(m.deadline)} 結果発表</span>
                  </>
                )}
              </p>
              {m.description && <p className="text-ink mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{m.description}</p>}
            </div>
            <Menu items={menuItems} />
          </div>
        </header>

        {/* 「⋯」などから開いた操作 */}
        {panel === "entry" && profile && (
          <Panel title="この会議の予定を手入力" onClose={() => setPanel(null)}>
            <MeetingEntry
              ranges={ranges}
              loadUrl={`/api/meetings/${m.id}/entry?member=${encodeURIComponent(profile.name)}`}
              saveUrl={`/api/meetings/${m.id}/entry`}
              saveBody={{ member: profile.name }}
              onSaved={refresh}
            />
          </Panel>
        )}
        {panel === "extend" && (
          <Panel title={m.status === "open" ? "募集を延長する" : "募集をやり直す"} onClose={() => setPanel(null)}>
            <ExtendForm meeting={m} onDone={async () => { setPanel(null); await refresh(); }} />
          </Panel>
        )}
        {panel === "reschedule" && m.status === "confirmed" && (
          <Panel title="日時を変更する" onClose={() => { setPanel(null); setPicked(null); }}>
            <RescheduleForm
              key={picked ?? "none"}
              meeting={m}
              picked={picked}
              onDone={async () => { setPanel(null); setPicked(null); await refresh(); }}
            />
          </Panel>
        )}
        {panel === "guests" && (
          <Panel title="外部ゲスト" onClose={() => setPanel(null)}>
            <GuestsPanel meetingId={m.id} onChange={refresh} />
          </Panel>
        )}

        {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}

        {m.status === "open" && (
          <>
            <YouBar
              me={me}
              hasProfile={isClient && !!profile}
              saving={saving}
              onEntry={() => setPanel(panel === "entry" ? null : "entry")}
              onDecline={(declined) => profile && post("decline", { member: profile.name, declined })}
            />
            <div className="mt-4 grid gap-6 md:grid-cols-[1fr_320px]">
              <Candidates meeting={m} preview={preview} label={label} />
              <aside className="md:border-line md:border-l md:pl-6">
                <People participants={participants} label={label} onGuests={() => setPanel("guests")} />
              </aside>
            </div>
          </>
        )}

        {m.status === "confirmed" && m.confirmed_start && decided && (
          <ConfirmedBlock
            meeting={m}
            participants={participants}
            label={label}
            rsvpOpen={detail.rsvpOpen}
            member={isClient && profile ? profile.name : null}
            saving={saving}
            onRsvp={(attending) => profile && post("rsvp", { member: profile.name, attending })}
            onPick={(start) => {
              setPicked(start);
              setPanel("reschedule");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            decided={decided}
          />
        )}

        {m.status === "failed" && (
          <>
            <div className="border-line mt-4 rounded-xl border border-dashed px-4 py-5 text-center">
              <p className="text-ink text-sm">
                候補の中に、{Math.max((m.confirmed_total ?? 1) - 1, 1)}人以上がそろう時間がありませんでした。
              </p>
              <button type="button" onClick={() => setPanel("extend")} className={`${btn.secondary} mt-3`}>
                候補を変えて募集をやり直す
              </button>
            </div>
            <div className="mt-6">
              <People participants={participants} label={label} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── 募集中 ───────── */

/** 自分の状態を 1 行で。操作はボタンで横に並べる */
function YouBar({
  me,
  hasProfile,
  saving,
  onEntry,
  onDecline,
}: {
  me: { name: string; state: ParticipantState } | undefined;
  hasProfile: boolean;
  saving: boolean;
  onEntry: () => void;
  onDecline: (declined: boolean) => void;
}) {
  if (!hasProfile) {
    return (
      <Note className="mt-3">
        参加者の方は <Link href="/mypage" className="text-navy underline">マイページ</Link> で名前を選ぶと、予定の手入力や「不参加」ができます。
      </Note>
    );
  }
  if (!me) return null;
  const text =
    me.state === "declined"
      ? "「不参加」で回答しています"
      : me.state === "connected"
        ? "カレンダーから自動で読んでいます"
        : me.state === "manual"
          ? "手入力した予定で計算しています"
          : me.state === "unreadable"
            ? "カレンダーを読み込めていません"
            : "予定が登録されていません";
  return (
    <div className="bg-navy-soft/60 mt-3 rounded-xl px-3.5 py-2.5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <p className="text-ink flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Dot className={DOT[me.state]} />
          <span>
            あなた：<b>{text}</b>
          </span>
        </p>
        <div className="flex gap-2">
          {me.state === "declined" ? (
            <button type="button" disabled={saving} onClick={() => onDecline(false)} className={btn.secondary}>
              やっぱり参加できる
            </button>
          ) : (
            <>
              <button type="button" onClick={onEntry} className={btn.secondary}>予定を手入力</button>
              <button type="button" disabled={saving} onClick={() => onDecline(true)} className={btn.secondary}>不参加にする</button>
            </>
          )}
        </div>
      </div>
      {(me.state === "unconnected" || me.state === "unreadable") && (
        <Note className="mt-1.5">
          {me.state === "unreadable"
            ? "マイページでカレンダーを一度オフにして、つなぎ直してください（Google は同意画面のチェックをすべてオンに）。"
            : "マイページでカレンダーをつなぐか毎週の予定を入れる、または「予定を手入力」で塗ると計算に入ります。"}
        </Note>
      )}
    </div>
  );
}

/** 「今の時点の候補」をリストか表で。リストは 5 件を超えたら折りたたむ */
const PREVIEW_LIMIT = 5;

function Candidates({
  meeting: m,
  preview,
  label,
}: {
  meeting: Meeting;
  preview: Detail["preview"];
  label: (k: string) => string;
}) {
  const [view, setView] = useState<"list" | "table">("list");
  const [showAll, setShowAll] = useState(false);
  const result = preview?.result;
  const summary = !result
    ? undefined
    : result.total === 0
      ? "予定が登録された人がまだいません"
      : result.available === null || result.windows.length === 0
        ? "そろう時間なし"
        : result.available === result.total
          ? `全員そろう ${result.windows.length}件`
          : `${result.available}/${result.total}人 ${result.windows.length}件`;

  return (
    <section>
      <SectionTitle
        title="今の時点の候補"
        meta={summary}
        right={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "リスト" },
              { value: "table", label: "表" },
            ]}
          />
        }
      />
      {view === "table" ? (
        <MembersBusyGrid meetingId={m.id} ranges={meetingRanges(m)} />
      ) : result && result.available !== null && result.windows.length > 0 ? (
        <>
          {result.available !== result.total && (
            <p className="text-amber mb-1.5 text-[13px]">全員はそろいません。1人欠けの時間を出しています。</p>
          )}
          <ul className="border-line divide-line divide-y overflow-hidden rounded-lg border bg-white">
            {(showAll ? result.windows : result.windows.slice(0, PREVIEW_LIMIT)).map((w, i) => (
              <TimeRow key={w.start} start={w.start} end={w.end} right={i === 0 && <Tag tone="grass">今なら決まる</Tag>} />
            ))}
          </ul>
          {result.windows.length > PREVIEW_LIMIT && (
            <button type="button" onClick={() => setShowAll(!showAll)} className={`${btn.text} mt-1.5`}>
              {showAll ? "閉じる" : `ほか ${result.windows.length - PREVIEW_LIMIT}件を表示`}
            </button>
          )}
          <Note className="mt-1">
            {fullDateTime(m.deadline)} の結果発表で、最新の予定から一番早い時間に決まります。各時間帯の中なら {durationLabel(m.duration_min)} をどこに入れても大丈夫です。
          </Note>
        </>
      ) : (
        <p className="border-line text-ink-soft rounded-lg border border-dashed px-4 py-5 text-center text-sm">
          {result && result.total > 0
            ? `今のところ、${result.total}人中 ${Math.max(result.total - 1, 1)}人以上がそろう時間はありません`
            : "予定が登録された参加者がまだいません"}
        </p>
      )}
      {preview && <Excluded unconnected={preview.unconnected.map(label)} unreadable={preview.unreadable.map(label)} />}
    </section>
  );
}

function TimeRow({ start, end, right }: { start: number; end: number; right?: React.ReactNode }) {
  const [day, time] = [fullDateTime(iso(start)).split("）")[0] + "）", `${timeOnly(iso(start))}–${timeOnly(iso(end))}`];
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="text-ink-soft w-20 shrink-0 text-[13px]">{day}</span>
      <span className="text-ink flex-1 text-[15px] font-semibold tabular-nums">{time}</span>
      {right}
    </li>
  );
}

/** 参加者を色の点つきの小さなラベルで並べる。上に状態ごとの人数 */
function People({
  participants,
  label,
  onGuests,
}: {
  participants: Detail["participants"];
  label: (k: string) => string;
  onGuests?: () => void;
}) {
  const states: ParticipantState[] = ["connected", "manual", "unconnected", "unreadable", "declined"];
  const active = participants.filter((p) => p.state !== "declined");
  const entered = active.filter((p) => p.state === "connected" || p.state === "manual").length;
  return (
    <section>
      <SectionTitle
        title="参加者"
        meta={`${participants.length}人 · 予定入力 ${entered}/${active.length}`}
        right={onGuests && <button type="button" onClick={onGuests} className={btn.text}>＋ ゲスト</button>}
      />
      <div className="text-ink-soft mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {states.map((s) => {
          const n = participants.filter((p) => p.state === s).length;
          return n === 0 ? null : (
            <span key={s} className="flex items-center gap-1">
              <Dot className={DOT[s]} />
              {STATE_LABEL[s]} {n}
            </span>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {participants.map((p) => (
          <li
            key={p.name}
            title={STATE_LABEL[p.state]}
            className={`border-line flex items-center gap-1.5 rounded-full border bg-white py-1 pr-3 pl-2.5 text-[13px] ${
              p.state === "declined" ? "text-ink-soft line-through" : "text-ink"
            }`}
          >
            <Dot className={DOT[p.state]} />
            {label(p.name)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Excluded({ unconnected, unreadable }: { unconnected: string[]; unreadable: string[] }) {
  if (unconnected.length === 0 && unreadable.length === 0) return null;
  return (
    <Note className="mt-2">
      {unconnected.length > 0 && <>予定未登録で計算に入っていない人：{unconnected.join("、")}。</>}
      {unreadable.length > 0 && <>カレンダーを読み込めず計算に入っていない人：{unreadable.join("、")}。</>}
    </Note>
  );
}

/* ───────── 決定済み ───────── */

function ConfirmedBlock({
  meeting: m,
  participants,
  label,
  rsvpOpen,
  member,
  saving,
  onRsvp,
  onPick,
  decided,
}: {
  meeting: Meeting;
  participants: Detail["participants"];
  label: (k: string) => string;
  rsvpOpen: boolean;
  member: string | null;
  saving: boolean;
  onRsvp: (attending: boolean) => void;
  onPick: (start: number) => void;
  decided: { start: number; end: number };
}) {
  const [extra, setExtra] = useState<"alt" | "table" | null>(null);
  const calendarItem = {
    id: m.id,
    title: m.title,
    description: m.description,
    location: m.location,
    event_date: m.confirmed_start!,
    duration_min: m.duration_min,
  };
  const attendees = m.attendees ?? [];
  const declined = participants.filter((p) => p.state === "declined").map((p) => p.name);
  const absent = participants.map((p) => p.name).filter((n) => !attendees.includes(n) && !declined.includes(n));
  const reasonOf = (name: string) =>
    m.excluded.includes(name) ? "予定未登録" : (m.unreadable ?? []).includes(name) ? "読み込めず" : "予定あり";
  const attending = member ? attendees.includes(member) : false;

  return (
    <>
      <section className="border-grass/40 bg-grass-soft/50 mt-4 rounded-xl border px-4 py-3.5">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
          <div className="flex-1">
            <p className="text-grass text-xs font-bold">この日時に決まりました</p>
            <p className="text-ink text-xl font-bold whitespace-nowrap tabular-nums">
              {fullDateTime(m.confirmed_start!)}–{timeOnly(iso(decided.end))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dropdown
              label="カレンダーに追加"
              items={[
                { label: "Google カレンダー", href: googleCalendarUrl(calendarItem) },
                { label: "iPhone・Mac（.ics）", onClick: () => downloadIcs(calendarItem) },
                { label: "Outlook（個人）", href: outlookLiveUrl(calendarItem) },
                { label: "Outlook（Office365）", href: outlookOffice365Url(calendarItem) },
              ]}
            />
            {rsvpOpen && member && (
              attending ? (
                <button type="button" disabled={saving} onClick={() => onRsvp(false)} className={btn.secondary}>参加をやめる</button>
              ) : (
                <button type="button" disabled={saving} onClick={() => onRsvp(true)} className={btn.primary}>参加する</button>
              )
            )}
          </div>
        </div>
        {m.attendees ? (
          <dl className="mt-3 grid gap-1.5 text-sm">
            <AttendanceRow tone="text-grass" label={`参加できる ${attendees.length}`} names={attendees.map(label)} />
            <AttendanceRow tone="text-kyoto" label={`できない ${absent.length}`} names={absent.map((n) => `${label(n)}（${reasonOf(n)}）`)} />
            <AttendanceRow tone="text-ink-soft" label={`不参加 ${declined.length}`} names={declined.map(label)} />
          </dl>
        ) : (
          <Note className="mt-2">参加者 {participants.length}人中 {m.confirmed_available}人が参加できます</Note>
        )}
        {rsvpOpen && !member && (
          <Note className="mt-2">
            <Link href="/mypage" className="text-navy underline">マイページ</Link> で名前を選ぶと、参加登録できます。
          </Note>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {rsvpOpen && (
          <button type="button" onClick={() => setExtra(extra === "alt" ? null : "alt")} className={extra === "alt" ? btn.primary : btn.secondary}>
            ほかに全員がそろう時間
          </button>
        )}
        <button type="button" onClick={() => setExtra(extra === "table" ? null : "table")} className={extra === "table" ? btn.primary : btn.secondary}>
          みんなの予定（表）
        </button>
      </div>
      {extra === "alt" && <Alternatives meeting={m} onPick={onPick} />}
      {extra === "table" && (
        <div className="mt-3">
          <MembersBusyGrid meetingId={m.id} ranges={meetingRanges(m)} decided={decided} />
        </div>
      )}
    </>
  );
}

function AttendanceRow({ tone, label, names }: { tone: string; label: string; names: string[] }) {
  return (
    <div className="flex gap-3">
      <dt className={`w-24 shrink-0 font-bold ${tone}`}>{label}</dt>
      <dd className="text-ink min-w-0 flex-1">{names.length > 0 ? names.join("、") : <span className="text-ink-soft">—</span>}</dd>
    </div>
  );
}

/**
 * 決まった時間のほかに、全員が参加できる時間（日程を動かしたいとき用）。
 * カレンダーを読むので、開いたときにあとから読み込む。
 */
function Alternatives({ meeting: m, onPick }: { meeting: Meeting; onPick: (start: number) => void }) {
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
    <section className="mt-3">
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Note className="py-4 text-center">みんなのカレンダーを確認中…</Note>}
      {data && data.windows.length === 0 && (
        <Note className="py-3">ほかに全員（{data.total}人）がそろう時間はありません</Note>
      )}
      {data && data.windows.length > 0 && (
        <>
          <ul className="border-line divide-line divide-y overflow-hidden rounded-lg border bg-white">
            {data.windows.map((w) => (
              <TimeRow
                key={w.start}
                start={w.start}
                end={w.end}
                right={<button type="button" onClick={() => onPick(w.start)} className={btn.text}>この時間に変える</button>}
              />
            ))}
          </ul>
          <Note className="mt-1">全員 {data.total}人。今のカレンダーで計算しています（決定後に入った予定も反映）。</Note>
        </>
      )}
      {data && (
        <Excluded
          unconnected={data.unconnected.map((k) => labelOf(data.labels, k))}
          unreadable={data.unreadable.map((k) => labelOf(data.labels, k))}
        />
      )}
    </section>
  );
}

/* ───────── 「⋯」から開くパネルの中身 ───────── */

type GuestRow = { id: string; name: string; state: ParticipantState };

/**
 * 外部ゲスト。名前を入れて招待リンクを作り、相手に送る。
 * リンクは作った直後にだけ出る（DB にはハッシュしか残らない）。なくしたら作り直す。
 */
function GuestsPanel({ meetingId, onChange }: { meetingId: string; onChange: () => Promise<void> }) {
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

  return (
    <div className="space-y-3">
      <Note>
        メンバー以外の人を招けます。名前を入れて招待リンクを作り、相手に送ってください。
        ゲストのページには、会議の内容・候補・決まった日時と人数だけが出ます（メンバーの名前は出ません）。
      </Note>
      {error && <ErrorText>{error}</ErrorText>}
      {issued && (
        <div className="bg-grass-soft rounded-lg p-3">
          <p className="text-ink text-[13px] font-bold">{issued.name} さんの招待リンク（閉じると二度と表示されません）</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={issued.url} onFocus={(e) => e.target.select()} className={`${field} min-w-0 flex-1 text-[13px]`} />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.url);
                setCopied(true);
              }}
              className={`${btn.primary} shrink-0`}
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ゲストの名前（例：教科書センター 山田さん）" maxLength={50} className={`${field} min-w-0 flex-1`} />
        <button type="submit" disabled={!name.trim() || busy} className={`${btn.primary} shrink-0`}>
          招待リンクを作る
        </button>
      </form>
      {guests && guests.length > 0 && (
        <ul className="border-line divide-line divide-y overflow-hidden rounded-lg border">
          {guests.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="text-ink flex min-w-0 flex-1 items-center gap-2 text-sm">
                <Dot className={DOT[g.state]} />
                <span className="truncate">{g.name}</span>
                <span className="text-ink-soft text-xs">{g.state === "unconnected" ? "未回答" : STATE_LABEL[g.state]}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => reissue(g)} className={btn.text}>リンクを作り直す</button>
              <button type="button" disabled={busy} onClick={() => remove(g)} className="text-ink-soft text-[13px] hover:underline disabled:opacity-40">外す</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 募集の延長。どの状態の会議でも、結果発表を今から何時間後かに置き直し、候補も入れ直せる。
 * 決まっていた・不成立だった会議は募集中に戻る（決まっていた日時と出欠は取り消し）。
 */
function ExtendForm({ meeting: m, onDone }: { meeting: Meeting; onDone: () => Promise<void> }) {
  const [hours, setHours] = useState(48);
  const [ranges, setRanges] = useState<RangeRow[]>(() => fromCandidateRanges(meetingRanges(m)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-3">
      <Note>
        {m.status === "open"
          ? "結果発表を遅らせます。候補も入れ直せます。"
          : "募集中に戻して、新しい結果発表の時刻にもう一度自動で決めます。決まっていた日時と出欠は取り消しになります（各自の予定はそのまま使います）。"}
      </Note>
      <label className="block">
        <span className="text-ink mb-1 block text-[13px] font-semibold">結果発表（今から）</span>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={field}>
          {MEETING_DEADLINE_HOURS.map((h) => (
            <option key={h} value={h}>{hoursLabel(h)}</option>
          ))}
        </select>
      </label>
      <div>
        <span className="text-ink mb-1 block text-[13px] font-semibold">候補（{ranges.length}件）</span>
        <RangesInput ranges={ranges} onChange={setRanges} field={field} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" disabled={saving || !rangesReady(ranges)} onClick={submit} className={`${btn.primary} w-full`}>
        {saving ? "更新中…" : m.status === "open" ? "延長する" : "募集をやり直す"}
      </button>
    </div>
  );
}

/** 日時を 30 分刻みの選択肢にするための値 */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);

function jstParts(ms: number) {
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  return { date: jst.toISOString().slice(0, 10), min: jst.getUTCHours() * 60 + jst.getUTCMinutes() };
}

/**
 * 決まった日時を手で変える。日付と開始時刻は自由（30 分刻み）。
 * 変えると、新しい時間で出欠を計算し直し、あとからの参加登録は消える。Discord にも流れる。
 */
function RescheduleForm({
  meeting: m,
  picked,
  onDone,
}: {
  meeting: Meeting;
  picked: number | null;
  onDone: () => Promise<void>;
}) {
  const [initial] = useState(() => jstParts(picked ?? Date.parse(m.confirmed_start ?? "")));
  const [date, setDate] = useState(initial.date);
  const [min, setMin] = useState(initial.min);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hm = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;

  async function submit() {
    const start = Date.parse(`${date}T00:00:00+09:00`) + min * 60 * 1000;
    const text = `${fullDateTime(new Date(start).toISOString())}〜 に変更します。\n新しい時間で出欠を計算し直し、Discord にも流れます。よろしいですか？`;
    if (!window.confirm(text)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${m.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: new Date(start).toISOString() }),
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
    <div className="space-y-3">
      <Note>候補の外の日時にもできます。新しい時間でみんなの予定から出欠を計算し直します（あとから押した「参加する／やめる」は消えます）。</Note>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-auto`} />
        <select aria-label="開始時刻" value={min} onChange={(e) => setMin(Number(e.target.value))} className={`${field} w-auto`}>
          {HALF_HOURS.map((x) => (
            <option key={x} value={x}>{hm(x)}</option>
          ))}
        </select>
        <span className="text-ink-soft text-[13px]">から {durationLabel(m.duration_min)}</span>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" disabled={saving || !date} onClick={submit} className={`${btn.primary} w-full`}>
        {saving ? "変更中…" : "この日時に変更する"}
      </button>
    </div>
  );
}
