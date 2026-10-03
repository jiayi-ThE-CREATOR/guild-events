import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { hashToken, newToken } from "@/lib/server/guests";

/** 招待リンクを作り直す（なくした・漏れたとき）。古いリンクはその場で使えなくなる */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id, guestId } = await params;
  const token = newToken();
  const { data, error } = await admin
    .from("meeting_guests")
    .update({ token_hash: hashToken(token) })
    .eq("id", guestId)
    .eq("meeting_id", id)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: "ゲストが見つかりません" }, { status: 404 });
  return Response.json({ url: `${req.nextUrl.origin}/g/${token}` });
}
