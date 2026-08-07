"use client";

import {
  downloadIcs,
  googleCalendarUrl,
  outlookLiveUrl,
  outlookOffice365Url,
} from "@/lib/calendar";
import type { EventRecord } from "@/lib/types";

/** 申請済みの人に出す、カレンダー登録の導線 */
export default function CalendarLinks({ event }: { event: EventRecord }) {
  const links = [
    { label: "Outlook（個人アカウント）", href: outlookLiveUrl(event) },
    { label: "Outlook（Office365）", href: outlookOffice365Url(event) },
    { label: "Google", href: googleCalendarUrl(event) },
  ];

  return (
    <section className="border-line rounded-2xl border bg-white p-4 md:p-5">
      <h2 className="text-ink text-sm font-bold md:text-base">
        カレンダーと連携
      </h2>

      <p className="text-ink-soft mt-2 text-[11px] leading-relaxed md:text-xs">
        ※ Outlook / Google はログイン済みであることをご確認ください。
        <br />※ Outlook
        は組織アカウントの場合は Office365 でカレンダー追加をするようにしてください。
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadIcs(event)}
          className="bg-navy hover:bg-ink inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors"
        >
          iCal（ダウンロード）
          <DownloadIcon />
        </button>

        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-navy hover:bg-ink inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors"
          >
            {link.label}
            <ExternalIcon />
          </a>
        ))}
      </div>

      <p className="text-ink-soft mt-3 text-[11px]">
        終了時刻は登録されていないため、開始から2時間で登録されます。
      </p>
    </section>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
