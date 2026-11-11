'use strict';

const IN_STOCK_CATEGORY_SLUG = 'storefront-stock';
const IN_STOCK_SPECIAL = Object.freeze({ id: -4, slug: IN_STOCK_CATEGORY_SLUG, name: '現貨' });

function isInStockCategory(slug) {
  return slug === IN_STOCK_CATEGORY_SLUG;
}

function inStockSqlCondition(productAlias = 'p') {
  return `EXISTS (SELECT 1 FROM product_skus ps_stock
    WHERE ps_stock.product_id = ${productAlias}.id
      AND ps_stock.is_active = true AND ps_stock.stock > 0)`;
}

function withInStockSpecial({ flat, tree, specials = [] }, count) {
  const stockCount = Math.max(0, Number(count) || 0);
  return {
    flat,
    tree,
    specials: [{ ...IN_STOCK_SPECIAL, count: stockCount }, ...specials],
  };
}

function sampleInStockProducts() {
  // 無 DB 嘅開發／示範模式使用 productLoader 現有 sample，唔另行虛構庫存。
  const { getAllProducts } = require('./productLoader');
  return getAllProducts(1, Number.MAX_SAFE_INTEGER).products
    .filter((product) => Number(product.stock) > 0);
}

module.exports = {
  IN_STOCK_CATEGORY_SLUG,
  IN_STOCK_SPECIAL,
  isInStockCategory,
  inStockSqlCondition,
  withInStockSpecial,
  sampleInStockProducts,
};
