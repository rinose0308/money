-- 0005: 外貨対応 + 支出カテゴリマスタ
-- 実行: Supabase Dashboard → SQL Editor → New query → このファイルの内容を貼り付け → Run

-- ============================================================
-- 口座: 外貨フラグ + 通貨コード
-- ============================================================
alter table accounts
  add column if not exists is_foreign_currency boolean default false,
  add column if not exists currency_code text;

-- ============================================================
-- スナップショット: 外貨額 + 為替レート
-- balance はそのまま「JPYベースの値」
-- 外貨口座の場合: foreign_amount * exchange_rate を四捨五入したものを balance に保存
-- ============================================================
alter table asset_snapshots
  add column if not exists foreign_amount numeric(15, 4),
  add column if not exists exchange_rate numeric(10, 4);

-- ============================================================
-- 支出カテゴリマスタ
-- ============================================================
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  display_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_expense_categories_hh on expense_categories(household_id);

alter table expense_categories enable row level security;

drop policy if exists "expense_categories: household members" on expense_categories;
create policy "expense_categories: household members" on expense_categories
  for all using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
