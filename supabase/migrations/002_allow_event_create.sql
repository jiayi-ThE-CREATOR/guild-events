-- 002 アプリからイベントを作れるようにする
--
-- events は「誰でも読める」ポリシーしか無かったため、
-- アプリの作成画面から insert すると RLS で弾かれる。
-- 勉強会用の割り切りとして、誰でも作成できるようにする。
-- （本番なら運営だけが作れるようログインと組み合わせて絞る）
--
-- SQL Editor に貼って Run するだけ。データは変更しない。

drop policy if exists "insert_events" on events;

create policy "insert_events" on events
  for insert with check (true);
