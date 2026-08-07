import type { Campus } from "@/lib/format";

const TONES = {
  navy: "bg-navy-soft text-navy",
  osaka: "bg-osaka-soft text-osaka",
  kyoto: "bg-kyoto-soft text-kyoto",
  grass: "bg-grass-soft text-grass",
  amber: "bg-amber-soft text-amber",
  muted: "bg-canvas text-ink-soft",
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

/**
 * 大学のバッジは 阪大（青）／京大（赤）の2種類だけ。
 * オンラインやその他は区分を設けないので何も出さない。
 */
export function CampusBadge({ campus }: { campus: Campus }) {
  if (campus === "阪大") return <Badge tone="osaka">阪大</Badge>;
  if (campus === "京大") return <Badge tone="kyoto">京大</Badge>;
  return null;
}

/** 残席から「受付中 / あとN席」を出し分ける（締切処理は行わない） */
export function SeatBadge({ remaining }: { remaining: number | null }) {
  if (remaining === null) return <Badge tone="grass">受付中</Badge>;
  if (remaining === 0) return <Badge tone="muted">満席</Badge>;
  if (remaining <= 5) return <Badge tone="amber">あと{remaining}席</Badge>;
  return <Badge tone="grass">受付中</Badge>;
}
