-- 006 会議の決定結果に「誰が出られるか」と「読み込めなかった人」を残す
--
-- attendees   決定した時間に予定が空いている人（決定時点のカレンダーで判定）。
--             決定ページの「参加できる／できない」の 2 列に使う
-- unreadable  カレンダーはつないでいるが読み込めなかった人（Google の権限の
--             チェックを外していた・連携が切れた等）。これまでは excluded に
--             未連携の人と混ざっていて、「連携済みなのに未連携と出る」原因になっていた
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

alter table meetings add column if not exists attendees text[];
alter table meetings add column if not exists unreadable text[] not null default '{}';
