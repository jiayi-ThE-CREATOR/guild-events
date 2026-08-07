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
  -- applied＝申請中 / cancelled＝キャンセル済み / attended＝出席済
  -- キャンセルは行を消さず status を変える（運営に履歴を残すため）
  status text not null default 'applied'
    check (status in ('applied', 'cancelled', 'attended')),
  -- ↓ 申請フォームの入力項目に合わせた任意カラム（資料の設計に 2 本だけ追加）
  discord text,
  note text,
  created_at timestamptz default now()
);

-- 名前で自分の申請を引くので索引を張っておく
create index applications_name_idx on applications (name);
create index applications_event_id_idx on applications (event_id);

-- ============================================================
-- ② 二重申請の禁止
--    「名前＋大学」で本人を識別する設計なので、同じイベントに同じ名前は 1 件まで。
--    キャンセル済みは除くので、キャンセル後の再申請はできる。
-- ============================================================
create unique index applications_one_per_person
  on applications (event_id, name)
  where status <> 'cancelled';

-- ============================================================
-- ③ 定員オーバーの禁止
--    アプリ側でも弾いているが、同時申請では競り勝てないので DB 側で止める。
--
--    security definer が必須。RLS 有効なテーブルに SELECT ... FOR UPDATE を
--    かけると UPDATE ポリシーが無いぶん 0 行しか返らず、定員が NULL＝無制限と
--    誤判定されて素通りする（実測で踏んだ）。
--    AFTER STATEMENT ＋ 遷移テーブルにしてあるのは、1 文で複数行 insert された
--    場合に BEFORE ROW だと同じ文の行がまだ見えず数え漏らすため。
-- ============================================================
create or replace function check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- 対象イベントの行をロックしてから数える（同時申請を直列化）
  perform 1 from events
   where id in (select distinct event_id from inserted)
   order by id
     for update;

  for r in
    select e.id, e.capacity, count(a.id) as taken
      from events e
      join applications a
        on a.event_id = e.id and a.status <> 'cancelled'
     where e.id in (select distinct event_id from inserted)
     group by e.id, e.capacity
  loop
    if r.capacity is not null and r.taken > r.capacity then
      raise exception '満席のため申請できません';
    end if;
  end loop;

  return null;
end;
$$;

create trigger applications_capacity_guard
  after insert on applications
  referencing new table as inserted
  for each statement
  execute function check_event_capacity();

-- ============================================================
-- ④ セキュリティ設定 RLS（STEP 16）— 勉強会用に全開放
--    本番サービスではこの設定は NG。ログインと組み合わせて絞るのが本来の姿。
-- ============================================================
alter table events enable row level security;
alter table applications enable row level security;

create policy "read_events" on events
  for select using (true);

-- アプリの作成画面から追加できるようにする（本番なら運営だけに絞る）
create policy "insert_events" on events
  for insert with check (true);

create policy "all_applications" on applications
  for all using (true) with check (true);

-- ============================================================
-- ⑤ サンプルデータ（STEP 17）
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


-- ============================================================
-- 運営向け：ここから下はセットアップ時には実行しない。必要になったら使う。
-- ============================================================

-- ▼ 出席をとる（イベント当日の後に実行）
--   マイページの「参加済み」はこの status を見ている。
--   Table Editor で 1 件ずつ変えてもよい。
-- update applications set status = 'attended'
--  where event_id = 'ここにイベントのID' and status = 'applied';

-- ▼ イベントごとの申請者一覧（阪大・京大をまたいで確認する）
-- select e.title, a.name, a.university, a.discord, a.status, a.note, a.created_at
--   from applications a join events e on e.id = a.event_id
--  where a.status <> 'cancelled'
--  order by e.event_date, a.created_at;

-- ▼ イベントごとの人数集計（大学別）
-- select e.title, a.university, count(*)
--   from applications a join events e on e.id = a.event_id
--  where a.status <> 'cancelled'
--  group by e.title, a.university
--  order by e.title;
