-- 0015: 住宅ローンの「現在残高」を入力した月
-- 実行: Supabase Dashboard → SQL Editor → New query → 貼り付け → Run
--
-- 入力した残高はその月時点の値なので、そのままだと毎月の返済で減る分が反映されず古くなる。
-- 入力した月を覚えておき、そこから今月までの返済を計算エンジンで進めて、今の残高を出す
-- (ライフプランとホームの「住宅ローン差引後の純資産」で同じ残高を使う)。
-- 列の追加だけ (新しいテーブルなし) なので、0012 の GRANT は不要。

alter table life_plan_loans
  add column if not exists balance_month text;   -- 現在残高を入力した月 'YYYY-MM' (その月の返済前の残高)

comment on column life_plan_loans.balance_month is
  '現在残高を入力した月 (YYYY-MM)。この月の返済前の残高として扱い、以後の返済は計算で進める。nullなら保存日(created_at)の月';
