const crypto = require('node:crypto');

function isPseudoCategory(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (s.includes('新商品')) return true;
  if (s.includes('新規取扱')) return true;
  if (s.includes('注目商品')) return true;
  if (s.includes('ランキング')) return true;
  if (s.includes('上半期')) return true;
  if (s.includes('下半期')) return true;
  if (/\d{4}年/.test(s)) return true;
  return false;
}

function extractCategorySegments(category) {
  if (typeof category !== 'string') return ['未分類'];
  const parts = category
    .split(' > ')
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .filter((s) => !isPseudoCategory(s));
  return parts.length ? parts : ['未分類'];
}

function getRootCategoryName(category) {
  return extractCategorySegments(category)[0] || '未分類';
}

function getLeafCategoryName(category) {
  const segments = extractCategorySegments(category);
  return segments[segments.length - 1] || '未分類';
}

function makeCategorySlug(name) {
  const h = crypto.createHash('sha1').update(String(name || ''), 'utf8').digest('hex').slice(0, 16);
  return `mzakka-cat-${h}`;
}

function makeProductSlug(mzakkaId) {
  return `mzakka-${String(mzakkaId || '').toLowerCase()}`;
}

function normalizeTextOrNull(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function toProductUpsertInput(item, categoryId) {
  const name = String(item.name || '').trim();
  const description = normalizeTextOrNull(item.description);
  const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
  const image_url = images[0] || null;
  const gallery_images = images;

  const name_zh_hk = name || '未命名商品';
  const description_zh_hk = description || name_zh_hk;

  return {
    name: name_zh_hk,
    name_zh_hk,
    slug: makeProductSlug(item.id),
    description,
    description_zh_hk,
    short_description_zh_hk: null,
    price: Number.isFinite(item.priceYen) ? Number(item.priceYen) : 0,
    original_price: Number.isFinite(item.originalPriceYen) ? Number(item.originalPriceYen) : null,
    category_id: categoryId,
    image_url,
    gallery_images,
    status: 'active',
  };
}

function toSkuUpsertInput(item, productId) {
  return {
    product_id: productId,
    sku: String(item.id || ''),
    attributes: {},
    stock: 0,
    is_active: true,
  };
}

module.exports = {
  extractCategorySegments,
  getLeafCategoryName,
  getRootCategoryName,
  makeCategorySlug,
  makeProductSlug,
  toProductUpsertInput,
  toSkuUpsertInput,
};
