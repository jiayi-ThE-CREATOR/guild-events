"use client";

import { useRouter } from "next/navigation";

/** 詳細・申請画面の「← タイトル」ヘッダー */
export default function PageHeader({ title }: { title: string }) {
  const router = useRouter();

  return (
    <header className="border-line sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:px-0 md:pt-0 md:pb-4 md:backdrop-blur-none">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="戻る"
        className="text-ink -ml-1 flex h-8 w-8 items-center justify-center rounded-full"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* 画面の見出し（h1）は本文側のイベント名なので、ここはラベル扱い */}
      <p className="text-ink text-sm font-bold">{title}</p>
    </header>
  );
}
