import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/server/admin";
import { exchangeCode, STATE_COOKIE } from "@/lib/server/google";

/** Google の同意画面から戻ってくる先。refresh token を保存して元の画面（マイページか招待ページ）へ返す */
export async function GET(req: NextRequest) {
  let saved: { nonce?: string; owner?: string; back?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  // 戻り先は自分のサイトの中だけ（/mypage か /g/<合言葉>）
  const backPath = saved.back && /^\/(mypage|g\/[A-Za-z0-9_-]+)$/.test(saved.back) ? saved.back : "/mypage";
  const back = new URL(backPath, req.nextUrl.origin);
  const fail = (reason: string) => {
    back.searchParams.set("calendar", "error");
    back.searchParams.set("reason", reason);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar/google" });
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail("キャンセルされました");

  const code = params.get("code");
  if (!code || !saved.owner || saved.nonce !== params.get("state")) {
    return fail("連携の確認に失敗しました。もう一度お試しください");
  }

  const admin = getAdmin();
  if (!admin) return fail("サーバーの設定が未完了です");

  try {
    const redirectUri = `${req.nextUrl.origin}/api/calendar/google/callback`;
    const { refreshToken, email } = await exchangeCode(code, redirectUri);
    // 同じ Google アカウントをつなぎ直したら古い token を置き換える
    await admin
      .from("calendar_sources")
      .delete()
      .match({ member_name: saved.owner, provider: "google", label: email });
    const { error } = await admin.from("calendar_sources").insert({
      member_name: saved.owner,
      provider: "google",
      label: email,
      secret: refreshToken,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    return fail((e as Error).message);
  }

  back.searchParams.set("calendar", "connected");
  const res = NextResponse.redirect(back);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar/google" });
  return res;
}
