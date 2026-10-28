// SEO/GEO 統一 helper：canonical、description escape、JSON-LD 輸出
// 原則：預設安全（escape），開頁者可 override；唔好俾 template 直接砌 raw HTML。

const CANONICAL_BASE = process.env.SEO_CANONICAL_BASE || 'https://www.ohyagroups.net';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 壓縮空白，meta description 用
function normalizeDescription(s, maxLen = 160) {
  if (s == null) return '';
  let t = String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > maxLen) t = t.slice(0, maxLen - 1).trim() + '…';
  return t;
}

function canonicalFor(pathname) {
  if (!pathname) return CANONICAL_BASE + '/';
  const p = String(pathname);
  return CANONICAL_BASE + (p.startsWith('/') ? p : '/' + p);
}

// JSON-LD stringify（保護 `</script>` injection）
function jsonLd(obj) {
  if (!obj) return '';
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

module.exports = {
  CANONICAL_BASE,
  escapeHtml,
  normalizeDescription,
  canonicalFor,
  jsonLd,
};
