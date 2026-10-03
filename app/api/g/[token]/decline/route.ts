import type { NextRequest } from "next/server";
import { loadGuest } from "@/lib/server/guest-access";

/** ゲストの「不参加にする／取り消す」。募集中だけ */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadGuest(token);
  if (loaded.error) return loaded.error;
  const { admin, meeting, key } = loaded;
  const { declined } = (await req.json()) as { declined?: boolean };
  if (meeting.status !== "open" || Date.parse(meeting.deadline) <= Date.now()) {
    return Response.json({ error: "募集はもう締め切られています" }, { status: 409 });
  }
  const table = admin.from("meeting_declines");
  const { error } = declined
    ? await table.upsert({ meeting_id: meeting.id, member_name: key })
    : await table.delete().match({ meeting_id: meeting.id, member_name: key });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
