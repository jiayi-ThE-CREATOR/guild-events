"use client";

import Link from "next/link";
import PageHeader from "./PageHeader";
import { ORGANIZERS, isOrganizer } from "@/lib/members";
import { useProfile } from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";

/**
 * 運営だけに見せたい画面の入口。
 * 認証が無いので、これは「見せる／見せない」の制御にすぎない。
 * API を直接叩けば誰でも操作できる点は変わらない。
 */
export default function OrganizerGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const isClient = useIsClient();
  const profile = useProfile();

  if (!isClient) {
    return (
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title={title} />
        <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
      </div>
    );
  }

  if (!isOrganizer(profile?.name)) {
    return (
      <div className="md:mx-auto md:max-w-xl">
        <PageHeader title={title} />
        <div className="border-line mx-4 rounded-2xl border border-dashed p-6 text-center md:mx-0 md:p-8">
          <p className="text-ink text-sm font-bold">
            この操作ができるのは運営だけです
          </p>
          <p className="text-ink-soft mt-2 text-xs leading-relaxed">
            現在の担当：{ORGANIZERS.join("・")}
            <br />
            {profile
              ? `この端末は「${profile.name}」として登録されています。`
              : "この端末はまだ登録されていません。"}
            <br />
            運営の方は{" "}
            <Link href="/mypage" className="text-navy underline">
              マイページ
            </Link>{" "}
            で自分の名前を選んでから開いてください。
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
