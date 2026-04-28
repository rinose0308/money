-- 0002: 世帯テーブルに目標金額を追加
-- 実行: Supabase Dashboard → SQL Editor → New query → このファイルの内容を貼り付け → Run

alter table households
  add column if not exists target_total_amount bigint;

comment on column households.target_total_amount is '総資産の目標額(円)';
