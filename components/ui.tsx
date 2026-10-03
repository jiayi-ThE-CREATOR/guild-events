"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ミーティング系の画面で共通に使う見た目の部品。
 * - ボタンは 3 段階だけ：主（塗り）／副（枠線）／文字リンク
 * - 区切りは「小見出し＋件数」。カードを入れ子にしない
 * - めったに使わない操作は「⋯」メニューに入れ、開いたら上にパネルで出す
 */

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30";
export const btn = {
  primary: `bg-navy hover:bg-ink rounded-lg px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40 ${focus}`,
  secondary: `border-line text-ink hover:bg-canvas rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold disabled:opacity-40 ${focus}`,
  text: `text-navy text-[13px] font-semibold hover:underline disabled:opacity-40 ${focus}`,
};

/** 入力欄の見た目（ミーティング系で統一） */
export const field =
  "border-line focus:border-navy text-ink w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none";

export function SectionTitle({
  title,
  meta,
  right,
}: {
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-ink text-sm font-bold">
        {title}
        {meta !== undefined && <span className="text-ink-soft ml-2 text-[13px] font-normal">{meta}</span>}
      </h2>
      {right}
    </div>
  );
}

/** 状態を表す小さなラベル（募集中・決定など） */
export function Tag({ tone, children }: { tone: "amber" | "grass" | "muted" | "navy"; children: React.ReactNode }) {
  const tones = {
    amber: "bg-amber-soft text-amber",
    grass: "bg-grass-soft text-grass",
    muted: "bg-canvas text-ink-soft",
    navy: "bg-navy-soft text-navy",
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** 参加者の状態の色の点 */
export const DOT = {
  connected: "bg-grass",
  manual: "bg-osaka",
  unconnected: "bg-white border border-ink-soft/50",
  unreadable: "bg-amber",
  declined: "bg-ink-soft/40",
} as const;

export function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

/** 「⋯」メニュー。外を押すと閉じる */
export function Menu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="その他の操作"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`border-line text-ink hover:bg-canvas flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-lg leading-none ${focus}`}
      >
        ⋯
      </button>
      {open && (
        <div className="border-line absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border bg-white py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`hover:bg-canvas block w-full px-3.5 py-2.5 text-left text-sm ${it.danger ? "text-kyoto" : "text-ink"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ドロップダウン（「カレンダーに追加 ▾」など） */
export function Dropdown({
  label,
  items,
}: {
  label: string;
  items: { label: string; href?: string; onClick?: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={btn.secondary}>
        {label} ▾
      </button>
      {open && (
        <div className="border-line absolute left-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border bg-white py-1 shadow-lg">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="text-ink hover:bg-canvas block px-3.5 py-2.5 text-sm">
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className="text-ink hover:bg-canvas block w-full px-3.5 py-2.5 text-left text-sm"
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** 2〜3 択の切り替え（リスト／表 など） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="border-line flex shrink-0 overflow-hidden rounded-lg border text-[13px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-3 py-1 ${value === o.value ? "bg-navy font-semibold text-white" : "text-ink-soft bg-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 「⋯」などから開く操作パネル。ページの上部に出し、× で閉じる */
export function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-navy/20 mt-3 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-ink text-sm font-bold">{title}</h2>
        <button type="button" aria-label="閉じる" onClick={onClose} className="text-ink-soft hover:text-ink px-1 text-lg leading-none">
          ×
        </button>
      </div>
      {children}
    </section>
  );
}

/** 補足の小さな文 */
export function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-ink-soft text-xs leading-relaxed ${className}`}>{children}</p>;
}

/** エラー表示 */
export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-amber bg-amber-soft rounded-lg px-3 py-2 text-[13px]">{children}</p>;
}
