-- 012 会議ごとに Google Meet のリンクを作る
--
-- meet_hosts：Meet のリンクを作るための Google の許可（refresh token）。メンバーごとに 1 つ。
-- 主催者が自分の Google アカウントでマイページからつなぐ。カレンダー連携（calendar_sources）とは
-- 別の許可（scope は meetings.space.created だけ）なので、別のテーブルに分けている。
-- meetings.meet_url：作った Meet のリンク。作らなかった・作れなかった会議は null。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists meet_hosts (
  member_name text primary key,
  email text not null,
  refresh_token text not null,
  created_at timestamptz not null default now()
);

alter table meet_hosts enable row level security;

alter table meetings add column if not exists meet_url text;
