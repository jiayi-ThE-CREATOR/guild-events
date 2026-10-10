import type { NextRequest } from "next/server";
import { guestKey, guestLabel } from "@/lib/guests";
import { MEETING_DEADLINE_HOURS } from "@/lib/meetings";
import { envelope, rangeIntervals, rangesProblem, type CandidateRange } from "@/lib/ranges";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { registeredMembers } from "@/lib/server/availability";
import { notifyOpened } from "@/lib/server/discord";
import { createGuest, guestNameProblem, MAX_GUESTS } from "@/lib/server/guests";
import { createMeetFor } from "@/lib/server/meet";
import { decideMeeting } from "@/lib/server/decide";
import { enteredCounts, settleDue, type Meeting } from "@/lib/server/meetings";

const LIST_FIELDS =
  "id, title, organizer, participants, duration_min, deadline, status, confirmed_start, created_at";

/** 会議の一覧。締切を過ぎたものは返す前に決めておく（定時ジョブより先に開かれた場合） */
export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    await settleDue(admin, req.nextUrl.origin);
  } catch (e) {
    console.error(`[meetings] ${(e as Error).message}`);
  }
  const { data, error } = await admin
    .from("meetings")
    .select(LIST_FIELDS)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  try {
    const counts = await enteredCounts(admin, data.filter((m) => m.status === "open"));
    return Response.json({ meetings: data.map((m) => ({ ...m, entered: counts.get(m.id) })) });
  } catch (e) {
    console.error(`[meetings] ${(e as Error).message}`);
    return Response.json({ meetings: data });
  }
}

type Body = {
  title?: string;
  description?: string;
  location?: string;
  organizer?: string;
  participants?: string[];
  durationMin?: number;
  ranges?: CandidateRange[];
  deadlineHours?: number;
  /** 外部ゲストの名前。作った会議に招待リンク付きで加える */
  guests?: string[];
  /** 主催者の Google アカウントで Meet リンクを作るか */
  meet?: boolean;
  /** 日時がもう決まっているとき。募集をせず、この日時に決まった会議として作る（候補・長さ・結果発表は使わない） */
  fixed?: { start?: string; end?: string };
};

const HALF_HOUR = 30 * 60 * 1000;

/** 決まった日時の検査。30 分刻み・今より後・終了が開始より後・その日のうちに終わる */
function fixedProblem(f: NonNullable<Body["fixed"]>): string | null {
  const start = Date.parse(f.start ?? "");
  const end = Date.parse(f.end ?? "");
  if (Number.isNaN(start) || start % HALF_HOUR !== 0) return "開始時刻が正しくありません（30 分刻み）";
  if (start <= Date.now()) return "今より後の時間を選んでください";
  if (Number.isNaN(end) || end % HALF_HOUR !== 0 || end <= start) return "終了時刻は開始より後にしてください（30 分刻み）";
  if (fixedRange(start, end).dayEndMin > 24 * 60) return "その日のうちに終わる時間にしてください";
  return null;
}

/** 決まった日時を「その日のその時間帯だけ」の候補 1 件にする（候補の列を埋めるため） */
function fixedRange(start: number, end: number): CandidateRange {
  const jst = new Date(start + 9 * 60 * 60 * 1000);
  const date = jst.toISOString().slice(0, 10);
  const dayStartMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  return { fromDate: date, toDate: date, dayStartMin, dayEndMin: dayStartMin + (end - start) / 60_000 };
}

