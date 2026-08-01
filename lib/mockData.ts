import type { ApplicationRecord, EventRecord } from "./types";

/**
 * Supabase 未設定時に使う初期データ。
 * supabase/schema.sql の insert 文と同じ内容にしてある。
 */
export const MOCK_EVENTS: EventRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "GUILD勉強会 #1 Claude Code ハンズオン",
    description:
      "Claude Code と Supabase を使って、この日のうちに Web アプリを1本公開します。プログラミング経験ゼロでも大丈夫。初参加も大歓迎です！",
    location: "大阪大学 豊中キャンパス B203",
    event_date: "2026-08-01T14:00:00+09:00",
    capacity: 30,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "もくもく会 vol.6",
    description:
      "各自すきなものを開発する自由会。途中入退室OK、質問し合いながらゆるく進めます。",
    location: "京都大学 吉田キャンパス",
    event_date: "2026-08-08T13:00:00+09:00",
    capacity: 20,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "合同LT大会",
    description:
      "5分LT×8本。テーマ自由。聞くだけの参加も歓迎です。登壇希望はひとこと欄にどうぞ。",
    location: "オンライン（Discord）",
    event_date: "2026-08-15T18:00:00+09:00",
    capacity: 25,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "もくもく会 vol.5",
    description: "各自すきなものを開発する自由会。",
    location: "京都大学 吉田キャンパス",
    event_date: "2026-07-12T13:00:00+09:00",
    capacity: 20,
  },
];

/**
 * デモ用の申請データ。マイページで「山田 太郎」を検索すると
 * 申込中2件・参加済1件が出る状態から始まる。
 */
export const MOCK_APPLICATIONS: ApplicationRecord[] = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    event_id: "11111111-1111-4111-8111-111111111111",
    name: "山田 太郎",
    university: "阪大",
    status: "applied",
    discord: "taro_yamada",
    note: null,
    created_at: "2026-07-20T10:00:00+09:00",
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    event_id: "33333333-3333-4333-8333-333333333333",
    name: "山田 太郎",
    university: "阪大",
    status: "applied",
    discord: "taro_yamada",
    note: null,
    created_at: "2026-07-22T10:00:00+09:00",
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    event_id: "44444444-4444-4444-8444-444444444444",
    name: "山田 太郎",
    university: "阪大",
    status: "attended",
    discord: "taro_yamada",
    note: null,
    created_at: "2026-07-01T10:00:00+09:00",
  },
  // 一覧の申請者数を mockup（19/30・7/20・22/25）に合わせるための水増し分
  ...padApplications("11111111-1111-4111-8111-111111111111", 18, "b"),
  ...padApplications("22222222-2222-4222-8222-222222222222", 7, "c"),
  ...padApplications("33333333-3333-4333-8333-333333333333", 21, "d"),
];

function padApplications(
  eventId: string,
  count: number,
  seed: string,
): ApplicationRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${seed}${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`,
    event_id: eventId,
    name: `参加者${i + 1}`,
    university: i % 2 === 0 ? "阪大" : "京大",
    status: "applied" as const,
    discord: null,
    note: null,
    created_at: "2026-07-15T10:00:00+09:00",
  }));
}
