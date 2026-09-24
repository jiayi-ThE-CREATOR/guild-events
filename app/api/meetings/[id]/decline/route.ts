import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import type { Meeting } from "@/lib/server/meetings";

/** 「参加できない」の切り替え。募集中の会議の参加者本人だけ */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { member, declined } = (await req.json()) as { member?: string; declined?: boolean };

  const { data, error } = await admin
    .from("meetings")
    .select("participants, status, deadline")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const meeting = data as Pick<Meeting, "participants" | "status" | "deadline"> | null;
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (!member || !meeting.participants.includes(member)) {
    return Response.json({ error: "この会議の参加者ではありません" }, { status: 403 });
  }
  if (meeting.status !== "open" || Date.parse(meeting.deadline) <= Date.now()) {
    return Response.json({ error: "募集はもう締め切られています" }, { status: 409 });
  }

  const table = admin.from("meeting_declines");
  const { error: writeError } = declined
    ? await table.upsert({ meeting_id: id, member_name: member })
    : await table.delete().match({ meeting_id: id, member_name: member });
  if (writeError) return Response.json({ error: writeError.message }, { status: 500 });
  return Response.json({ ok: true });
}
