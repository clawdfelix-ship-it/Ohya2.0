const { extractBreadcrumbCategoryNames } = require('./mzakkaBreadcrumb');

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8594;/g, '→')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return String(s || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(s) {
  return decodeHtmlEntities(String(s || ''))
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeInlineText(s) {
  return normalizeText(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function parseYenValue(s) {
  const m = String(s || '').match(/(\d[\d,]*)\s*円/);
  if (!m) return null;
  return Number(String(m[1]).replace(/,/g, ''));
}

function extractItemIdFromUrl(url) {
  const m = String(url || '').match(/[?&]item_id=([A-Za-z0-9_-]+)/);
  return m ? String(m[1]) : null;
}

function absoluteUrl(url, baseUrl = 'https://mzakka.com') {
  try {
    return new URL(String(url || ''), baseUrl).toString();
  } catch {
    return String(url || '');
  }
}

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

function extractCurrentPage(html) {
  const canonical = String(html || '').match(/<link[^>]+rel="canonical"[^>]+href="[^"]*?[?&]p1=(\d+)"/i);
  if (!canonical) return 1;
  return Number(canonical[1]) + 1;
}

function extractTotalPages(html) {
  const matches = [...String(html || '').matchAll(/[?&]p1=(\d+)/g)].map((m) => Number(m[1]));
  if (!matches.length) return 1;
  return Math.max(...matches) + 1;
}

function parsePriceBlock(html) {
  const text = normalizeInlineText(html);
  const values = [...text.matchAll(/(\d[\d,]*)\s*円/g)].map((m) => Number(String(m[1]).replace(/,/g, '')));
  if (!values.length) {
    return { priceYen: null, originalPriceYen: null };
  }
  if (values.length === 1) {
    return { priceYen: values[0], originalPriceYen: null };
  }
  return {
    priceYen: values[values.length - 1],
    originalPriceYen: values[0],
  };
}

function parseMzakkaCategoryPage(html, options = {}) {
  const baseUrl = options.baseUrl || 'https://mzakka.com';
  const out = [];
  const liMatches = String(html || '').match(/<li\b[\s\S]*?<\/li>/gi) || [];

  for (const block of liMatches) {
    const detailMatch = block.match(/<a[^>]+href="([^"]*item\.php\?item_id=[^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*>/i);
    if (!detailMatch) continue;

    const detailUrl = absoluteUrl(detailMatch[1], baseUrl);
    const itemId = extractItemIdFromUrl(detailUrl);
    if (!itemId) continue;

    const nameMatch = block.match(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i);
    const summaryMatch = block.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<p class="stock">/i);
    const stockMatch = block.match(/<p class="stock">([\s\S]*?)<\/p>/i);
    const priceMatch = block.match(/<p class="price">([\s\S]*?)<\/p>/i);

    const name = normalizeInlineText(nameMatch ? nameMatch[1] : '');
    if (!name) continue;

    const prices = parsePriceBlock(priceMatch ? priceMatch[1] : '');
    out.push({
      id: itemId,
      name,
      productUrl: detailUrl,
      imageUrl: absoluteUrl(detailMatch[2], baseUrl),
      summary: normalizeText(summaryMatch ? stripTags(summaryMatch[1]) : ''),
      statusText: normalizeInlineText(stockMatch ? stockMatch[1] : ''),
      priceYen: prices.priceYen,
      originalPriceYen: prices.originalPriceYen,
    });
  }

  return {
    currentPage: extractCurrentPage(html),
    totalPages: extractTotalPages(html),
    items: out,
  };
}

function extractTableField(html, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<th[^>]*>\\s*${escaped}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  const m = String(html || '').match(re);
  return m ? m[1] : '';
}

function extractDetailImages(html, itemId) {
  const normalizedId = String(itemId || '').trim();
  if (!normalizedId) return [];
  const imageRe = new RegExp(`https://i\\.mzakka\\.com/item/${normalizedId}/[^"'\\s>]+\\.(?:jpg|jpeg|png|gif|webp)`, 'gi');
  const images = [...String(html || '').matchAll(imageRe)].map((m) => String(m[0]));
  return Array.from(new Set(images));
}

function extractCategoryPath(html) {
  const names = extractBreadcrumbCategoryNames(html);
  const deduped = [];
  for (const name of names) {
    const trimmed = String(name || '').trim();
    if (!trimmed) continue;
    if (isPseudoCategory(trimmed)) continue;
    if (!deduped.includes(trimmed)) deduped.push(trimmed);
  }
  return deduped.join(' > ');
}

function parseMzakkaDetailPage(html, options = {}) {
  const productUrl = options.productUrl ? absoluteUrl(options.productUrl) : null;
  const itemIdFromUrl = productUrl ? extractItemIdFromUrl(productUrl) : null;
  const itemId = normalizeInlineText(extractTableField(html, '商品番号')) || itemIdFromUrl || null;
  const name = normalizeInlineText(extractTableField(html, '商品名'));
  const priceField = extractTableField(html, '販売価格');
  const originalField = extractTableField(html, '定価');
  const statusText = normalizeInlineText(extractTableField(html, '出荷'));

  let priceYen = null;
  const taxIncluded = String(priceField).match(/税込\s*(\d[\d,]*)\s*円/i);
  if (taxIncluded) {
    priceYen = Number(String(taxIncluded[1]).replace(/,/g, ''));
  } else {
    priceYen = parseYenValue(priceField);
  }

  const originalPriceYen = parseYenValue(originalField);
  const images = extractDetailImages(html, itemId);
  const category = extractCategoryPath(html);

  return {
    id: itemId,
    name,
    description: options.extractDescription ? options.extractDescription(html) : '',
    category,
    priceYen,
    originalPriceYen,
    images,
    statusText,
    productUrl,
    isEnded: statusText.includes('販売終了'),
  };
}

module.exports = {
  absoluteUrl,
  decodeHtmlEntities,
  extractItemIdFromUrl,
  normalizeInlineText,
  normalizeText,
  parseMzakkaCategoryPage,
  parseMzakkaDetailPage,
  parsePriceBlock,
  parseYenValue,
};
