-- 014 イベントの資料（ファイル）
--
-- event_files：イベントに付けた資料。会議の資料（013 の meeting_files）と同じ作りで、
--   本体は同じ非公開バケット meeting-files の events/<イベント id>/<ランダム> に置く。
--   ダウンロードは毎回サーバーが短時間だけ有効なリンクを発行する。
--   013 を先に流しておくこと（バケットと member_notify は 013 が作る）。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists event_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null,
  content_type text,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_files_event on event_files (event_id);

alter table event_files enable row level security;
