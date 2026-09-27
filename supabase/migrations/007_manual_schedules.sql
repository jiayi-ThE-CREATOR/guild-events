-- 007 手動で入れる予定（外部カレンダーを使わない人・カレンダーを上書きしたい人向け）
--
-- weekly_schedules  マイページの「毎週の予定」。1 人 1 行、全部の会議に効く
-- meeting_entries   会議ページの「この会議の予定」。会議 × 人で 1 行、その会議だけに効く
--
-- cells は 30 分のマスごとの状態 {"<マスのキー>": "busy" | "free"}。
--   毎週：キーは "曜日-分"（日本時間。曜日 0=日〜6=土、分は 0 時からの分）
--   会議：キーはマスの開始時刻（UTC ミリ秒）
-- exclusive = true は「空いている（free）で塗った以外はすべて予定あり」。
-- 判定の優先順は lib/manual.ts の冒頭のコメントを参照。
--
-- どちらも RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists weekly_schedules (
  member_name text primary key,
  cells jsonb not null default '{}',
  exclusive boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists meeting_entries (
  meeting_id uuid not null references meetings (id) on delete cascade,
  member_name text not null,
  cells jsonb not null default '{}',
  exclusive boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (meeting_id, member_name)
);

alter table weekly_schedules enable row level security;
alter table meeting_entries enable row level security;
