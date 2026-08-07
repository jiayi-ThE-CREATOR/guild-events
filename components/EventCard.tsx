import Link from "next/link";
import { Badge, CampusBadge, SeatBadge } from "./Badge";
import {
  campusOf,
  dateBlock,
  remainingSeats,
  shortLocation,
  timeOnly,
} from "@/lib/format";
import type { EventWithCount } from "@/lib/types";

export default function EventCard({
  event,
  past = false,
}: {
  event: EventWithCount;
  past?: boolean;
}) {
  const { month, day, weekday } = dateBlock(event.event_date);
  const remaining = remainingSeats(event.capacity, event.applied);
  const ratio = event.capacity
    ? Math.min(event.applied / event.capacity, 1)
    : 0;
  const tight = remaining !== null && remaining <= 5;

  return (
    <Link
      href={`/events/${event.id}`}
      className={`border-line flex gap-3 rounded-2xl border p-3 transition-colors md:p-4 ${
        past ? "bg-canvas" : "hover:border-navy/30 bg-white"
      }`}
    >
      <div className="w-11 shrink-0 text-center md:w-12">
        <div
          className={`text-[11px] font-semibold ${past ? "text-ink-soft" : "text-amber"}`}
        >
          {month}
        </div>
        <div
          className={`text-2xl leading-tight font-bold ${past ? "text-ink-soft" : "text-ink"}`}
        >
          {day}
        </div>
        <div className="text-ink-soft text-[11px]">{weekday}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap gap-1.5">
          <CampusBadge campus={campusOf(event.location)} />
          {past ? (
            <Badge tone="muted">終了</Badge>
          ) : (
            <SeatBadge remaining={remaining} />
          )}
        </div>

        <h2
          className={`text-[15px] leading-snug font-bold md:text-base ${past ? "text-ink-soft" : "text-ink"}`}
        >
          {event.title}
        </h2>

        <p className="text-ink-soft mt-1 text-xs">
          {timeOnly(event.event_date)}
          <span className="mx-1.5">・</span>
          {shortLocation(event.location)}
        </p>

        {event.capacity !== null && (
          <div className="mt-2 flex items-center gap-2">
            <div
              className={`h-1.5 flex-1 overflow-hidden rounded-full ${past ? "bg-line" : "bg-canvas"}`}
            >
              <div
                className={`h-full rounded-full ${
                  past ? "bg-ink-soft" : tight ? "bg-amber" : "bg-grass"
                }`}
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
