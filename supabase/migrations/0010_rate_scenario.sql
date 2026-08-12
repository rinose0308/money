-- 0010: 住宅ローン金利の A/B 比較シナリオ
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

alter table life_plan_settings
  add column if not exists rate_scenario_delta numeric(6,3);  -- 金利Bの上乗せ幅(%ポイント)。nullなら比較しない

comment on column life_plan_settings.rate_scenario_delta is
  '金利シナリオBの上乗せ幅(%ポイント)。例: 1.0 なら各ローンの金利+1.0%で再計算して比較。nullなら比較しない';
