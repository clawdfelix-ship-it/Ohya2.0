function summarizeRoster(roster = {}) {
  const items = Array.isArray(roster.items) ? roster.items : [];
  return {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  };
}

function buildDeliverablePackage(input = {}) {
  const session = input.session || {};
  const selection = session.selection || {};
  const previews = input.previews || {};
  const pricing = input.pricing || {};

  return {
    sessionId: session.id ?? input.sessionId ?? null,
    selectedProductType: selection.productTypeId ?? selection.product_type_id ?? null,
    selectedTemplate: selection.templateId ?? selection.template_id ?? null,
    previews: {
      front: previews.front || null,
      back: previews.back || null,
    },
    rosterSummary: summarizeRoster(input.roster || session.roster || {}),
    uploadedAssetRefs: Array.isArray(input.uploadedAssets || session.uploadedAssets)
      ? (input.uploadedAssets || session.uploadedAssets)
      : [],
    pricingBreakdown: pricing,
    fulfillmentPath: pricing.fulfillmentPath || session.fulfillmentPath || 'quote_required',
  };
}

function createDeliverablesModel() {
  return {
    buildDeliverablePackage,
  };
}

module.exports = {
  buildDeliverablePackage,
  createDeliverablesModel,
};
