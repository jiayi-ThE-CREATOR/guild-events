-- 008 決まった会議への参加登録（あとから参加する／やめる）
--
-- 自動で決まった後に、本人が「参加する」「参加をやめる」を押した記録。
-- 1 人 1 行（押し直したら上書き）なので、同時に押されても取り合いにならない。
-- 表示は「決定時の参加できる人」をこの記録で上書きしたもの（app/api/meetings/[id]）。
-- 参加者に選ばれていなかったメンバーも登録できる（登録した時点で参加者に加わる）。
--
-- RLS 有効・ポリシー無し。読み書きは app/api/ の Route Handler だけ。
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

create table if not exists meeting_rsvps (
  meeting_id uuid not null references meetings (id) on delete cascade,
  member_name text not null,
  attending boolean not null,
  updated_at timestamptz not null default now(),
  primary key (meeting_id, member_name)
);

alter table meeting_rsvps enable row level security;
