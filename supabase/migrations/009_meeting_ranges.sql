-- 009 会議の候補を複数持てるようにする
--
-- ranges = [{"fromDate":"2026-10-03","toDate":"2026-10-05","dayStartMin":780,"dayEndMin":1080}, ...]
-- 1 件は「fromDate〜toDate の毎日 dayStartMin〜dayEndMin」（日本時間、0 時からの分）。
-- 古い列（from_date / days / day_start_min / day_end_min）には、候補全体を覆う範囲を入れ続ける
-- （一覧や既存の処理がそのまま動くように）。ranges が null の古い会議は、
-- 古い列から 1 件の候補として扱う（lib/ranges.ts の meetingRanges）。
--
-- SQL Editor に貼って Run するだけ。何度実行しても安全。

alter table meetings add column if not exists ranges jsonb;
