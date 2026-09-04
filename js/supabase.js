// Supabase クライアント初期化
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// 現在のセッション/ユーザー
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

// 自分のプロファイル取得 (なければ null)
// ページ内では結果をキャッシュする。api.js の保存系が毎回呼ぶため、
// キャッシュしないと保存のたびに session + profiles の2往復が余分に走る。
let _profilePromise = null;
export async function getMyProfile({ force = false } = {}) {
  if (!force && _profilePromise) return _profilePromise;
  _profilePromise = (async () => {
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, household_id, households(id, name, invite_code, target_total_amount)')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  })();
  try {
    const p = await _profilePromise;
    if (!p) _profilePromise = null;   // 未作成なら次回また取りに行く (オンボーディング直後など)
    return p;
  } catch (err) {
    _profilePromise = null;
    throw err;
  }
}

// ログアウト
export async function signOut() {
  _profilePromise = null;
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

// 認証ガード: 未ログインなら /index.html へ、profile未作成なら /onboarding.html へ
export async function requireAuth({ requireProfile = true } = {}) {
  const user = await getUser();
  if (!user) {
    window.location.replace('/index.html');
    return null;
  }
  if (!requireProfile) return { user, profile: null };

  const profile = await getMyProfile();
  if (!profile) {
    window.location.replace('/onboarding.html');
    return null;
  }
  return { user, profile };
}

// 招待コード生成 (英数字8文字)
export function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい0OI1L除外
  let code = '';
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  for (const n of arr) code += chars[n % chars.length];
  return code;
}
