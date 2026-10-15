const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePriceBreakdown, calculateCustomizerPricing, decideFulfillmentPath } = require('../models/customizer/pricing');

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

test('calculateCustomizerPricing resolves rules into direct order pricing', () => {
  const pricing = calculateCustomizerPricing({
    quantity: 12,
    textValues: { teamName: 'OHYA', playerName: 'CHAN' },
    rosterItems: [{}, {}],
    logoCount: 1,
    rules: [
      { rule_type: 'base_unit', pricing_json: { baseUnitPrice: 120, directOrderMaxQuantity: 30, templateAllowsDirectOrder: true } },
      { rule_type: 'quantity_tier', pricing_json: { quantityTiers: [{ min: 10, max: 30, unitAdjustment: -10 }] } },
      { rule_type: 'extra', name: 'Name Print', pricing_json: { code: 'name', label: 'Name Print', unitPrice: 5, appliesTo: 'named-items' } },
      { rule_type: 'extra', name: 'Club Logo', pricing_json: { code: 'logo', label: 'Club Logo', unitPrice: 20, appliesTo: 'logos' } },
    ],
  });

  assert.equal(pricing.effectiveUnitPrice, 110);
  assert.equal(pricing.extrasTotal, 30);
  assert.equal(pricing.fulfillmentPath, 'direct_order');
});
