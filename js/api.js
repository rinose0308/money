// データアクセス層 (Supabase CRUD ラッパー)
import { supabase, getMyProfile } from '/js/supabase.js';

// ============================================================
// 口座 (accounts)
// ============================================================

export async function listAccounts({ includeInactive = false } = {}) {
  let q = supabase
    .from('accounts')
    .select('id, name, account_type, owner_profile_id, display_order, is_active, created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createAccount({ name, account_type, owner_profile_id = null, display_order = 0 }) {
  const profile = await getMyProfile();
  if (!profile) throw new Error('プロファイルが見つかりません');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      household_id: profile.household_id,
      name,
      account_type,
      owner_profile_id,
      display_order,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
    .select('id, account_id, snapshot_date, balance, unrealized_pnl, source, note')
    .order('snapshot_date', { ascending: true });

  if (accountId) q = q.eq('account_id', accountId);
  if (fromDate)  q = q.gte('snapshot_date', fromDate);
  if (toDate)    q = q.lte('snapshot_date', toDate);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function upsertSnapshot({ account_id, snapshot_date, balance, unrealized_pnl = null, source = 'manual', note = null }) {
  const { data, error } = await supabase
    .from('asset_snapshots')
    .upsert(
      { account_id, snapshot_date, balance, unrealized_pnl, source, note },
      { onConflict: 'account_id,snapshot_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 一括 upsert (CSVインポート用)
export async function bulkUpsertSnapshots(rows) {
  if (rows.length === 0) return [];
  // 1000件ずつチャンク
  const chunks = [];
  for (let i = 0; i < rows.length; i += 1000) chunks.push(rows.slice(i, i + 1000));

  let all = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('asset_snapshots')
      .upsert(chunk, { onConflict: 'account_id,snapshot_date' })
      .select();
    if (error) throw error;
    all = all.concat(data ?? []);
  }
  return all;
}

// ============================================================
// 資産推移サマリー (ダッシュボード用)
// ============================================================

// 各 snapshot_date における総資産を集計して返す
// 戻り値: [{ date: 'YYYY-MM-DD', total: number, byAccount: { accountId: balance } }]
export async function getAssetTrend({ fromDate = null } = {}) {
  const accounts = await listAccounts({ includeInactive: true });
  const accountById = new Map(accounts.map(a => [a.id, a]));

  const snapshots = await listSnapshots({ fromDate });
  const byDate = new Map();

  for (const s of snapshots) {
    if (!byDate.has(s.snapshot_date)) byDate.set(s.snapshot_date, { date: s.snapshot_date, total: 0, byAccount: {}, byType: {} });
    const entry = byDate.get(s.snapshot_date);
    const balance = Number(s.balance);
    entry.total += balance;
    entry.byAccount[s.account_id] = balance;

    const type = accountById.get(s.account_id)?.account_type ?? 'other';
    entry.byType[type] = (entry.byType[type] ?? 0) + balance;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// 最新の総資産・前月比
export async function getLatestAssetSummary() {
  const trend = await getAssetTrend();
  if (trend.length === 0) return { total: 0, prevTotal: null, diff: null, latestDate: null, byType: {} };

  const latest = trend[trend.length - 1];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;

  return {
    total: latest.total,
    prevTotal: prev?.total ?? null,
    diff: prev ? latest.total - prev.total : null,
    diffPct: prev ? ((latest.total - prev.total) / prev.total) * 100 : null,
    latestDate: latest.date,
    byType: latest.byType,
  };
}
