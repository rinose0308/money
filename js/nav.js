// 共通ナビゲーションをページ先頭に挿入
import { signOut } from '/js/supabase.js';

const links = [
  { href: '/dashboard.html',   label: 'ダッシュボード' },
  { href: '/monthly.html',     label: '月次入力' },
  { href: '/import.html',      label: '取り込み' },
  { href: '/settings.html',    label: '設定' },
];

export function renderNav(activeHref) {
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.innerHTML = `
    <div class="brand">💰 我が家マネー</div>
    <div class="nav-links">
      ${links.map(l => `<a href="${l.href}"${l.href === activeHref ? ' class="active"' : ''}>${l.label}</a>`).join('')}
      <button type="button" id="signout-btn" class="btn btn-ghost" style="padding:0.4rem 0.7rem;font-size:0.85rem;min-height:auto;">ログアウト</button>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  document.getElementById('signout-btn').addEventListener('click', () => signOut());
}
