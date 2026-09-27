import type { NextRequest } from "next/server";
import { validCells } from "@/lib/manual";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";

/** マイページの「毎週の予定」の読み書き */

export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const member = req.nextUrl.searchParams.get("member") ?? "";
  if (!isMember(member)) return Response.json({ error: "メンバーではありません" }, { status: 400 });

  const { data, error } = await admin
    .from("weekly_schedules")
    .select("cells, exclusive")
    .eq("member_name", member)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? { cells: {}, exclusive: false });
}

export async function PUT(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { member, cells, exclusive } = (await req.json()) as {
    member?: string;
    cells?: unknown;
    exclusive?: unknown;
  };
  if (!member || !isMember(member)) {
    return Response.json({ error: "メンバーではありません" }, { status: 400 });
  }
  if (!validCells(cells, "weekly") || typeof exclusive !== "boolean") {
    return Response.json({ error: "予定の形が正しくありません" }, { status: 400 });
  }

  const { error } = await admin.from("weekly_schedules").upsert({
    member_name: member,
    cells,
    exclusive,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
