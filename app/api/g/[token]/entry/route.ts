import type { NextRequest } from "next/server";
import { readEntry, writeEntry } from "@/lib/server/entry";
import { loadGuest } from "@/lib/server/guest-access";

/** ゲストの「この会議の予定」。中身はメンバーと同じ lib/server/entry.ts */
type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const loaded = await loadGuest(token);
  if (loaded.error) return loaded.error;
  return Response.json(await readEntry(loaded.admin, loaded.meeting, loaded.key));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const loaded = await loadGuest(token);
  if (loaded.error) return loaded.error;
  const { cells, exclusive } = (await req.json()) as { cells?: unknown; exclusive?: unknown };
  const problem = await writeEntry(loaded.admin, loaded.meeting, loaded.key, cells, exclusive);
  if (problem) return Response.json({ error: problem.error }, { status: problem.status });
  return Response.json({ ok: true });
}
