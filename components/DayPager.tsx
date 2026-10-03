"use client";

/**
 * 日付の列が多い表を 1 週間（7 日）ずつめくるための前へ／次へ。
 * 1 ページに収まるときは何も出さない。
 */
export const DAYS_PER_PAGE = 7;

export function pageCount(columns: number): number {
  return Math.max(1, Math.ceil(columns / DAYS_PER_PAGE));
}

/** そのページに出す列の番号 */
export function pageColumns(columns: number, page: number): number[] {
  const start = page * DAYS_PER_PAGE;
  return Array.from({ length: Math.min(DAYS_PER_PAGE, columns - start) }, (_, i) => start + i);
}

export default function DayPager({
  page,
  pages,
  label,
  onChange,
}: {
  page: number;
  pages: number;
  /** 今のページの範囲（例：10/5〜10/11） */
  label: string;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const button = "border-line text-ink hover:bg-canvas rounded-lg border bg-white px-3 py-1.5 text-[13px] font-semibold disabled:opacity-30";
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} className={button}>
        ◀ 前へ
      </button>
      <span className="text-ink-soft text-[13px]">
        {label}（{page + 1}/{pages}）
      </span>
      <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} className={button}>
        次へ ▶
      </button>
    </div>
  );
}
