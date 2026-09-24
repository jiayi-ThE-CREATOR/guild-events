-- 005 日程調整：会議（募集中 → 締切で自動決定）
--
-- meetings        会議そのもの。締切を過ぎると定時ジョブが候補の一番早い時間に決める
-- meeting_declines 「参加できない」を押した人。行の追加・削除だけにして、
--                  配列の上書きで同時操作が消えないようにしている
--
-- どちらも RLS 有効・ポリシー無し（calendar_sources と同じ）。
-- 決定には各自のカレンダーを読む必要があり、どのみちサーバーを通るので、
-- 読み書きも app/api/meetings/ の Route Handler だけに寄せている。
--
-- 締切の定時処理は Supabase の pg_cron で動かす（README「会議の自動決定」）。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  organizer text not null,
  participants text[] not null,
  duration_min int not null,
  -- 候補を探す範囲（日本時間）
  from_date date not null,
  days int not null,
  day_start_min int not null,
  day_end_min int not null,
  -- この時刻を過ぎたら結果を発表する
  deadline timestamptz not null,
  -- open: 募集中 / confirmed: 決定 / failed: A-1 人もそろう時間が無かった
  status text not null default 'open' check (status in ('open', 'confirmed', 'failed')),
  confirmed_start timestamptz,
  -- 決定した時間に参加できる人数 / 計算に入った人数
  confirmed_available int,
  confirmed_total int,
  -- カレンダー未連携・読み込み失敗で計算に入らなかった人
  excluded text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists meetings_open_deadline on meetings (deadline) where status = 'open';

create table if not exists meeting_declines (
  meeting_id uuid not null references meetings (id) on delete cascade,
  member_name text not null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, member_name)
);

alter table meetings enable row level security;
alter table meeting_declines enable row level security;
