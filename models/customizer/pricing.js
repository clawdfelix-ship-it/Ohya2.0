function resolveQuantityTier(quantity, quantityTiers = []) {
  if (!Array.isArray(quantityTiers)) return null;
  return quantityTiers.find((tier) => {
    const min = Number.isFinite(Number(tier.min)) ? Number(tier.min) : 0;
    const max = Number.isFinite(Number(tier.max)) ? Number(tier.max) : Infinity;
    return quantity >= min && quantity <= max;
  }) || null;
}

function calculatePriceBreakdown(input = {}) {
  const quantity = Number.isFinite(Number(input.quantity)) && Number(input.quantity) > 0 ? Number(input.quantity) : 0;
  const baseUnitPrice = Number.isFinite(Number(input.baseUnitPrice)) ? Number(input.baseUnitPrice) : 0;
  const tier = resolveQuantityTier(quantity, input.quantityTiers || []);
  const tierAdjustment = tier && Number.isFinite(Number(tier.unitAdjustment)) ? Number(tier.unitAdjustment) : 0;
  const effectiveUnitPrice = baseUnitPrice + tierAdjustment;
  const extras = Array.isArray(input.extras) ? input.extras : [];

  const normalizedExtras = extras.map((extra) => {
    const extraQuantity = Number.isFinite(Number(extra.quantity)) ? Number(extra.quantity) : 1;
    const unitPrice = Number.isFinite(Number(extra.unitPrice)) ? Number(extra.unitPrice) : 0;
    return {
      code: String(extra.code || ''),
      label: String(extra.label || extra.code || ''),
      quantity: extraQuantity,
      unitPrice,
      total: extraQuantity * unitPrice,
    };
  });

  const extrasTotal = normalizedExtras.reduce((sum, extra) => sum + extra.total, 0);
  const subtotal = effectiveUnitPrice * quantity;
  const total = subtotal + extrasTotal;

  return {
    quantity,
    baseUnitPrice,
    quantityTier: tier ? {
      min: Number(tier.min),
      max: Number.isFinite(Number(tier.max)) ? Number(tier.max) : null,
      unitAdjustment: tierAdjustment,
    } : null,
    quantityTierAdjustment: tierAdjustment,
    effectiveUnitPrice,
    extras: normalizedExtras,
    subtotal,
    extrasTotal,
    total,
  };
}

function decideFulfillmentPath(input = {}) {
  const quantity = Number.isFinite(Number(input.quantity)) ? Number(input.quantity) : 0;
  const directOrderMaxQuantity = Number.isFinite(Number(input.directOrderMaxQuantity))
    ? Number(input.directOrderMaxQuantity)
    : Infinity;

  if (input.pricingComplete === false) return 'quote_required';
  if (input.requiresReview === true) return 'quote_required';
  if (input.isQuotePreferred === true) return 'quote_required';
  if (input.templateAllowsDirectOrder === false) return 'quote_required';
  if (input.assetReviewRequired === true) return 'quote_required';
  if (quantity > directOrderMaxQuantity) return 'quote_required';
  return 'direct_order';
}

function createPricingModel(db) {
  return {
    async listPricingRules({ productTypeId = null, templateId = null } = {}) {
      const result = await db.query(
        `SELECT *
           FROM customizer_pricing_rules
          WHERE status = 'active'
            AND ($1::bigint IS NULL OR product_type_id = $1 OR product_type_id IS NULL)
            AND ($2::bigint IS NULL OR template_id = $2 OR template_id IS NULL)
          ORDER BY sort_order ASC, id ASC`,
        [productTypeId, templateId]
      );
      return result.rows;
    },
  };
}

module.exports = {
  calculatePriceBreakdown,
  decideFulfillmentPath,
  createPricingModel,
};
