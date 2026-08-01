"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/profile";

const NAV = [
  {
    href: "/",
    label: "イベント",
    match: (p: string) => p === "/" || p.startsWith("/events"),
  },
  {
    href: "/mypage",
    label: "マイページ",
    match: (p: string) => p.startsWith("/mypage"),
  },
];

/** PC 幅だけで出るヘッダー。モバイルは BottomNav が担当する */
export default function SiteHeader() {
  const pathname = usePathname();
  const profile = useProfile();

  return (
    <header className="border-line sticky top-0 z-20 hidden border-b bg-white/90 backdrop-blur md:block">
      <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-8 px-6">
        <Link href="/" className="shrink-0">
          <span className="text-ink block text-base font-bold">
            GUILD イベント
          </span>
          <span className="text-ink-soft block text-[11px]">
            阪大 × 京大 AIコミュニティ
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-navy-soft text-navy"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/mypage"
          aria-label="マイページ"
          className="bg-navy-soft text-navy flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        >
          {profile ? (
            profile.name.trim().charAt(0)
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.5" fill="currentColor" />
              <path
                d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
                fill="currentColor"
              />
            </svg>
          )}
        </Link>
      </div>
    </header>
  );
}
