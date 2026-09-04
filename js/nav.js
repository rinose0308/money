// 共通ナビゲーションをページ先頭に挿入
//  - PC: 上部バーにリンク
//  - スマホ(767px以下): 上部は世帯名とログアウトだけにして、下部タブバーで移動
import { signOut } from '/js/supabase.js';

const links = [
  { href: '/dashboard.html', label: 'ダッシュボード', short: 'ホーム',   icon: '📊' },
  { href: '/monthly.html',   label: '月次入力',       short: '月次入力', icon: '✏️' },
  { href: '/lifeplan.html',  label: 'ライフプラン',   short: 'プラン',   icon: '📈' },
  { href: '/import.html',    label: '取り込み',       short: 'データ',   icon: '📂' },
  { href: '/settings.html',  label: '設定',           short: '設定',     icon: '⚙️' },
];

export function renderNav(activeHref) {
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.innerHTML = `
    <div class="brand">💰 我が家マネー</div>
    <div class="nav-links">
      ${links.map(l => `<a href="${l.href}"${l.href === activeHref ? ' class="active"' : ''}>${l.label}</a>`).join('')}
      <button type="button" id="signout-btn" class="btn btn-ghost btn-sm">ログアウト</button>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  document.getElementById('signout-btn').addEventListener('click', () => signOut());

  // 下部タブバー (表示/非表示は CSS の media query が担当)
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  bar.setAttribute('aria-label', 'メインメニュー');
  bar.innerHTML = links.map(l => `
    <a href="${l.href}"${l.href === activeHref ? ' class="active" aria-current="page"' : ''}>
      <span class="tab-icon" aria-hidden="true">${l.icon}</span><span>${l.short}</span>
    </a>`).join('');
  document.body.appendChild(bar);
  document.body.classList.add('has-tabbar');

  // ナビの実高さを CSS 変数に流す (sticky-toolbar がリンクの折り返しで重ならないように)
  const setNavH = () => document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
  setNavH();
  if ('ResizeObserver' in window) new ResizeObserver(setNavH).observe(nav);
}
