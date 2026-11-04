function productSearchLike(query) {
  const term = String(query == null ? '' : query).trim();
  return `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

// EXISTS keeps one product row even when it has several matching SKUs. The
// storefront and public API can therefore share this with their COUNT queries.
function buildProductSearchCondition(paramIndex) {
  const parameter = `$${paramIndex}`;
  return `EXISTS (
    SELECT 1 FROM product_skus ps_code
    WHERE ps_code.product_id = p.id
      AND ps_code.is_active = true
      AND (
        ps_code.sku ILIKE ${parameter} ESCAPE '\\'
        OR ps_code.barcode ILIKE ${parameter} ESCAPE '\\'
      )
  )`;
}

module.exports = { buildProductSearchCondition, productSearchLike };
