-- 0007: ライフプランの住宅ローン(ペアローン対応・複数可)
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run

create table if not exists life_plan_loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid references household_members(id) on delete set null,  -- 名義(任意)
  label text,                            -- ラベル(任意。名義がない場合など)
  current_balance bigint not null default 0,   -- 現在残高(円)
  interest_rate numeric(6,3) default 0,        -- 金利(年利%)
  start_year int,                              -- 借入年
  term_years int,                              -- 返済年数(総額)
  display_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_life_plan_loans_hh on life_plan_loans(household_id);

alter table life_plan_loans enable row level security;
drop policy if exists "life_plan_loans: household members" on life_plan_loans;
create policy "life_plan_loans: household members" on life_plan_loans
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
