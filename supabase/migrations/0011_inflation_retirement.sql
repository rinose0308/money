-- 0011: インフレ率・退職金・年金・取り崩し率
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

alter table life_plan_settings
  -- ① インフレ率: 支出が毎年この率で増える想定 (%)
  add column if not exists inflation_rate numeric(5,2) default 0,

  -- ② 退職金 / 年金
  add column if not exists retirement_year int,            -- 退職する年 (この年以降 給与収入がなくなる)
  add column if not exists retirement_lump_sum bigint,     -- 退職金(一時金)
  add column if not exists pension_start_year int,         -- 年金の受給開始年
  add column if not exists pension_annual bigint,          -- 年金の年額(世帯合計)

  -- ④ 取り崩し率: 退職後、資産から年何%を生活費に充てるか (%)
  add column if not exists withdrawal_rate numeric(5,2);

comment on column life_plan_settings.inflation_rate is '想定インフレ率(%)。支出が毎年この率で増える';
comment on column life_plan_settings.retirement_year is '退職年。この年以降は給与収入が0になる';
comment on column life_plan_settings.retirement_lump_sum is '退職金(一時金)。退職年に現預金へ加算';
comment on column life_plan_settings.pension_start_year is '年金の受給開始年';
comment on column life_plan_settings.pension_annual is '年金の年額(世帯合計)';
comment on column life_plan_settings.withdrawal_rate is '退職後の取り崩し率(%)。年初資産のこの割合を上限に取り崩す。nullなら制限なし';
