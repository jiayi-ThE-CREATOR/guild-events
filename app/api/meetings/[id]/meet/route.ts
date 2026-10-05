import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { createMeetFor } from "@/lib/server/meet";

/** 会議にあとから Google Meet リンクを作る（作成時に作らなかった・失敗した場合）。主催者のアカウントで作る */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { data, error } = await admin.from("meetings").select("id, organizer, meet_url").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if (data.meet_url) return Response.json({ url: data.meet_url });
  try {
    const url = await createMeetFor(admin, data);
    if (!url) {
      return Response.json(
        { error: `主催者（${data.organizer}）が Google Meet をつないでいません。マイページからつないでください` },
        { status: 409 },
      );
    }
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
