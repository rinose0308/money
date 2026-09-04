// データアクセス層 (Supabase CRUD ラッパー)
import { supabase, getMyProfile } from '/js/supabase.js';

// ============================================================
// 名義 (household_members)
// ============================================================
export async function listMembers({ includeInactive = false } = {}) {
  let q = supabase
    .from('household_members')
    .select('id, name, color, display_order, is_active, linked_profile_id, birth_year')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createMember({ name, color = '#3b82f6', linked_profile_id = null, display_order = 0 }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  const { data, error } = await supabase
    .from('household_members')
    .insert({
      household_id: profile.household_id,
      name, color, linked_profile_id, display_order,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateMember(id, updates) {
  const { data, error } = await supabase
    .from('household_members')
    .update(updates)
    .eq('id', id)
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  const { error } = await supabase.from('household_members').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================================
// 口座 (accounts)
// ============================================================

export async function listAccounts({ includeInactive = false } = {}) {
  let q = supabase
    .from('accounts')
    .select('id, name, account_type, owner_profile_id, owner_member_id, display_order, is_active, is_foreign_currency, currency_code, created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createAccount({ name, account_type, owner_member_id = null, display_order = 0, is_foreign_currency = false, currency_code = null }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      household_id: profile.household_id,
      name,
      account_type,
      owner_member_id,
      display_order,
      is_foreign_currency,
      currency_code,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 一括: 名義リスト
export async function bulkCreateMembers(names, { defaultColor = '#3b82f6' } = {}) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  if (names.length === 0) return [];
  // 既存の最大display_orderの次から
  const existing = await listMembers({ includeInactive: true });
  const startOrder = (existing[existing.length - 1]?.display_order ?? -1) + 1;
  const rows = names.map((name, idx) => ({
    household_id: profile.household_id,
    name,
    color: defaultColor,
    display_order: startOrder + idx,
  }));
  const { data, error } = await supabase.from('household_members').insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

// 一括: 口座 (名前のみ。typeはbank、その他はデフォルト)
export async function bulkCreateAccounts(specs) {
  // specs: [{ name, account_type?, owner_member_id?, is_foreign_currency?, currency_code? }] か string[]
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  if (specs.length === 0) return [];
  const existing = await listAccounts({ includeInactive: true });
  const startOrder = (existing[existing.length - 1]?.display_order ?? -1) + 1;
  const rows = specs.map((s, idx) => {
    const obj = typeof s === 'string' ? { name: s } : s;
    return {
      household_id: profile.household_id,
      name: obj.name,
      account_type: obj.account_type ?? 'bank',
      owner_member_id: obj.owner_member_id ?? null,
      is_foreign_currency: obj.is_foreign_currency ?? false,
      currency_code: obj.currency_code ?? null,
      display_order: startOrder + idx,
    };
  });
  const { data, error } = await supabase.from('accounts').insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

// 一括: 名義削除 (ハードDelete: 関連レコードのリンクは外れる)
export async function bulkDeleteMembers(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('household_members').delete().in('id', ids);
  if (error) throw error;
}

// 一括: 口座非表示化 (softDelete)
export async function bulkDeactivateAccounts(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('accounts').update({ is_active: false }).in('id', ids);
  if (error) throw error;
}

export async function updateAccount(id, updates) {
  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateAccount(id) {
  return updateAccount(id, { is_active: false });
}

// ============================================================
// 月次資産スナップショット (asset_snapshots)
// ============================================================

export async function listSnapshots({ accountId = null, fromDate = null, toDate = null } = {}) {
  let q = supabase
    .from('asset_snapshots')
    .select('id, account_id, snapshot_date, member_id, balance, foreign_amount, exchange_rate, unrealized_pnl, source, note')
    .order('snapshot_date', { ascending: true });

  if (accountId) q = q.eq('account_id', accountId);
  if (fromDate)  q = q.gte('snapshot_date', fromDate);
  if (toDate)    q = q.lte('snapshot_date', toDate);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// member_id を考慮した upsert (delete-then-insert方式)
export async function upsertSnapshot({ account_id, snapshot_date, member_id = null, balance, unrealized_pnl = null, source = 'manual', note = null }) {
  // 既存の同条件レコード(NULLは厳密にNULL一致)を削除
  let delQ = supabase.from('asset_snapshots').delete()
    .eq('account_id', account_id)
    .eq('snapshot_date', snapshot_date);
  delQ = (member_id == null) ? delQ.is('member_id', null) : delQ.eq('member_id', member_id);
  const { error: delErr } = await delQ;
  if (delErr) throw delErr;

  const { data, error } = await supabase
    .from('asset_snapshots')
    .insert({ account_id, snapshot_date, member_id, balance, unrealized_pnl, source, note })
    .select().single();
  if (error) throw error;
  return data;
}

// 月次入力: 1つの口座について「その月の全スナップショットを置換」する
// rows: [{ member_id (null可), balance, foreign_amount?, exchange_rate?, unrealized_pnl?, note? }]
export async function replaceAccountMonthSnapshots({ account_id, year, month, rows, source = 'manual' }) {
  const date = monthEndDate(year, month);

  const { error: delErr } = await supabase
    .from('asset_snapshots')
    .delete()
    .eq('account_id', account_id)
    .eq('snapshot_date', date);
  if (delErr) throw delErr;

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('asset_snapshots')
    .insert(rows.map(r => ({
      account_id,
      snapshot_date: date,
      member_id: r.member_id ?? null,
      balance: r.balance,
      foreign_amount: r.foreign_amount ?? null,
      exchange_rate: r.exchange_rate ?? null,
      unrealized_pnl: r.unrealized_pnl ?? null,
      note: r.note ?? null,
      source,
    })))
    .select();
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// 支出カテゴリマスタ (expense_categories)
// ============================================================
export async function listExpenseCategories({ includeInactive = false } = {}) {
  let q = supabase
    .from('expense_categories')
    .select('id, name, display_order, is_active')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createExpenseCategory({ name, display_order = 0 }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ household_id: profile.household_id, name, display_order })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateExpenseCategory(id, updates) {
  const { data, error } = await supabase
    .from('expense_categories')
    .update(updates)
    .eq('id', id)
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteExpenseCategory(id) {
  const { error } = await supabase.from('expense_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkCreateExpenseCategories(names) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  if (names.length === 0) return [];
  const existing = await listExpenseCategories({ includeInactive: true });
  const startOrder = (existing[existing.length - 1]?.display_order ?? -1) + 1;
  const rows = names.map((name, idx) => ({
    household_id: profile.household_id,
    name,
    display_order: startOrder + idx,
  }));
  const { data, error } = await supabase.from('expense_categories').insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

export async function bulkDeleteExpenseCategories(ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('expense_categories').delete().in('id', ids);
  if (error) throw error;
}

// 月次の月末日 (snapshot_dateの規約と統一)
export function monthEndDate(year, month1to12) {
  const d = new Date(year, month1to12, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================================
// 収入 (incomes)
// ============================================================
export async function listIncomes({ fromDate, toDate } = {}) {
  let q = supabase
    .from('incomes')
    .select('id, earner_profile_id, earner_member_id, occurred_on, amount, category, note')
    .order('occurred_on', { ascending: true });
  if (fromDate) q = q.gte('occurred_on', fromDate);
  if (toDate)   q = q.lte('occurred_on', toDate);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// 指定月の収入を全置換 (delete then insert)
export async function replaceMonthlyIncomes({ year, month, rows }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  const date = monthEndDate(year, month);

  const { error: delErr } = await supabase
    .from('incomes')
    .delete()
    .eq('household_id', profile.household_id)
    .eq('occurred_on', date);
  if (delErr) throw delErr;

  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('incomes')
    .insert(rows.map(r => ({
      household_id: profile.household_id,
      earner_member_id: r.earner_member_id ?? null,
      occurred_on: date,
      amount: r.amount,
      category: r.category,
      note: r.note ?? null,
    })))
    .select();
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// 支出 (transactions) — 月次集計入力用 (source='monthly_manual')
// ============================================================
// 全 transactions を取得 (source問わず、エクスポート用)
export async function listTransactions({ fromDate, toDate } = {}) {
  let q = supabase
    .from('transactions')
    .select('id, occurred_on, amount, category, description, payer_member_id, source, external_id')
    .order('occurred_on', { ascending: true });
  if (fromDate) q = q.gte('occurred_on', fromDate);
  if (toDate)   q = q.lte('occurred_on', toDate);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listMonthlyTransactions({ fromDate, toDate } = {}) {
  let q = supabase
    .from('transactions')
    .select('id, occurred_on, amount, category, description, payer_member_id, source')
    .eq('source', 'monthly_manual')
    .order('occurred_on', { ascending: true });
  if (fromDate) q = q.gte('occurred_on', fromDate);
  if (toDate)   q = q.lte('occurred_on', toDate);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// 指定月の monthly_manual な支出を全置換
// rows: [{ category, amount, description, payer_member_id }]
export async function replaceMonthlyTransactions({ year, month, rows }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  const date = monthEndDate(year, month);

  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('household_id', profile.household_id)
    .eq('occurred_on', date)
    .eq('source', 'monthly_manual');
  if (delErr) throw delErr;

  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('transactions')
    .insert(rows.map(r => ({
      household_id: profile.household_id,
      occurred_on: date,
      amount: r.amount,
      category: r.category,
      description: r.description ?? null,
      source: 'monthly_manual',
      payer_member_id: r.payer_member_id ?? null,
      // external_id は名義込みの一意キー (1月複数支出を許容)
      external_id: `monthly:${date}:${r.payer_member_id ?? 'shared'}:${r.category}`,
    })))
    .select();
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// 世帯設定 (households の更新)
// ============================================================
export async function updateHousehold({ householdId, updates }) {
  const { data, error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', householdId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// ライフプラン
// ============================================================
export async function getLifePlanSettings() {
  const { data, error } = await supabase
    .from('life_plan_settings')
    .select('household_id, start_year, end_year, base_income, base_expense, return_rate, start_assets, monthly_contribution, contribution_end_year, prepay_year, prepay_cash_ratio, rate_scenario_delta, inflation_rate, retirement_year, retirement_lump_sum, pension_start_year, pension_annual, withdrawal_rate')
    .maybeSingle();
  if (error) throw error;
  return data; // null なら未設定
}

export async function saveLifePlanSettings(settings) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');
  const row = {
    household_id: profile.household_id,
    start_year: settings.start_year,
    end_year: settings.end_year,
    base_income: settings.base_income ?? 0,
    base_expense: settings.base_expense ?? 0,
    return_rate: settings.return_rate ?? 0,
    start_assets: settings.start_assets ?? null,
    monthly_contribution: settings.monthly_contribution ?? 0,
    contribution_end_year: settings.contribution_end_year ?? null,
    prepay_year: settings.prepay_year ?? null,
    prepay_cash_ratio: settings.prepay_cash_ratio ?? 80,
    rate_scenario_delta: settings.rate_scenario_delta ?? null,
    inflation_rate: settings.inflation_rate ?? 0,
    retirement_year: settings.retirement_year ?? null,
    retirement_lump_sum: settings.retirement_lump_sum ?? null,
    pension_start_year: settings.pension_start_year ?? null,
    pension_annual: settings.pension_annual ?? null,
    withdrawal_rate: settings.withdrawal_rate ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('life_plan_settings')
    .upsert(row, { onConflict: 'household_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listLifePlanYears() {
  const { data, error } = await supabase
    .from('life_plan_years')
    .select('id, year, income, expense, note')
    .order('year', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ライフプラン: 住宅ローン
export async function listLifePlanLoans() {
  const { data, error } = await supabase
    .from('life_plan_loans')
    .select('id, member_id, label, current_balance, interest_rate, start_year, term_years, display_order')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ローンを全置換 (rows: [{member_id, label, current_balance, interest_rate, start_year, term_years}])
export async function replaceLifePlanLoans(rows) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');

  const { error: delErr } = await supabase
    .from('life_plan_loans')
    .delete()
    .eq('household_id', profile.household_id);
  if (delErr) throw delErr;

  const valid = rows.filter(r => r.current_balance != null && r.current_balance > 0);
  if (valid.length === 0) return [];

  const { data, error } = await supabase
    .from('life_plan_loans')
    .insert(valid.map((r, idx) => ({
      household_id: profile.household_id,
      member_id: r.member_id ?? null,
      label: r.label ?? null,
      current_balance: r.current_balance,
      interest_rate: r.interest_rate ?? 0,
      start_year: r.start_year ?? null,
      term_years: r.term_years ?? null,
      display_order: idx,
    })))
    .select();
  if (error) throw error;
  return data ?? [];
}

// 年別上書きを全置換 (rows: [{year, income|null, expense|null, note}])
// income/expense が両方 null かつ note 空の年は保存しない (=デフォルトに戻す)
export async function replaceLifePlanYears(rows) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');

  const { error: delErr } = await supabase
    .from('life_plan_years')
    .delete()
    .eq('household_id', profile.household_id);
  if (delErr) throw delErr;

  const meaningful = rows.filter(r =>
    r.income != null || r.expense != null || (r.note && r.note.trim())
  );
  if (meaningful.length === 0) return [];

  const { data, error } = await supabase
    .from('life_plan_years')
    .insert(meaningful.map(r => ({
      household_id: profile.household_id,
      year: r.year,
      income: r.income ?? null,
      expense: r.expense ?? null,
      note: (r.note && r.note.trim()) ? r.note.trim() : null,
    })))
    .select();
  if (error) throw error;
  return data ?? [];
}

// 一括 upsert (CSVインポート用)
// 全行 member_id=NULL の前提。既存の (account_id, snapshot_date, member_id IS NULL) 行を削除してから挿入
export async function bulkUpsertSnapshots(rows) {
  if (rows.length === 0) return [];

  // 影響を受ける (account_id, snapshot_date) の一覧を抽出
  const accountToDates = new Map();
  for (const r of rows) {
    if (!accountToDates.has(r.account_id)) accountToDates.set(r.account_id, new Set());
    accountToDates.get(r.account_id).add(r.snapshot_date);
  }

  // 既存の共有スナップショットを削除
  for (const [accountId, dates] of accountToDates) {
    const { error: delErr } = await supabase
      .from('asset_snapshots')
      .delete()
      .eq('account_id', accountId)
      .in('snapshot_date', Array.from(dates))
      .is('member_id', null);
    if (delErr) throw delErr;
  }

  // 挿入 (member_id=NULL 明示)
  const chunks = [];
  for (let i = 0; i < rows.length; i += 1000) chunks.push(rows.slice(i, i + 1000));

  let all = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('asset_snapshots')
      .insert(chunk.map(r => ({ ...r, member_id: null })))
      .select();
    if (error) throw error;
    all = all.concat(data ?? []);
  }
  return all;
}

// 過去の「支払予定」を支出として一括取り込み (CSV移行用)
// records: parseLegacyCsv の records (snapshotDate, expense を使う)
// - source='monthly_manual' で入れるので、支出推移/前年比にも純資産計算にも反映される
// - external_id 'legacy-exp:<date>' で冪等 (再取込しても重複しない)
// - その月に既に手入力の支出がある場合はスキップ (二重計上防止)
export async function importLegacyExpenses(records) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');

  const rows = (records ?? []).filter(r => r.expense != null && r.expense > 0);
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const dates = rows.map(r => r.snapshotDate);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // 既存の monthly_manual 支出を取得 (取込分以外がある月は二重計上を避けてスキップ)
  const { data: existing, error: exErr } = await supabase
    .from('transactions')
    .select('occurred_on, external_id')
    .eq('household_id', profile.household_id)
    .eq('source', 'monthly_manual')
    .gte('occurred_on', minDate)
    .lte('occurred_on', maxDate);
  if (exErr) throw exErr;

  const monthsWithOther = new Set(
    (existing ?? [])
      .filter(e => !String(e.external_id ?? '').startsWith('legacy-exp:'))
      .map(e => e.occurred_on)
  );

  const toUpsert = [];
  let skipped = 0;
  for (const r of rows) {
    if (monthsWithOther.has(r.snapshotDate)) { skipped++; continue; }
    toUpsert.push({
      household_id: profile.household_id,
      occurred_on: r.snapshotDate,
      amount: r.expense,
      category: '支払予定',
      description: '過去実績(CSV取込)',
      source: 'monthly_manual',
      payer_member_id: null,
      external_id: `legacy-exp:${r.snapshotDate}`,
    });
  }

  // external_id で冪等 upsert
  const chunks = [];
  for (let i = 0; i < toUpsert.length; i += 500) chunks.push(toUpsert.slice(i, i + 500));
  let inserted = 0;
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'household_id,external_id' })
      .select();
    if (error) throw error;
    inserted += (data ?? []).length;
  }
  return { inserted, skipped };
}

// ============================================================
// 資産推移サマリー (ダッシュボード用)
// ============================================================

// 各 snapshot_date における総資産を集計して返す
// 戻り値: [{ date, total, expense, net, pnl, investTotal, principal, byAccount, byType }]
//   total       = 資産の合計
//   expense     = その月末の支払予定額(monthly_manual)
//   net         = total - expense (クレカ引き落とし後の実質資産)
//   pnl         = 含み益の合計 (入力があるものだけ)
//   investTotal = 含み益を入力した口座の評価額合計
//   principal   = investTotal - pnl (投資元本)
export async function getAssetTrend({ fromDate = null } = {}) {
  const accounts = await listAccounts({ includeInactive: true });
  const accountById = new Map(accounts.map(a => [a.id, a]));

  const snapshots = await listSnapshots({ fromDate });
  const byDate = new Map();

  for (const s of snapshots) {
    if (!byDate.has(s.snapshot_date)) byDate.set(s.snapshot_date, {
      date: s.snapshot_date, total: 0, expense: 0, net: 0,
      pnl: 0, investTotal: 0, principal: 0, byAccount: {}, byType: {},
    });
    const entry = byDate.get(s.snapshot_date);
    const balance = Number(s.balance);
    entry.total += balance;
    entry.byAccount[s.account_id] = (entry.byAccount[s.account_id] ?? 0) + balance;

    const type = accountById.get(s.account_id)?.account_type ?? 'other';
    entry.byType[type] = (entry.byType[type] ?? 0) + balance;

    // 含み益 (入力がある行のみ。元本 = 評価額 - 含み益)
    if (s.unrealized_pnl != null) {
      entry.pnl += Number(s.unrealized_pnl);
      entry.investTotal += balance;
    }
  }

  // 月次入力の支出 (= 支払予定) を月末日ごとに集計
  let q = supabase
    .from('transactions')
    .select('occurred_on, amount')
    .eq('source', 'monthly_manual');
  if (fromDate) q = q.gte('occurred_on', fromDate);
  const { data: txs, error } = await q;
  if (error) throw error;

  const expenseByDate = new Map();
  for (const tx of (txs ?? [])) {
    expenseByDate.set(tx.occurred_on, (expenseByDate.get(tx.occurred_on) ?? 0) + Number(tx.amount));
  }
  for (const entry of byDate.values()) {
    entry.expense = expenseByDate.get(entry.date) ?? 0;
    entry.net = entry.total - entry.expense;
    entry.principal = entry.investTotal - entry.pnl;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
