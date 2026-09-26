import type { NextRequest } from "next/server";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { settleDue } from "@/lib/server/meetings";

/**
 * 締切を過ぎた会議を決める定時ジョブの入口。
 * Supabase の pg_cron が 5 分おきに POST してくる（README「会議の自動決定」）。
 * Authorization: Bearer <CRON_SECRET> が一致しないと何もしない。
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const settled = await settleDue(admin, req.nextUrl.origin);
  return Response.json({ settled });
}

export const GET = run;
export const POST = run;
