-- 0008: ライフプランに毎月の積立額を追加
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

alter table life_plan_settings
  add column if not exists monthly_contribution bigint default 0,   -- 毎月の積立額(円)
  add column if not exists contribution_end_year int;               -- 積立終了年(null=期間終了まで継続)

comment on column life_plan_settings.monthly_contribution is '毎月の積立額(円)。現預金から運用資産へ移す想定';
comment on column life_plan_settings.contribution_end_year is '積立を続ける最終年。nullなら期間終了まで継続';
