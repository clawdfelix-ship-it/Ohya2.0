const STOCK_FIRST_ORDER = '(COALESCE(s.total_stock, 0) > 0) DESC';

function getProductsOrderBy(sortKey) {
  const key = typeof sortKey === 'string' ? sortKey : '';

  const map = {
    stock_first: `${STOCK_FIRST_ORDER}, p.created_at DESC, p.id DESC`,
    recommend: 'p.is_featured DESC, p.created_at DESC',
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC, p.created_at DESC',
    price_desc: 'p.price DESC, p.created_at DESC',
    popular: 'COALESCE(p.review_count, 0) DESC, COALESCE(p.average_rating, 0) DESC, p.created_at DESC',
  };

  return map[key] || map.stock_first;
}

function normalizeProductsSort(sortKey) {
  const key = typeof sortKey === 'string' ? sortKey : '';
  const allowed = new Set(['stock_first', 'recommend', 'newest', 'price_asc', 'price_desc', 'popular']);
  // 全站預設「現貨優先」；有現貨排前，同組以最新上架及商品 ID 確定次序。
  return allowed.has(key) ? key : 'stock_first';
}

// 動態新到專區保留原排行榜次序，只將有現貨商品放到前面。
function withStockPriority(orderBy) {
  return `${STOCK_FIRST_ORDER}, ${orderBy}`;
}

module.exports = { getProductsOrderBy, normalizeProductsSort, withStockPriority };

