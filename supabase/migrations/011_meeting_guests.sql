-- 011 会議に外部のゲストを招く（招待リンク方式・ログイン無し）
--
-- ゲストは会議ごとに作る。招待リンクの合言葉（token）は作った瞬間に 1 回だけ画面に出し、
-- ここには sha256 のハッシュだけを残す（DB を見てもリンクは復元できない）。
-- ゲストの予定・不参加・カレンダー連携は、メンバーと同じテーブルに
-- member_name = 'guest:<このテーブルの id>' として入る（lib/guests.ts）。
-- ゲストを消すときは、それらの行もアプリ側で消す（lib/server/guests.ts の removeGuest）。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists meeting_guests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists meeting_guests_meeting on meeting_guests (meeting_id);

alter table meeting_guests enable row level security;
