import type { NextRequest } from "next/server";
import { meetingRanges } from "@/lib/ranges";
import { applyRsvps } from "@/lib/rsvp";
import { availability } from "@/lib/server/availability";
import { filesOf } from "@/lib/server/files";
import { loadGuest } from "@/lib/server/guest-access";
import { meetingMembers } from "@/lib/server/guests";
import { declinesOf, rangeOf, rsvpsOf, settle } from "@/lib/server/meetings";

/**
 * ゲスト用の会議ページの中身。メンバーの名前（主催者も含む）は返さない。
 * 返すのは会議の中身・候補・自分の状態と、時間帯と人数だけの結果。
 */
type Params = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const loaded = await loadGuest(token);
  if (loaded.error) return loaded.error;
  const { admin, guest, key } = loaded;
  const meeting = await settle(admin, loaded.meeting, req.nextUrl.origin);

  const { keys } = await meetingMembers(admin, meeting);
  const declined = await declinesOf(admin, meeting.id);
  const { data: sources } = await admin.from("calendar_sources").select("id").eq("member_name", key);

  const base = {
    guest: { name: guest.name, declined: declined.includes(key), hasCalendar: (sources ?? []).length > 0 },
    meeting: {
      title: meeting.title,
      description: meeting.description,
      location: meeting.location,
      duration_min: meeting.duration_min,
      ranges: meetingRanges(meeting),
      deadline: meeting.deadline,
      status: meeting.status,
      confirmed_start: meeting.confirmed_start,
      meet_url: meeting.meet_url ?? null,
    },
    files: (await filesOf(admin, meeting.id)).map(({ id, name, size, created_at }) => ({ id, name, size, created_at })),
  };

  if (meeting.status === "open") {
    const { result } = await availability(
      admin,
      keys.filter((k) => !declined.includes(k)),
      rangeOf(meeting),
      Math.max(Date.now(), Date.parse(meeting.deadline)),
      meeting.id,
    );
    return Response.json({ ...base, preview: result });
  }
  if (meeting.status === "confirmed") {
    const applied = applyRsvps(keys, meeting.attendees ?? [], declined, await rsvpsOf(admin, meeting.id));
    return Response.json({
      ...base,
      result: {
        attending: applied.attendees.length,
        total: applied.participants.length,
        youAttend: applied.attendees.includes(key),
      },
    });
  }
  return Response.json(base);
}
