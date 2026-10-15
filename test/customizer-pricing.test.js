const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePriceBreakdown, decideFulfillmentPath } = require('../models/customizer/pricing');

test('calculatePriceBreakdown applies quantity tier and extras', () => {
  const breakdown = calculatePriceBreakdown({
    quantity: 12,
    baseUnitPrice: 100,
    quantityTiers: [
      { min: 1, max: 9, unitAdjustment: 0 },
      { min: 10, max: 49, unitAdjustment: -10 },
    ],
    extras: [
      { code: 'name', quantity: 12, unitPrice: 5 },
      { code: 'logo', quantity: 2, unitPrice: 20 },
    ],
  });

  assert.equal(breakdown.quantityTier.unitAdjustment, -10);
  assert.equal(breakdown.effectiveUnitPrice, 90);
  assert.equal(breakdown.subtotal, 1080);
  assert.equal(breakdown.extrasTotal, 100);
  assert.equal(breakdown.total, 1180);
});

test('decideFulfillmentPath returns direct_order when rule set is complete', () => {
  const path = decideFulfillmentPath({
    pricingComplete: true,
    requiresReview: false,
    isQuotePreferred: false,
    templateAllowsDirectOrder: true,
    assetReviewRequired: false,
    quantity: 15,
    directOrderMaxQuantity: 30,
  });

  assert.equal(path, 'direct_order');
});

test('decideFulfillmentPath returns quote_required when pricing is incomplete', () => {
  const path = decideFulfillmentPath({
    pricingComplete: false,
    quantity: 5,
    directOrderMaxQuantity: 30,
  });

  assert.equal(path, 'quote_required');
});

test('decideFulfillmentPath returns quote_required when quantity exceeds direct threshold', () => {
  const path = decideFulfillmentPath({
    pricingComplete: true,
    templateAllowsDirectOrder: true,
    quantity: 60,
    directOrderMaxQuantity: 30,
  });

  assert.equal(path, 'quote_required');
});
