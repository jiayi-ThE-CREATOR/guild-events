-- 004 日程調整：メンバーごとのカレンダー連携を保存する
--
-- Google の refresh token や iPhone カレンダーの共有リンクは、
-- それ自体が「その人の予定を読める鍵」になる。
-- 他のテーブルと違い RLS を有効にしたまま **ポリシーを 1 つも作らない**。
-- こうするとブラウザ（anon key）からは読むことも書くこともできず、
-- サーバー（app/api/ の Route Handler が secret key で接続）だけが触れる。
--
-- secret key は Vercel の環境変数 SUPABASE_SECRET_KEY にだけ置く。
-- NEXT_PUBLIC_ を付けないこと（付けるとブラウザに配られてしまう）。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists calendar_sources (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  -- google / ics（iPhone など共有リンク）。microsoft は後で足す
  provider text not null check (provider in ('google', 'microsoft', 'ics')),
  -- 画面に出す名前（Google ならメールアドレス、ICS ならカレンダー名）
  label text not null,
  -- google: refresh token / ics: 共有リンク
  secret text not null,
  created_at timestamptz not null default now(),
  unique (member_name, provider, secret)
);

create index if not exists calendar_sources_member on calendar_sources (member_name);

alter table calendar_sources enable row level security;
