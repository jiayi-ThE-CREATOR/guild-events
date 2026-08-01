-- GUILD イベント管理運営システム / Supabase セットアップ
-- Supabase ダッシュボード左メニュー「SQL Editor」→「New query」に貼って Run。
-- 上から順に 1 回ずつ実行すれば、この SQL だけで完成する。

-- ============================================================
-- ① テーブル作成（ハンズオン資料 STEP 15）
-- ============================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  event_date timestamptz not null,
  capacity int,
  created_at timestamptz default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  university text not null,
  status text default 'applied',
  -- ↓ 申請フォームの入力項目に合わせた任意カラム（資料の設計に 2 本だけ追加）
  discord text,
  note text,
  created_at timestamptz default now()
);

-- 名前で自分の申請を引くので索引を張っておく
create index applications_name_idx on applications (name);
create index applications_event_id_idx on applications (event_id);

-- ============================================================
-- ② セキュリティ設定 RLS（STEP 16）— 勉強会用に全開放
--    本番サービスではこの設定は NG。ログインと組み合わせて絞るのが本来の姿。
-- ============================================================
alter table events enable row level security;
alter table applications enable row level security;

create policy "read_events" on events
  for select using (true);

create policy "all_applications" on applications
  for all using (true) with check (true);

-- ============================================================
-- ③ サンプルデータ（STEP 17）
--    lib/mockData.ts と同じ内容。班で自由に変えてよい。
-- ============================================================
insert into events (title, description, location, event_date, capacity) values
  ('GUILD勉強会 #1 Claude Code ハンズオン',
   'Claude Code と Supabase を使って、この日のうちに Web アプリを1本公開します。プログラミング経験ゼロでも大丈夫。初参加も大歓迎です！',
   '大阪大学 豊中キャンパス B203', '2026-08-01 14:00+09', 30),
  ('もくもく会 vol.6',
   '各自すきなものを開発する自由会。途中入退室OK、質問し合いながらゆるく進めます。',
   '京都大学 吉田キャンパス', '2026-08-08 13:00+09', 20),
  ('合同LT大会',
   '5分LT×8本。テーマ自由。聞くだけの参加も歓迎です。登壇希望はひとこと欄にどうぞ。',
   'オンライン（Discord）', '2026-08-15 18:00+09', 25),
  ('もくもく会 vol.5',
   '各自すきなものを開発する自由会。',
   '京都大学 吉田キャンパス', '2026-07-12 13:00+09', 20);
