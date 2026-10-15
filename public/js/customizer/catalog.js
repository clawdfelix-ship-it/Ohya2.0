(function attachCustomizerCatalog(global) {
  function indexTemplatesByProductType(templates = []) {
    return templates.reduce((accumulator, template) => {
      const key = String(template.product_type_id || template.productTypeId || '');
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(template);
      return accumulator;
    }, {});
  }

  function normalizeCatalogPayload(payload = {}) {
    const productTypes = Array.isArray(payload.productTypes) ? payload.productTypes : [];
    const templates = Array.isArray(payload.templates) ? payload.templates : [];
    const assets = Array.isArray(payload.assets) ? payload.assets : [];

    return {
      productTypes,
      templates,
      templatesByProductType: indexTemplatesByProductType(templates),
      assets,
    };
  }

  function findDefaultProductType(catalog, preferredId) {
    if (preferredId) {
      return catalog.productTypes.find((item) => String(item.id) === String(preferredId)) || null;
    }
    return catalog.productTypes[0] || null;
  }

  function findDefaultTemplate(catalog, productTypeId, preferredId) {
    const candidates = catalog.templatesByProductType[String(productTypeId)] || [];
    if (preferredId) {
      return candidates.find((item) => String(item.id) === String(preferredId)) || null;
    }
    return candidates[0] || null;
  }

  global.CustomizerCatalog = {
    normalizeCatalogPayload,
    findDefaultProductType,
    findDefaultTemplate,
  };
})(window);
