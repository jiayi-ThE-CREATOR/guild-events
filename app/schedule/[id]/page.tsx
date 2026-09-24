"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import CalendarLinks from "@/components/CalendarLinks";
import PageHeader from "@/components/PageHeader";
import { fullDateTime, timeOnly } from "@/lib/format";
import { durationLabel, type ParticipantState } from "@/lib/meetings";
import { useProfile } from "@/lib/profile";
import type { SlotResult } from "@/lib/slots";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 会議の詳細。募集中は「今のカレンダーで決めたらどうなるか」の候補と、
 * 参加者本人の「参加できない」ボタンを出す。決定後は日時とカレンダー登録の導線。
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
  deadline: string;
  status: "open" | "confirmed" | "failed";
  confirmed_start: string | null;
  confirmed_available: number | null;
  confirmed_total: number | null;
  excluded: string[];
};

type Detail = {
  meeting: Meeting;
  participants: { name: string; state: ParticipantState }[];
  preview: { result: SlotResult; excluded: string[] } | null;
};

const iso = (ms: number) => new Date(ms).toISOString();

function rangeLabel(m: Meeting) {
  const [y, mo, d] = m.from_date.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d));
  const end = new Date(start.getTime() + (m.days - 1) * 24 * 60 * 60 * 1000);
  const md = (x: Date) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return `${md(start)}〜${md(end)}・${m.day_start_min / 60}時〜${m.day_end_min / 60}時`;
}

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
          <Row label="候補">{rangeLabel(m)}</Row>
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
                {m.confirmed_available === m.confirmed_total
                  ? `全員（${m.confirmed_total}人）が参加できます`
                  : `${m.confirmed_total}人中 ${m.confirmed_available}人が参加できます（1人は予定あり）`}
              </p>
            </div>
            <Excluded names={m.excluded} settled />
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
            <Excluded names={m.excluded} settled />
          </section>
        )}

        {m.status === "open" && (
          <>
            {me && (
              <section className="border-line mt-6 rounded-2xl border bg-white p-4">
                {me.state === "declined" ? (
                  <>
                    <p className="text-ink text-sm font-bold">「参加できない」で回答しています</p>
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
                        : "カレンダーがまだつながっていません"}
                    </p>
                    <p className="text-ink-soft mt-1 text-xs">
                      {me.state === "connected" ? (
                        "何もしなくて大丈夫です。どの日時でも出られない場合だけ下を押してください。"
                      ) : (
                        <>
                          <Link href="/mypage" className="text-navy underline">マイページ</Link>
                          でつなぐと、結果発表のときに自分の予定も考慮されます。
                        </>
                      )}
                    </p>
                    <button type="button" disabled={saving} onClick={() => setDeclined(true)} className="border-line text-ink-soft hover:border-ink-soft mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold transition-colors disabled:opacity-40">
                      参加できない
                    </button>
                  </>
                )}
              </section>
            )}
            {isClient && !profile && (
              <p className="text-ink-soft mt-6 text-xs">
                参加者の方は{" "}
                <Link href="/mypage" className="text-navy underline">マイページ</Link>{" "}
                で名前を選ぶと「参加できない」を押せます。
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
                <Excluded names={preview.excluded} />
              </section>
            )}
          </>
        )}

        <section className="mt-8">
          <h2 className="text-ink mb-3 text-sm font-bold md:text-base">参加者（{participants.length}人）</h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {participants.map((p) => (
              <li key={p.name} className="border-line flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5">
                <span className="text-ink truncate text-sm">{p.name}</span>
                {p.state === "connected" && <Badge tone="navy">連携済み</Badge>}
                {p.state === "unconnected" && <Badge tone="outline">未連携</Badge>}
                {p.state === "declined" && <Badge tone="muted">参加できない</Badge>}
              </li>
            ))}
          </ul>
        </section>
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

function Excluded({ names, settled }: { names: string[]; settled?: boolean }) {
  if (names.length === 0) return null;
  return (
    <p className="text-ink-soft mt-3 text-[11px]">
      {names.join("、")} さんはカレンダーがつながっていない（または読み込めなかった）ため、
      {settled ? "計算に入っていません。" : "今は計算に入っていません。"}
    </p>
  );
}
