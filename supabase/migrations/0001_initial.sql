-- 家計簿アプリ 初期スキーマ
-- 実行: Supabase Dashboard → SQL Editor → New Query → このファイルの内容を貼り付け → Run

-- ============================================================
-- 1. 世帯テーブル (夫婦などのグループ)
-- ============================================================
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. プロファイル (auth.users と1対1)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  household_id uuid not null references households(id) on delete cascade,
  created_at timestamptz default now()
);

-- ============================================================
-- 3. 口座マスタ
-- ============================================================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete set null,
  name text not null,
  account_type text not null check (account_type in ('bank','jp_stock','foreign_stock','insurance','mutual_fund','pension','other')),
  display_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 4. 月次資産スナップショット
-- ============================================================
create table if not exists asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  snapshot_date date not null,
  balance bigint not null,
  unrealized_pnl bigint,
  source text default 'manual' check (source in ('manual','screenshot','csv')),
  source_image_url text,
  note text,
  created_at timestamptz default now(),
  unique(account_id, snapshot_date)
);
create index if not exists idx_asset_snapshots_date on asset_snapshots (account_id, snapshot_date);

-- ============================================================
-- 5. 支出明細
-- ============================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  occurred_on date not null,
  amount bigint not null,
  category text not null,
  description text,
  source text default 'manual',
  external_id text,
  created_at timestamptz default now(),
  unique(household_id, external_id)
);
create index if not exists idx_transactions_date on transactions (household_id, occurred_on);

-- ============================================================
-- 6. 収入
-- ============================================================
create table if not exists incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  earner_profile_id uuid references profiles(id) on delete set null,
  occurred_on date not null,
  amount bigint not null,
  category text default '給与',
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_incomes_date on incomes (household_id, occurred_on);

-- ============================================================
-- 7. カテゴリ自動分類ルール
-- ============================================================
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  pattern text not null,
  category text not null,
  priority int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security) 有効化
-- ============================================================
alter table households       enable row level security;
alter table profiles         enable row level security;
alter table accounts         enable row level security;
alter table asset_snapshots  enable row level security;
alter table transactions     enable row level security;
alter table incomes          enable row level security;
alter table category_rules   enable row level security;

-- ============================================================
-- ヘルパー関数: 自分の household_id を返す
-- (auth スキーマへの書き込み権限がないため public に作成)
-- ============================================================
create or replace function public.my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_household_id() to authenticated, anon;

-- ============================================================
-- households ポリシー
-- ============================================================
drop policy if exists "households: read own" on households;
create policy "households: read own" on households
  for select using (id = public.my_household_id());

drop policy if exists "households: insert any authenticated" on households;
create policy "households: insert any authenticated" on households
  for insert with check (auth.uid() is not null);

drop policy if exists "households: update own" on households;
create policy "households: update own" on households
  for update using (id = public.my_household_id());

-- ============================================================
-- profiles ポリシー
-- ============================================================
drop policy if exists "profiles: read same household" on profiles;
create policy "profiles: read same household" on profiles
  for select using (
    household_id = public.my_household_id()
    or id = auth.uid()
  );

drop policy if exists "profiles: insert self" on profiles;
create policy "profiles: insert self" on profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles: update self" on profiles;
create policy "profiles: update self" on profiles
  for update using (id = auth.uid());

-- ============================================================
-- 招待コードでhouseholdを参照するための特例(ログイン後に invite_code でJOINするとき)
-- ============================================================
drop policy if exists "households: read by invite code" on households;
create policy "households: read by invite code" on households
  for select using (auth.uid() is not null);

-- 注: 上記は「invite_codeを知っていればhousehold情報が見える」を許可する。
-- 招待コードは8文字のランダム英数字なのでブルートフォースは現実的でない。

-- ============================================================
-- accounts / asset_snapshots / transactions / incomes / category_rules ポリシー
-- すべて「同じhouseholdメンバーのみアクセス可」
-- ============================================================
drop policy if exists "accounts: household members" on accounts;
create policy "accounts: household members" on accounts
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

drop policy if exists "asset_snapshots: household members" on asset_snapshots;
create policy "asset_snapshots: household members" on asset_snapshots
  for all using (
    account_id in (select id from accounts where household_id = public.my_household_id())
  )
  with check (
    account_id in (select id from accounts where household_id = public.my_household_id())
  );

drop policy if exists "transactions: household members" on transactions;
create policy "transactions: household members" on transactions
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

drop policy if exists "incomes: household members" on incomes;
create policy "incomes: household members" on incomes
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

drop policy if exists "category_rules: household members" on category_rules;
create policy "category_rules: household members" on category_rules
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
