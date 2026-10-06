import type { NextRequest } from "next/server";
import { isMember } from "@/lib/members";
import { isValidEmail, pickEmail } from "@/lib/notify-email";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";

/** メール通知の設定。今の宛先（自動で選ばれたもの含む）・手で入れたアドレス・オンオフ */
export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const member = req.nextUrl.searchParams.get("member");
  if (!member || !isMember(member)) return Response.json({ error: "メンバーを選んでください" }, { status: 400 });
  const { data, error } = await admin
    .from("member_notify")
    .select("notify_email, enabled")
    .eq("member_name", member)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const enabled = data?.enabled ?? true;
  // 手で入れていないときに自動で選ばれる宛先（つないでいる Google などから。Gmail 優先）
  const [sources, host] = await Promise.all([
    admin.from("calendar_sources").select("label").eq("member_name", member),
    admin.from("meet_hosts").select("email").eq("member_name", member).maybeSingle(),
  ]);
  const detected = pickEmail([...(sources.data ?? []).map((s) => s.label as string), host.data?.email]);
  return Response.json({ enabled, email: data?.notify_email ?? null, detected });
}

export async function PUT(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { member, email, enabled } = (await req.json()) as { member?: string; email?: string | null; enabled?: boolean };
  if (!member || !isMember(member)) return Response.json({ error: "メンバーを選んでください" }, { status: 400 });
  const trimmed = email?.trim() || null;
  if (trimmed && !isValidEmail(trimmed)) return Response.json({ error: "メールアドレスの形が正しくありません" }, { status: 400 });
  const { error } = await admin.from("member_notify").upsert({
    member_name: member,
    notify_email: trimmed,
    enabled: enabled !== false,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
