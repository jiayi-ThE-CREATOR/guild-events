import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { registeredMembers } from "@/lib/server/availability";

/** 予定を登録済み（外部カレンダーか毎週の予定がある）の人の名前。会議作成画面の目安用 */
export async function GET() {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    return Response.json({ members: [...(await registeredMembers(admin))] });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
