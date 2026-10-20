-- 015 イベントの日時を、会議と同じ日程調整（みんなの予定）で決められるようにする
--
-- events.date_status：fixed＝日時が決まっている（今までのイベントはすべてこれ）
--                     scheduling＝日程調整中 / failed＝そろう時間が無かった
--   日程調整中も event_date は必須のままにし、仮に「最初の候補の開始」を入れておく（画面には出さない）。
-- events.schedule_deadline：日程調整中の結果発表の時刻（一覧に出す。会議側から写す）
-- meetings.event_id：そのイベントの日程調整に使っている会議。イベントを消すと会議も消える。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

alter table events add column if not exists date_status text not null default 'fixed';
alter table events drop constraint if exists events_date_status_check;
alter table events add constraint events_date_status_check
  check (date_status in ('fixed', 'scheduling', 'failed'));
alter table events add column if not exists schedule_deadline timestamptz;

alter table meetings add column if not exists event_id uuid references events (id) on delete cascade;
create index if not exists meetings_event_id on meetings (event_id);