function invalid(b: Body): string | null {
  if (!b.title?.trim()) return "会議名を入れてください";
  if (!b.organizer || !isMember(b.organizer)) return "主催者を選んでください";
  if (!Array.isArray(b.participants)) return "参加者を選んでください";
  // メンバーが誰もいなくても、外部ゲストがいれば作れる（主催者とゲストだけの会議など）
  const guestCount = Array.isArray(b.guests) ? b.guests.length : 0;
  if (b.participants.length === 0 && guestCount === 0) return "参加者か外部ゲストを 1 人以上入れてください";
  if (!b.participants.every(isMember)) return "メンバー以外が含まれています";
  if (b.guests !== undefined) {
    if (!Array.isArray(b.guests) || b.guests.length > MAX_GUESTS) return `ゲストは ${MAX_GUESTS} 人までです`;
    for (const g of b.guests) {
      const problem = guestNameProblem(typeof g === "string" ? g.trim() : "");
      if (problem) return problem;
    }
  }
  if (b.fixed) return fixedProblem(b.fixed);
  const rangeProblem = rangesProblem(b.ranges);
  if (rangeProblem) return rangeProblem;
  if (!(b.durationMin! >= 15 && b.durationMin! <= 8 * 60)) return "会議の長さが不正です";
  if (!MEETING_DEADLINE_HOURS.includes(b.deadlineHours!)) return "結果発表の時間が不正です";
  return null;
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = (await req.json()) as Body;
  const problem = invalid(b);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  let deadline: number;
  if (b.fixed) {
    // 決まった日時を候補 1 件にし、作ってすぐ下で決める（それまで自動で決まらないよう、結果発表は開始時刻にしておく）
    const start = Date.parse(b.fixed.start!);
    const end = Date.parse(b.fixed.end!);
    b.ranges = [fixedRange(start, end)];
    b.durationMin = (end - start) / 60_000;
    deadline = start;
  } else {
    deadline = Date.now() + b.deadlineHours! * 60 * 60 * 1000;
    const intervals = rangeIntervals(b.ranges!);
    if (intervals[intervals.length - 1].end <= deadline) {
      return Response.json(
        { error: "候補がすべて結果発表より前に終わってしまいます。候補を後ろにずらしてください" },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from("meetings")
    .insert({
      title: b.title!.trim(),
      description: b.description?.trim() || null,
      location: b.location?.trim() || null,
      organizer: b.organizer,
      participants: [...new Set(b.participants)],
      duration_min: b.durationMin,
      ranges: b.ranges,
      ...envelope(b.ranges!),
      deadline: new Date(deadline).toISOString(),
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let meeting = data as Meeting;

  // Google Meet リンク。作れなくても会議は作る（会議ページから作り直せる）
  let meetError: string | null = null;
  if (b.meet) {
    try {
      const url = await createMeetFor(admin, meeting);
      if (url) meeting = { ...meeting, meet_url: url };
      else meetError = "主催者が Google Meet をつないでいないため、Meet リンクは作りませんでした";
    } catch (e) {
      console.error(`[meetings] Meet の作成に失敗: ${(e as Error).message}`);
      meetError = "Google Meet リンクを作れませんでした。会議ページから作り直せます";
    }
  }

  // 外部ゲスト。招待リンクはこの応答でしか返せない（DB にはハッシュだけ）
  const guests: { id: string; name: string; url: string }[] = [];
  try {
    for (const name of b.guests ?? []) {
      guests.push(await createGuest(admin, meeting.id, name.trim(), req.nextUrl.origin));
    }
  } catch (e) {
    return Response.json(
      { error: `会議は作りましたが、ゲストの追加に失敗しました（${(e as Error).message}）。会議ページから追加してください`, id: meeting.id, guests },
      { status: 500 },
    );
  }

  // 日時が決まっている会議は、ここで決める（Discord には募集開始でなく「決定」が流れる）
  if (b.fixed) {
    let problem: { error: string; status: number } | null;
    try {
      problem = await decideMeeting(admin, meeting, Date.parse(b.fixed.start!), Date.parse(b.fixed.end!), req.nextUrl.origin);
    } catch (e) {
      problem = { error: (e as Error).message, status: 500 };
    }
    if (problem) {
      return Response.json(
        { error: `会議は作りましたが、日時を決められませんでした（${problem.error}）。会議ページの「⋯」から決めてください`, id: meeting.id, guests },
        { status: 500 },
      );
    }
    return Response.json({ id: meeting.id, guests: guests.map(({ name, url }) => ({ name, url })), meetError });
  }

  // 募集開始を Discord に流す（ゲストも参加者として並べる）。失敗しても作成そのものは成功として返す
  try {
    const registered = await registeredMembers(admin);
    const keys = [...meeting.participants, ...guests.map((g) => guestKey(g.id))];
    const labels = Object.fromEntries(guests.map((g) => [guestKey(g.id), guestLabel(g.name)]));
    const unconnected = keys.filter((p) => !registered.has(p));
    await notifyOpened({ ...meeting, participants: keys }, unconnected, req.nextUrl.origin, labels);
  } catch (e) {
    console.error(`[meetings] 募集開始の通知に失敗: ${(e as Error).message}`);
  }
  return Response.json({ id: meeting.id, guests: guests.map(({ name, url }) => ({ name, url })), meetError });
}
