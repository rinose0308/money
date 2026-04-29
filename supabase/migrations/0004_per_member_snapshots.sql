-- 0004: asset_snapshots を名義別に保存可能にする
-- 各口座の月次残高を、メンバー(りょちょ・まちょ等)別に保存できるようにする
-- 既存のCSVインポート分(member_id=NULL)は「共有(家族合計)」として残る
-- 実行: Supabase Dashboard → SQL Editor → New query → このファイルの内容を貼り付け → Run

-- member_id 列を追加
alter table asset_snapshots
  add column if not exists member_id uuid references household_members(id) on delete set null;

-- 既存の unique(account_id, snapshot_date) を削除
-- (1つの口座×日付に複数のスナップショット = メンバー別に許可するため)
alter table asset_snapshots
  drop constraint if exists asset_snapshots_account_id_snapshot_date_key;

-- 部分ユニークインデックス: 共有(member_id IS NULL)は1口座×日付につき1つ
create unique index if not exists asset_snapshots_shared_unique
  on asset_snapshots(account_id, snapshot_date)
  where member_id is null;

-- 部分ユニークインデックス: メンバー別は1口座×日付×メンバーにつき1つ
create unique index if not exists asset_snapshots_member_unique
  on asset_snapshots(account_id, snapshot_date, member_id)
  where member_id is not null;

create index if not exists idx_asset_snapshots_member on asset_snapshots(member_id);
