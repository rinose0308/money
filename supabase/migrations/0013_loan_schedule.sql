-- 0013: 住宅ローンを銀行の返済予定表どおりに計算する + 繰上げ返済の予定
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run
--
-- 新しいテーブルは作らない (既存テーブルへの列追加だけ) ので、
-- 0012 に書いた GRANT の追加は不要。列は親テーブルの権限をそのまま引き継ぐ。

-- ① ローンを予定表どおりに: 最終返済月・毎月の返済額・5年ルール
alter table life_plan_loans
  add column if not exists final_month text,            -- 最終返済月 'YYYY-MM' (予定表の最終行)
  add column if not exists monthly_payment bigint,      -- 毎月の返済額。null なら「完済まで同額」で自動計算
  add column if not exists five_year_rule boolean default false,  -- 5年ルール・125%ルールあり
  add column if not exists next_review_month text;      -- 次回の返済額見直し月 'YYYY-MM'

comment on column life_plan_loans.final_month is '最終返済月 (YYYY-MM)。返しきれない元金はこの月に一括で払う';
comment on column life_plan_loans.monthly_payment is '毎月の返済額(円)。nullなら完済まで同額になるよう自動計算';
comment on column life_plan_loans.five_year_rule is '5年ルール・125%ルール: 返済額を5年ごとに見直し、上げ幅は直前の125%まで';
comment on column life_plan_loans.next_review_month is '5年ルールの次回見直し月 (YYYY-MM)。以後5年ごと';

-- ② 繰上げ返済の予定
--   [{"loan":0, "from":2027, "to":2053, "amount":200000, "mode":"shorten"}, ...]
--   loan = ローンの並び順 (0始まり)。to が null なら from の年の1回だけ。
--   mode = shorten(期間短縮型) / reduce(返済額軽減型)
alter table life_plan_settings
  add column if not exists loan_prepayments jsonb default '[]'::jsonb;

comment on column life_plan_settings.loan_prepayments is '繰上げ返済の予定 [{loan, from, to, amount, mode}]';
