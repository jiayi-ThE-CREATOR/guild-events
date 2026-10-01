import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { caldavBusy, discoverCalendars, normalizeServer } from "@/lib/server/caldav";

/**
 * CalDAV（Lark など）の登録。保存する前に実際にカレンダーを探して、
 * 1 週間ぶんの予定を読めるか確かめる（打ち間違いをその場で知らせるため）。
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { member, server, username, password } = (await req.json()) as {
    member?: string;
    server?: string;
    username?: string;
    password?: string;
  };
  if (!member || !isMember(member)) {
    return Response.json({ error: "メンバーではありません" }, { status: 400 });
  }
  const url = normalizeServer(server ?? "");
  // http://localhost は手元の確認用。本番では https だけ受け付ける
  if (url && process.env.NODE_ENV === "production" && !url.startsWith("https:")) {
    return Response.json({ error: "サーバーのアドレスは https で始まるものにしてください" }, { status: 400 });
  }
  if (!url) return Response.json({ error: "サーバーのアドレスを確認してください" }, { status: 400 });
  if (!username?.trim() || !password) {
    return Response.json({ error: "ユーザー名とパスワードを入れてください" }, { status: 400 });
  }
  const creds = { url, username: username.trim(), password };

  let label: string;
  try {
    const calendars = await discoverCalendars(creds);
    if (calendars.length === 0) throw new Error("このアカウントにカレンダーが見つかりませんでした");
    const now = Date.now();
    await caldavBusy(creds, now, now + 7 * 24 * 60 * 60 * 1000);
    const names = calendars.map((c) => c.name).filter(Boolean);
    label = `${creds.username}${names.length > 0 ? `（${names.join("・")}）` : ""}`;
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  // 同じアカウントをつなぎ直したら古いほうを置き換える
  const { data: existing } = await admin
    .from("calendar_sources")
    .select("id, secret")
    .eq("member_name", member)
    .eq("provider", "caldav");
  const sameAccount = (existing ?? []).filter((r) => {
    try {
      const s = JSON.parse(r.secret);
      return s.url === creds.url && s.username === creds.username;
    } catch {
      return false;
    }
  });
  if (sameAccount.length > 0) {
    await admin.from("calendar_sources").delete().in("id", sameAccount.map((r) => r.id));
  }

  const { error } = await admin.from("calendar_sources").insert({
    member_name: member,
    provider: "caldav",
    label: label.slice(0, 200),
    secret: JSON.stringify(creds),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, label });
}
