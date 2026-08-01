import Link from "next/link";
import { CampusBadge, SeatBadge } from "./Badge";
import {
  campusOf,
  dateBlock,
  remainingSeats,
  shortLocation,
  timeOnly,
} from "@/lib/format";
import type { EventWithCount } from "@/lib/types";

export default function EventCard({ event }: { event: EventWithCount }) {
  const { month, day, weekday } = dateBlock(event.event_date);
  const remaining = remainingSeats(event.capacity, event.applied);
  const ratio = event.capacity ? Math.min(event.applied / event.capacity, 1) : 0;
  const tight = remaining !== null && remaining <= 5;

  return (
    <Link
      href={`/events/${event.id}`}
      className="border-line hover:border-navy/30 flex gap-3 rounded-2xl border bg-white p-3 transition-colors"
    >
      <div className="w-11 shrink-0 text-center">
        <div className="text-amber text-[11px] font-semibold">{month}</div>
        <div className="text-ink text-2xl leading-tight font-bold">{day}</div>
        <div className="text-ink-soft text-[11px]">{weekday}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap gap-1.5">
          <CampusBadge campus={campusOf(event.location)} />
          <SeatBadge remaining={remaining} />
        </div>

        <h2 className="text-ink text-[15px] leading-snug font-bold">
          {event.title}
        </h2>

        <p className="text-ink-soft mt-1 text-xs">
          {timeOnly(event.event_date)}
          <span className="mx-1.5">・</span>
          {shortLocation(event.location)}
        </p>

        {event.capacity !== null && (
          <div className="mt-2 flex items-center gap-2">
            <div className="bg-canvas h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${tight ? "bg-amber" : "bg-grass"}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <span className="text-ink-soft text-[11px] tabular-nums">
              {event.applied}/{event.capacity}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
