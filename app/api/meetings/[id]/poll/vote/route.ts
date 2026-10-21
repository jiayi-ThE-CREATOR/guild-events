import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import type { Meeting } from "@/lib/server/meetings";
import { pollOf } from "@/lib/server/poll";

/**
 * 日程の投票。「参加できる」日程（複数可・0 個も可）を丸ごと送り、その人の印を入れ替える。
 * 投票できるのは会議の参加者（1 回目で予定を見た人）だけ。締め切りまで何度でも変えられる。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { member, optionIds } = (await req.json()) as { member?: string; optionIds?: unknown };
  if (!member || !isMember(member) || !Array.isArray(optionIds) || !optionIds.every((o) => typeof o === "string")) {
    return Response.json({ error: "指定が正しくありません" }, { status: 400 });
  }

  const { data, error } = await admin.from("meetings").select().eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Meeting | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (meeting.status !== "voting" || Date.parse(meeting.deadline) <= Date.now()) {
    return Response.json({ error: "投票は締め切られました" }, { status: 409 });
  }
  if (!meeting.participants.includes(member)) {
    return Response.json({ error: "投票できるのは、日程調整の参加者だけです" }, { status: 403 });
  }

  const options = await pollOf(admin, id);
  const ids = options.map((o) => o.id);
  if (!(optionIds as string[]).every((o) => ids.includes(o))) {
    return Response.json({ error: "選択肢が変わりました。ページを開き直してください" }, { status: 409 });
  }
  const { error: deleteError } = await admin.from("meeting_poll_votes").delete().in("option_id", ids).eq("member_name", member);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  if ((optionIds as string[]).length > 0) {
    const { error: insertError } = await admin
      .from("meeting_poll_votes")
      .insert((optionIds as string[]).map((option_id) => ({ option_id, member_name: member })));
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
