"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "イベント", match: (p: string) => p === "/" || p.startsWith("/events") },
  { href: "/mypage", label: "マイページ", match: (p: string) => p.startsWith("/mypage") },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="border-line fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] border-t bg-white/95 backdrop-blur">
      <ul className="grid grid-cols-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                  active ? "text-navy" : "text-ink-soft"
                }`}
              >
                {tab.href === "/" ? (
                  <CalendarIcon filled={active} />
                ) : (
                  <PersonIcon filled={active} />
                )}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

function CalendarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="4"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 3v4M16 3v4"
        stroke={filled ? "#fff" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3.5 10h17" stroke={filled ? "#fff" : "currentColor"} strokeWidth="1.8" />
    </svg>
  );
}

function PersonIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="4"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
