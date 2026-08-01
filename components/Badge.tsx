import type { Campus } from "@/lib/format";

const TONES = {
  navy: "bg-navy-soft text-navy",
  grass: "bg-grass-soft text-grass",
  amber: "bg-amber-soft text-amber",
  muted: "bg-canvas text-ink-soft",
  /** 灰色の面の上に乗せるとき用 */
  outline: "bg-white text-ink-soft",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function CampusBadge({ campus }: { campus: Campus }) {
  return <Badge tone={campus === "オンライン" ? "muted" : "navy"}>{campus}</Badge>;
}

/** 残席から「受付中 / あとN席」を出し分ける（締切処理は行わない） */
export function SeatBadge({ remaining }: { remaining: number | null }) {
  if (remaining === null) return <Badge tone="grass">受付中</Badge>;
  if (remaining === 0) return <Badge tone="muted">満席</Badge>;
  if (remaining <= 5) return <Badge tone="amber">あと{remaining}席</Badge>;
  return <Badge tone="grass">受付中</Badge>;
}
