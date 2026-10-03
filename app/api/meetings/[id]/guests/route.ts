import type { NextRequest } from "next/server";
import { guestKey } from "@/lib/guests";
import { isEmptyLayer } from "@/lib/manual";
import { getAdmin, NOT_CONFIGURED } from "@/lib/server/admin";
import { createGuest, guestNameProblem, guestsOf, MAX_GUESTS, removeGuest } from "@/lib/server/guests";

/**
 * 会議の外部ゲスト（メンバーが使う）。
 * GET: ゲスト一覧と回答状況（リンクは返さない）
 * POST { name }: ゲストを作り、招待リンクを 1 回だけ返す（DB にはハッシュしか残らない）
 * DELETE { guestId }: ゲストと、その人の予定・カレンダー連携を消す
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const guests = await guestsOf(admin, id);
  const keys = guests.map((g) => guestKey(g.id));
  if (keys.length === 0) return Response.json({ guests: [] });

  const [{ data: sources }, { data: entries }, { data: declines }] = await Promise.all([
    admin.from("calendar_sources").select("member_name").in("member_name", keys),
    admin.from("meeting_entries").select("member_name, cells, exclusive").eq("meeting_id", id).in("member_name", keys),
    admin.from("meeting_declines").select("member_name").eq("meeting_id", id).in("member_name", keys),
  ]);
  const has = (rows: { member_name: string }[] | null, k: string) => (rows ?? []).some((r) => r.member_name === k);
  return Response.json({
    guests: guests.map((g) => {
      const k = guestKey(g.id);
      const entry = (entries ?? []).find((e) => e.member_name === k);
      return {
        id: g.id,
        name: g.name,
        state: has(declines, k)
          ? "declined"
          : has(sources, k)
            ? "connected"
            : entry && !isEmptyLayer({ cells: entry.cells, exclusive: entry.exclusive })
              ? "manual"
              : "unconnected",
      };
    }),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  const trimmed = (name ?? "").trim();
  const problem = guestNameProblem(trimmed);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const { data: meeting } = await admin.from("meetings").select("id, status").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "会議が見つかりません" }, { status: 404 });
  if ((await guestsOf(admin, id)).length >= MAX_GUESTS) {
    return Response.json({ error: `ゲストは ${MAX_GUESTS} 人までです` }, { status: 400 });
  }

  try {
    const guest = await createGuest(admin, id, trimmed, req.nextUrl.origin);
    return Response.json({ id: guest.id, url: guest.url });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = getAdmin();
  if (!admin) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });
  const { id } = await params;
  const { guestId } = (await req.json()) as { guestId?: string };
  const guest = (await guestsOf(admin, id)).find((g) => g.id === guestId);
  if (!guest) return Response.json({ error: "ゲストが見つかりません" }, { status: 404 });
  try {
    await removeGuest(admin, guest);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
