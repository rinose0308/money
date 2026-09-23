-- 0012: Data API (PostgREST) への明示的な GRANT
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run
--
-- 背景:
--   Supabase は 2026-10-30 から「public スキーマに新しく作ったテーブルを
--   Data API に自動公開する」のをやめる (既存テーブルは影響なし)。
--   → 以後に作るテーブルは GRANT が無いと supabase-js から permission denied になる。
--   https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
--
-- このファイルの役割:
--   今ある全テーブルに、これまで暗黙で付いていたのと同じ権限を明示的に付け直す。
--   本番では実質「今と同じ状態」を書き下すだけなので、動作は何も変わらない。
--   意味があるのは、将来このマイグレーション一式を新しいプロジェクトに流し直すとき。
--   これが無いと 10/30 以降に作ったプロジェクトではテーブルが一切読めないアプリになる。
--
-- 安全性:
--   全12テーブルで RLS が有効なので、anon に select を与えても行は返らない。
--   GRANT は「そのロールがテーブルに触れるか」、RLS は「どの行が見えるか」の別レイヤー。
--   anon の select が必要なのは、キープアライブ (GitHub Actions) が anon キーで
--   REST を叩いて HTTP 200 を確認しているため。権限が無いと 401 になり、
--   「プロジェクトが停止した」と誤判定して復旧APIを叩いてしまう。

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- 確認用: 各テーブルにどのロールの権限が付いているか
--   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
--   group by table_name, grantee order by table_name, grantee;

-- ============================================================
-- 【今後テーブルを追加するときのテンプレート】
-- 2026-10-30 以降は、create table と同じマイグレーションに必ずこれを書くこと。
-- 書き忘れると、そのテーブルだけアプリから見えない (permission denied) 状態になる。
--
--   create table if not exists public.新しいテーブル ( ... );
--   alter table 新しいテーブル enable row level security;
--   create policy "own household" on 新しいテーブル
--     for all using (household_id = public.my_household_id())
--     with check (household_id = public.my_household_id());
--
--   grant select on public.新しいテーブル to anon;
--   grant select, insert, update, delete on public.新しいテーブル to authenticated;
--   grant select, insert, update, delete on public.新しいテーブル to service_role;
-- ============================================================
