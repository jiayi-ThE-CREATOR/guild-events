import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";

/** カレンダーを 1 つ以上つないでいる人の名前（日程調整の参加者候補） */
export async function GET() {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { data, error } = await admin.from("calendar_sources").select("member_name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const names = [...new Set((data ?? []).map((r) => r.member_name as string))];
  return Response.json({ members: names });
}
