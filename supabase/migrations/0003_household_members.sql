-- 0003: 名義(household_members)マスタを追加
-- profilesとは独立して名義を登録できるようにする
-- (奥様が未登録でも「まちょ」名義で資産・収入・支出を追跡可能に)
-- 実行: Supabase Dashboard → SQL Editor → New query → このファイルの内容を貼り付け → Run

-- ============================================================
-- 名義マスタ
-- ============================================================
create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  color text default '#3b82f6',
  display_order int default 0,
  is_active boolean default true,
  linked_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_household_members_hh on household_members(household_id);

alter table household_members enable row level security;

drop policy if exists "household_members: household members" on household_members;
create policy "household_members: household members" on household_members
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- ============================================================
-- 各テーブルに名義 (owner_member_id 等) を追加
-- ============================================================
alter table accounts
  add column if not exists owner_member_id  uuid references household_members(id) on delete set null;

alter table incomes
  add column if not exists earner_member_id uuid references household_members(id) on delete set null;

alter table transactions
  add column if not exists payer_member_id  uuid references household_members(id) on delete set null;

create index if not exists idx_accounts_owner_member  on accounts(owner_member_id);
create index if not exists idx_incomes_earner_member  on incomes(earner_member_id);
create index if not exists idx_transactions_payer_member on transactions(payer_member_id);
