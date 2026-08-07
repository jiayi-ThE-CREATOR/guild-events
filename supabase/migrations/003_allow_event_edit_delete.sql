-- 003 アプリからイベントを編集・削除できるようにする
--
-- events は select と insert のポリシーしか無いため、編集・削除ボタンから
-- update / delete しても RLS に弾かれる。
-- しかもエラーにならず「0 件更新／0 件削除」で成功したように見えるので
-- 気付きにくい（アプリ側でも 0 件なら失敗として扱うようにしてある）。
--
-- applications は event_id が ON DELETE CASCADE なので、
-- イベントを消すとその申請もまとめて消える。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

drop policy if exists "update_events" on events;
create policy "update_events" on events
  for update using (true) with check (true);

drop policy if exists "delete_events" on events;
create policy "delete_events" on events
  for delete using (true);
