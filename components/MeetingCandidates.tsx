"use client";

import { useState } from "react";
import MembersBusyGrid from "@/components/MembersBusyGrid";
import { btn, Dropdown, Note, SectionTitle, Segmented, Tag } from "@/components/ui";
import { calendarMenu, withAddress, withMeet } from "@/lib/calendar";
import { fullDateTime, timeOnly } from "@/lib/format";
import { durationLabel } from "@/lib/meetings";
import { meetingRanges, type CandidateRange } from "@/lib/ranges";
import type { SlotResult } from "@/lib/slots";

/**
 * 募集中の会議の「今の時点の候補」（リスト／表）。会議ページとイベントのページ（日程調整中）で共用。
 * リストはそろう時間帯、表（MembersBusyGrid）は 30 分ごとに誰が予定ありか。
 */

/** 候補の表示に使う会議の項目（api/meetings/[id] の meeting） */
export type CandidateMeeting = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  address?: string | null;
  meet_url: string | null;
  duration_min: number;
  deadline: string;
  ranges: CandidateRange[] | null;
  from_date: string;
  days: number;
  day_start_min: number;
  day_end_min: number;
};

/** api/meetings/[id] の preview（募集中だけ） */
export type CandidatePreview = { result: SlotResult; unconnected: string[]; unreadable: string[] } | null;

const iso = (ms: number) => new Date(ms).toISOString();

/** 「今の時点の候補」をリストか表で。リストは 5 件を超えたら折りたたむ */
const PREVIEW_LIMIT = 5;

export function Candidates({
  meeting: m,
  preview,
  label,
}: {
  meeting: CandidateMeeting;
  preview: CandidatePreview;
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
          <ul className="border-line divide-line divide-y rounded-lg border bg-white">
            {(showAll ? result.windows : result.windows.slice(0, PREVIEW_LIMIT)).map((w, i) => (
              <TimeRow
                key={w.start}
                start={w.start}
                end={w.end}
                tag={i === 0 && <Tag tone="grass">今なら決まる</Tag>}
                right={<TentativeAdd meeting={m} start={w.start} />}
              />
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

/** 候補の時間を【仮】・空きのまま自分のカレンダーに入れる。時間帯の頭から会議の長さぶん */
function TentativeAdd({ meeting: m, start }: { meeting: CandidateMeeting; start: number }) {
  return (
    <Dropdown
      label="仮で追加"
      alignRight
      buttonClass={`${btn.text} shrink-0 text-[13px]`}
      items={calendarMenu(
        withMeet(
          withAddress({
            id: `${m.id}-${start}`,
            title: m.title,
            description: m.description,
            location: m.location,
            event_date: iso(start),
            duration_min: m.duration_min,
            tentative: true,
          }, m.address),
          m.meet_url,
        ),
      )}
    />
  );
}

export function TimeRow({
  start,
  end,
  tag,
  right,
}: {
  start: number;
  end: number;
  /** 時間のすぐ後ろ。狭い画面では時間の下に回る */
  tag?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [day, time] = [fullDateTime(iso(start)).split("）")[0] + "）", `${timeOnly(iso(start))}–${timeOnly(iso(end))}`];
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="text-ink-soft w-20 shrink-0 text-[13px]">{day}</span>
      <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-ink text-[15px] font-semibold whitespace-nowrap tabular-nums">{time}</span>
        {tag}
      </span>
      {right}
    </li>
  );
}

export function Excluded({ unconnected, unreadable }: { unconnected: string[]; unreadable: string[] }) {
  if (unconnected.length === 0 && unreadable.length === 0) return null;
  return (
    <Note className="mt-2">
      {unconnected.length > 0 && <>予定未登録で計算に入っていない人：{unconnected.join("、")}。</>}
      {unreadable.length > 0 && <>カレンダーを読み込めず計算に入っていない人：{unreadable.join("、")}。</>}
    </Note>
  );
}
