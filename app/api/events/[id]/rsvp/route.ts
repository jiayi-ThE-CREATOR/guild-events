import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { notifyEventRsvp } from "@/lib/server/discord";
import { attendeesOf, eventOf, isPastJst } from "@/lib/server/events";
import { isScheduled, UNIVERSITIES } from "@/lib/types";

/**
 * イベントに参加する／参加をやめる。メンバーなら誰でも使える。終わったイベントは受け付けない。
 * 記録は applications（参加＝applied の行を足す、やめる＝cancelled に変える）。
 * 定員と二重登録は DB 側（capacity トリガー・unique index）が最後に止める。
 * 出欠が変わったときだけ Discord に流す。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { member, attending, university } = (await req.json()) as {
    member?: string;
    attending?: unknown;
    university?: string | null;
  };
  if (!member || !isMember(member) || typeof attending !== "boolean") {
    return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  }

  let event;
  try {
    event = await eventOf(admin, id);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!event) return Response.json({ error: "イベントが見つかりません" }, { status: 404 });
  if (!isScheduled(event)) {
    return Response.json({ error: "日時が決まってから参加できます" }, { status: 409 });
  }
  if (isPastJst(event.event_date)) {
    return Response.json({ error: "このイベントはもう終わっています" }, { status: 409 });
  }

  const before = await attendeesOf(admin, id);
  if (before.includes(member) === attending) return Response.json({ ok: true });

  if (attending) {
    const { error } = await admin.from("applications").insert({
      event_id: id,
      name: member,
      university: (UNIVERSITIES as readonly string[]).includes(university ?? "") ? university : "その他",
    });
    // 23505＝同時に押されて二重になった。もう参加しているので成功扱い
    if (error && error.code !== "23505") {
      return Response.json({ error: error.message }, { status: error.message.includes("満席") ? 409 : 500 });
    }
  } else {
    // 出席済（attended）は運営がつけた記録なので消さない
    const { error } = await admin
      .from("applications")
      .update({ status: "cancelled" })
      .eq("event_id", id)
      .eq("name", member)
      .eq("status", "applied");
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const after = await attendeesOf(admin, id);
  if (after.includes(member) !== before.includes(member)) {
    await notifyEventRsvp(event, member, attending, after.length, req.nextUrl.origin);
  }
  return Response.json({ ok: true });
}
