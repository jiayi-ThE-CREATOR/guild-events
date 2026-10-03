import { guestKey } from "../guests";
import { getAdmin, NOT_CONFIGURED } from "./admin";
import { guestByToken } from "./guests";
import type { Meeting } from "./meetings";

/** 招待リンクの合言葉から、ゲスト・その会議・キーを引く。無効なら返すべき Response */
export async function loadGuest(token: string) {
  const admin = getAdmin();
  if (!admin) return { error: Response.json({ error: NOT_CONFIGURED }, { status: 503 }) };
  const guest = await guestByToken(admin, token);
  if (!guest) {
    return { error: Response.json({ error: "このリンクは使えません（作り直されたか、削除されました）" }, { status: 404 }) };
  }
  const { data, error } = await admin.from("meetings").select().eq("id", guest.meeting_id).maybeSingle();
  if (error) return { error: Response.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: Response.json({ error: "会議が見つかりません" }, { status: 404 }) };
  return { admin, guest, meeting: data as Meeting, key: guestKey(guest.id) };
}
