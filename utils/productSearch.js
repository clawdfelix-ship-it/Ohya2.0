function productSearchLike(query) {
  const term = String(query == null ? '' : query).trim();
  return `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

// EXISTS keeps one product row even when it has several matching SKUs. The
// storefront and public API can therefore share this with their COUNT queries.
// Imported Mzakka products currently have no brands.brand_id populated; their
// source breadcrumb instead carries brand aliases after the manufacturer facet.
// Read both paths so "TOAMI" also finds products whose title omits that brand.
function buildProductSearchCondition(paramIndex) {
  const parameter = `$${paramIndex}`;
  return `(
    EXISTS (
      SELECT 1 FROM product_skus ps_code
      WHERE ps_code.product_id = p.id
        AND ps_code.is_active = true
        AND (
          ps_code.sku ILIKE ${parameter} ESCAPE '\\'
          OR ps_code.barcode ILIKE ${parameter} ESCAPE '\\'
        )
    )
    OR EXISTS (
      SELECT 1 FROM brands ps_brand
      WHERE ps_brand.id = p.brand_id
        AND ps_brand.name ILIKE ${parameter} ESCAPE '\\'
    )
    OR (
      p.source = 'mzakka'
      AND p.raw_payload->>'category' LIKE '%メーカー%'
      AND regexp_replace(
        regexp_replace(
          regexp_replace(
            COALESCE((
              SELECT string_agg(ps_brand_alias[1], ' ')
              FROM regexp_matches(
                p.raw_payload->>'category',
                '(?:メーカー別|メーカー、ブランド別) > ([^>]+)',
                'g'
              ) AS ps_brand_alias
            ), ''),
            '&#0*39;', '''', 'gi'
          ),
          '&apos;', '''', 'gi'
        ),
        '&amp;', '&', 'gi'
      ) ILIKE ${parameter} ESCAPE '\\'
    )
  )`;
}

module.exports = { buildProductSearchCondition, productSearchLike };
