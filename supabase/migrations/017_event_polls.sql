-- 017 イベントの日程調整の 2 回目：候補から何個か選んで投票する
--
-- 1 回目（みんなの予定から候補を出す）のあと、主催者が候補を選んで投票にできる。
-- meetings.status に voting（投票中）を足す。投票中の deadline は投票の締め切り。
-- meeting_poll_options：投票の選択肢（開始・終了）。募集をやり直すと消す。
-- meeting_poll_votes：「参加できる」に印を付けた人（選択肢ごとに 1 人 1 行）。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

alter table meetings drop constraint if exists meetings_status_check;
alter table meetings add constraint meetings_status_check
  check (status in ('open', 'voting', 'confirmed', 'failed'));
create index if not exists meetings_voting_deadline on meetings (deadline) where status = 'voting';

create table if not exists meeting_poll_options (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, start_at)
);

create table if not exists meeting_poll_votes (
  option_id uuid not null references meeting_poll_options (id) on delete cascade,
  member_name text not null,
  created_at timestamptz not null default now(),
  primary key (option_id, member_name)
);

alter table meeting_poll_options enable row level security;
alter table meeting_poll_votes enable row level security;
