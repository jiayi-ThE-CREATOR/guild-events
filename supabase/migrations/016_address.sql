-- 016 イベント・会議に「住所」（任意）を持たせる
--
-- 場所（location）は「大阪大学 豊中キャンパス B203」のような表示用の名前。
-- 住所（address）は地図で探せる住所（例：大阪府豊中市待兼山町1-1）で、画面では Google マップへのリンクになる。
-- 入れていないイベント・会議は null のまま（何も出さない）。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。
-- events の列はブラウザが読むので、このコードを出す前に流すこと（無いとイベントの一覧が開けない）。

alter table events add column if not exists address text;
alter table meetings add column if not exists address text;
