// 共通ユーティリティ

// 通貨フォーマッタ
export function formatYen(n) {
  if (n == null || isNaN(n)) return '¥0';
  return '¥' + Math.round(Number(n)).toLocaleString('ja-JP');
}

// 短縮表記 (1.2億, 3,500万, 1.2万)
export function formatYenShort(n) {
  if (n == null || isNaN(n)) return '¥0';
  const v = Math.round(Number(n));
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}¥${(abs / 100_000_000).toFixed(2)}億`;
  if (abs >= 10_000_000)  return `${sign}¥${(abs / 10_000).toLocaleString('ja-JP', {maximumFractionDigits: 0})}万`;
  if (abs >= 10_000)      return `${sign}¥${(abs / 10_000).toFixed(1)}万`;
  return `${sign}¥${abs.toLocaleString('ja-JP')}`;
}

// 月末日 (YYYY-MM-DD)
export function lastDayOfMonth(year, month1to12) {
  const d = new Date(year, month1to12, 0);
  return formatDate(d);
}

// YYYY-MM-DD
export function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// YYYY-MM (表示用)
export function formatMonth(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

// パーセント
export function formatPercent(n, digits = 1) {
  if (n == null || isNaN(n)) return '—';
  return `${(Number(n) >= 0 ? '+' : '')}${Number(n).toFixed(digits)}%`;
}

// 簡易 toast
let _toastEl = null;
export function toast(message, type = 'info') {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.id = 'toast-container';
    _toastEl.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;max-width:90vw;';
    document.body.appendChild(_toastEl);
  }
  const colors = {
    info:    'background:#2563eb;color:white;',
    success: 'background:#16a34a;color:white;',
    error:   'background:#dc2626;color:white;',
    warn:    'background:#f59e0b;color:white;',
  };
  const item = document.createElement('div');
  item.style.cssText = `${colors[type] || colors.info};padding:0.75rem 1rem;border-radius:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:0.9rem;animation:slidein 0.2s ease-out;`;
  item.textContent = message;
  _toastEl.appendChild(item);
  setTimeout(() => {
    item.style.transition = 'opacity 0.3s, transform 0.3s';
    item.style.opacity = '0';
    item.style.transform = 'translateX(20px)';
    setTimeout(() => item.remove(), 300);
  }, 3500);
}

// async関数のエラーハンドラ (toastで表示)
export function withErrorToast(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      toast(err?.message || 'エラーが発生しました', 'error');
      throw err;
    }
  };
}
