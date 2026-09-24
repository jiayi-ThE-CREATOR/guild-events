import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED, type CalendarSource } from "@/lib/server/admin";
import { memberBusy } from "@/lib/server/busy";
import { findSlots, jstMidnight, type Busy } from "@/lib/slots";

/**
 * 参加者全員のカレンダーを読み、会議を入れられる時間を返す。
 * 返すのは時間帯と人数だけ。誰がいつ埋まっているかは返さない。
 * 読めなかった人の名前だけは返す（本人に連携し直してもらうため）。
 */

const MAX_DAYS = 31;

type Body = {
  members: string[];
  fromDate: string;
  days: number;
  durationMin: number;
  dayStartMin: number;
  dayEndMin: number;
};

function invalid(b: Body): string | null {
  if (!Array.isArray(b.members) || b.members.length === 0) return "参加者を選んでください";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fromDate)) return "開始日が不正です";
  if (!(b.days >= 1 && b.days <= MAX_DAYS)) return `期間は 1〜${MAX_DAYS} 日にしてください`;
  if (!(b.durationMin >= 15 && b.durationMin <= 8 * 60)) return "会議の長さが不正です";
  if (!(b.dayStartMin >= 0 && b.dayEndMin <= 24 * 60 && b.dayStartMin < b.dayEndMin)) {
    return "時間帯が不正です";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const body = (await req.json()) as Body;
  const problem = invalid(body);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const { data, error } = await admin
    .from("calendar_sources")
    .select("id, member_name, provider, label, secret")
    .in("member_name", body.members);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const from = jstMidnight(body.fromDate);
  const to = from + body.days * 24 * 60 * 60 * 1000;

  const busyByMember: Record<string, Busy[]> = {};
  const failed: string[] = [];
  const notConnected: string[] = [];
  await Promise.all(
    body.members.map(async (name) => {
      const sources = (data as CalendarSource[]).filter((s) => s.member_name === name);
      if (sources.length === 0) return notConnected.push(name);
      try {
        busyByMember[name] = await memberBusy(sources, from, to);
      } catch (e) {
        console.error(`[schedule] ${name}: ${(e as Error).message}`);
        failed.push(name);
      }
    }),
  );

  // 読めなかった人がいるまま出すと、その人の予定を無視した結果になるので止める
  if (failed.length > 0 || notConnected.length > 0) {
    return Response.json({ failed, notConnected }, { status: 409 });
  }

  const result = findSlots({
    busyByMember,
    fromDate: body.fromDate,
    days: body.days,
    durationMin: body.durationMin,
    dayStartMin: body.dayStartMin,
    dayEndMin: body.dayEndMin,
    notBefore: Date.now(),
  });
  return Response.json(result);
}
