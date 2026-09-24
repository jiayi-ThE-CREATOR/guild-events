import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, googleConfigured, STATE_COOKIE } from "@/lib/server/google";
import { isMember } from "@/lib/members";

/** Google の同意画面へ送り出す。誰の連携かは cookie に持たせて戻り先で照合する */
export async function GET(req: NextRequest) {
  const member = req.nextUrl.searchParams.get("member") ?? "";
  const back = new URL("/mypage", req.nextUrl.origin);
  if (!googleConfigured() || !isMember(member)) {
    back.searchParams.set("calendar", "error");
    return NextResponse.redirect(back);
  }

  const nonce = crypto.randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/calendar/google/callback`;
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, nonce));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ nonce, member }), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/calendar/google",
  });
  return res;
}
