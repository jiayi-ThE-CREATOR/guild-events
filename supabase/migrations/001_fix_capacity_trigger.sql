-- 001 定員トリガーの修正（既に schema.sql を流した DB 向け）
--
-- 【何が起きていたか】
-- 旧版は BEFORE ROW トリガーの中で
--     select capacity into cap from events where id = new.event_id for update;
-- としていた。events は RLS 有効で SELECT ポリシーしか無いため、
-- 行ロックを伴う SELECT は 0 行しか返さない。結果 cap が NULL になり、
-- 「定員なしのイベント」として素通りしていた。
-- 実測：定員25の合同LT大会に26件目が HTTP 201 で入った。
--
-- 【修正】
-- ・security definer にして RLS を回避する
-- ・AFTER STATEMENT ＋ 遷移テーブルに変更。BEFORE ROW では 1 文で複数行を
--   insert されたとき同じ文の行が見えず、まとめて定員を超えられた
-- ・events を先にロックしてから数えるので、同時申請でも定員を超えない
--
-- SQL Editor に貼って Run するだけ。データは変更しない。

drop trigger if exists applications_capacity_guard on applications;

create or replace function check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
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
