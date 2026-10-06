-- 013 会議の資料（ファイル）と、メール通知の設定
--
-- meeting_files：会議に付けた資料。本体は Supabase Storage の非公開バケット meeting-files の
--   <会議 id>/<ランダム>-<ファイル名> に置き、ここには名前・大きさ・置き場所だけを持つ。
--   ダウンロードは毎回サーバーが短時間だけ有効なリンクを発行する（バケットは公開しない）。
-- member_notify：メンバーごとのメール通知の設定。notify_email が空なら、つないでいる
--   Google などのメールアドレス（Gmail 優先）に送る。enabled = false なら送らない。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists meeting_files (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null,
  content_type text,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists meeting_files_meeting on meeting_files (meeting_id);

alter table meeting_files enable row level security;

create table if not exists member_notify (
  member_name text primary key,
  notify_email text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table member_notify enable row level security;

-- 資料の置き場。非公開・1 ファイル 50MB まで
insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-files', 'meeting-files', false, 52428800)
on conflict (id) do nothing;
