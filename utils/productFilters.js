'use strict';

/**
 * Clear only the price/stock facets while retaining catalog discovery context.
 * Values are encoded here; EJS additionally HTML-escapes the resulting href.
 */
function buildFacetClearUrl({ category, q, sort } = {}) {
  const params = new URLSearchParams();
  const normalizedCategory = typeof category === 'string' ? category.trim() : '';
  const normalizedQuery = typeof q === 'string' ? q.trim() : '';
  const normalizedSort = typeof sort === 'string' ? sort.trim() : '';

  if (normalizedCategory && normalizedCategory !== 'all') params.set('category', normalizedCategory);
  if (normalizedQuery) params.set('q', normalizedQuery);
  if (normalizedSort) params.set('sort', normalizedSort);
  params.set('page', '1');

  return `/products?${params.toString()}`;
}

module.exports = { buildFacetClearUrl };
