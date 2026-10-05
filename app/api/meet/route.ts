import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { revokeGoogle } from "@/lib/server/google";
import { meetHost } from "@/lib/server/meet";

/** Google Meet 用の連携の状態（つないでいるか・どのアカウントか）。token は返さない */
export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const member = req.nextUrl.searchParams.get("member");
  if (!member || !isMember(member)) return Response.json({ error: "メンバーを選んでください" }, { status: 400 });
  const host = await meetHost(admin, member);
  return Response.json({ connected: !!host, email: host?.email ?? null });
}

/** 連携を外す。Google 側の許可も取り消す。作り済みの Meet リンクはそのまま使える */
export async function DELETE(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const member = req.nextUrl.searchParams.get("member");
  if (!member || !isMember(member)) return Response.json({ error: "メンバーを選んでください" }, { status: 400 });
  const host = await meetHost(admin, member);
  if (host) {
    await revokeGoogle(host.refresh_token);
    const { error } = await admin.from("meet_hosts").delete().eq("member_name", member);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
