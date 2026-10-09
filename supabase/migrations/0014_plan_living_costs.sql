-- 0014: ライフプランの生活費・昇給率、ローンの返済額見直し方式・金利変更予定
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run
--
-- 既存テーブルへの列追加だけ (新しいテーブルなし) なので、0012 の GRANT は不要。

-- 前提: 昇給率 / 退職後の生活費 / 積立を現預金から払うか
alter table life_plan_settings
  add column if not exists income_growth_rate numeric(5,2) default 0,      -- 昇給率 (%/年)。現役中の年間収入に毎年かかる
  add column if not exists retire_expense bigint,                          -- 退職後の生活費 (円/年・今の価値)。null なら現役と同じ
  add column if not exists contribution_from_cash boolean default false;   -- 積立を現預金(給与)から払う

comment on column life_plan_settings.income_growth_rate is '昇給率(%/年)。退職するまで年間収入に毎年かける';
comment on column life_plan_settings.retire_expense is '退職後の年間生活費(今の価値)。インフレ率で毎年増える。nullなら現役時代の生活費を続ける';
comment on column life_plan_settings.contribution_from_cash is 'true なら毎月の積立を現預金から払う(クレカ積立・給与天引きなど)';

-- ローン: 返済額の見直し方式 / 金利の変更予定
alter table life_plan_loans
  add column if not exists review_rule text,         -- none(見直しなし) / five(5年ルール) / half(半年ごと・上限なし)
  add column if not exists rate_change_month text,   -- 金利が変わる月 'YYYY-MM'
  add column if not exists rate_after numeric(6,3);  -- 変更後の金利 (%)

comment on column life_plan_loans.review_rule is '返済額の見直し: none / five(5年ごと・上限125%) / half(半年ごと・上限なし)。nullは five_year_rule から判定';
comment on column life_plan_loans.rate_change_month is '金利が変わる月 (YYYY-MM)';
comment on column life_plan_loans.rate_after is '変更後の金利 (%)';
