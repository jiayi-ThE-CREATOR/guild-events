import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { revokeGoogle } from "@/lib/server/google";
import { isMember } from "@/lib/members";

/**
 * その人が連携しているカレンダーの一覧と、連携の解除。
 * secret（token・リンク）は返さない。
 */

export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const member = req.nextUrl.searchParams.get("member") ?? "";
  if (!isMember(member)) return Response.json({ error: "メンバーではありません" }, { status: 400 });

  const { data, error } = await admin
    .from("calendar_sources")
    .select("id, provider, label")
    .eq("member_name", member)
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sources: data });
}

/**
 * { member, provider } でそのサービスを丸ごと解除、{ member, id } で 1 件だけ解除。
 * Google は DB から消す前に Google 側の許可も取り消す。
 */
export async function DELETE(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { member, provider, id } = (await req.json()) as {
    member?: string;
    provider?: string;
    id?: string;
  };
  if (!member || !isMember(member) || (!provider && !id)) {
    return Response.json({ error: "指定が足りません" }, { status: 400 });
  }

  let query = admin
    .from("calendar_sources")
    .select("id, provider, secret")
    .eq("member_name", member);
  query = id ? query.eq("id", id) : query.eq("provider", provider!);
  const { data: targets, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await Promise.all(
    (targets ?? [])
      .filter((t) => t.provider === "google")
      .map((t) => revokeGoogle(t.secret)),
  );

  const { error: deleteError } = await admin
    .from("calendar_sources")
    .delete()
    .in(
      "id",
      (targets ?? []).map((t) => t.id),
    );
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  return Response.json({ ok: true });
}
