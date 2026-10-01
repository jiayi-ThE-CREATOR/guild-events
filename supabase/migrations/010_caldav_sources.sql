-- 010 カレンダー連携に CalDAV（Lark など）を足す
--
-- provider = 'caldav' の行は secret に {"url","username","password"} の JSON を入れる。
-- password は Lark の「CalDAV 同期」で発行される同期専用のもので、Lark 側でいつでも作り直せる。
-- 他の連携と同じく、RLS 有効・ポリシー無しのテーブルなのでブラウザからは読めない。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

alter table calendar_sources drop constraint if exists calendar_sources_provider_check;
alter table calendar_sources add constraint calendar_sources_provider_check
  check (provider in ('google', 'microsoft', 'ics', 'caldav'));
