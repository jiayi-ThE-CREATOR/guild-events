import type { NextRequest } from "next/server";
import { calendarName } from "@/lib/ics";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { fetchIcs, normalizeIcsUrl } from "@/lib/server/ics-fetch";
import { resolveOwner } from "@/lib/server/owner";

/** iPhone などの共有リンクを登録する。保存前に一度読んで、本当にカレンダーか確かめる */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { member, guest, url } = (await req.json()) as { member?: string; guest?: string; url?: string };
  const owner = await resolveOwner(admin, { member, guest });
  if (!owner) {
    return Response.json({ error: "メンバーではありません" }, { status: 400 });
  }
  const normalized = normalizeIcsUrl(url ?? "");
  if (!normalized) {
    return Response.json(
      { error: "webcal:// か https:// で始まるリンクを貼ってください" },
      { status: 400 },
    );
  }

  let label: string;
  try {
    label = calendarName(await fetchIcs(normalized)) ?? "iPhone カレンダー";
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const { error } = await admin.from("calendar_sources").upsert(
    { member_name: owner.key, provider: "ics", label, secret: normalized },
    { onConflict: "member_name,provider,secret" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, label });
}
