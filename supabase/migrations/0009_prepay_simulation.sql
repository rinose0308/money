-- 0009: 住宅ローンの早期返済シミュレーション設定
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

alter table life_plan_settings
  add column if not exists prepay_year int,                          -- 一括返済する年 (null=しない)
  add column if not exists prepay_cash_ratio numeric(5,2) default 80; -- 返済に充てる現預金の割合(%)

comment on column life_plan_settings.prepay_year is 'ローンを一括返済する年。nullならシミュレーションしない';
comment on column life_plan_settings.prepay_cash_ratio is '返済原資として使う現預金の割合(%)。残りは運用資産を取り崩す';
