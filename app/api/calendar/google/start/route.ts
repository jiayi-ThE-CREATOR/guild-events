import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, googleConfigured, STATE_COOKIE } from "@/lib/server/google";
import { getAdmin } from "@/lib/server/admin";
import { resolveOwner } from "@/lib/server/owner";

/**
 * Google の同意画面へ送り出す。誰の連携か（メンバー名かゲストのキー）と戻り先は
 * cookie に持たせて戻り先で照合する。ゲストは招待ページへ戻す。
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const guestToken = params.get("guest");
  const admin = getAdmin();
  const owner = admin ? await resolveOwner(admin, { member: params.get("member"), guest: guestToken }) : null;
  const backPath = owner?.guest ? `/g/${guestToken}` : "/mypage";
  const back = new URL(backPath, req.nextUrl.origin);
  if (!googleConfigured() || !owner) {
    back.searchParams.set("calendar", "error");
    return NextResponse.redirect(back);
  }

  const nonce = crypto.randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/calendar/google/callback`;
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, nonce));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ nonce, owner: owner.key, back: backPath }), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/calendar/google",
  });
  return res;
}
