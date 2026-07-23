-- 0006: ライフプラン(キャッシュフロー将来設計)
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

-- ============================================================
-- 名義に生年を追加 (年齢表示用)
-- ============================================================
alter table household_members
  add column if not exists birth_year int;

-- ============================================================
-- ライフプラン前提 (世帯に1行)
-- ============================================================
create table if not exists life_plan_settings (
  household_id uuid primary key references households(id) on delete cascade,
  start_year int not null,
  end_year int not null,
  base_income bigint default 0,        -- デフォルト年間収入
  base_expense bigint default 0,       -- デフォルト年間支出
  return_rate numeric(5,2) default 0,  -- 想定利回り(%)
  start_assets bigint,                 -- 開始資産(nullなら現在の純資産を使う)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table life_plan_settings enable row level security;
drop policy if exists "life_plan_settings: household members" on life_plan_settings;
create policy "life_plan_settings: household members" on life_plan_settings
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- ============================================================
-- 年別の上書き (収入/支出をその年だけ変える)
-- 上書きした年だけ行を持つ。無い年は base_income / base_expense を使う。
-- ============================================================
create table if not exists life_plan_years (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  year int not null,
  income bigint,   -- null なら base_income
  expense bigint,  -- null なら base_expense
  note text,
  created_at timestamptz default now(),
  unique(household_id, year)
);

create index if not exists idx_life_plan_years_hh on life_plan_years(household_id);

alter table life_plan_years enable row level security;
drop policy if exists "life_plan_years: household members" on life_plan_years;
create policy "life_plan_years: household members" on life_plan_years
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
