(function attachCustomizerCatalog(global) {
  function normalizeZone(zone = {}) {
    const rules = zone.rules_json && typeof zone.rules_json === 'object'
      ? zone.rules_json
      : zone.rules && typeof zone.rules === 'object'
        ? zone.rules
        : {};
    const defaults = zone.default_values_json && typeof zone.default_values_json === 'object'
      ? zone.default_values_json
      : zone.defaultValues && typeof zone.defaultValues === 'object'
        ? zone.defaultValues
        : {};

    return {
      id: zone.id ?? null,
      templateId: zone.template_id ?? zone.templateId ?? null,
      zoneKey: String(zone.zone_key || zone.zoneKey || '').trim(),
      zoneName: String(zone.zone_name || zone.zoneName || zone.zone_key || zone.zoneKey || '').trim(),
      sortOrder: Number.isFinite(Number(zone.sort_order ?? zone.sortOrder))
        ? Number(zone.sort_order ?? zone.sortOrder)
        : 0,
      allowColor: zone.allow_color ?? zone.allowColor ?? rules.allowColor ?? true,
      allowPattern: zone.allow_pattern ?? zone.allowPattern ?? rules.allowPattern ?? false,
      allowLogo: zone.allow_logo ?? zone.allowLogo ?? rules.allowLogo ?? false,
      allowText: zone.allow_text ?? zone.allowText ?? rules.allowText ?? false,
      bounds: zone.bounds_json || zone.bounds || null,
      defaultValues: defaults,
      rules,
    };
  }

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

  function normalizeTemplateDetail(payload = {}) {
    return {
      template: payload.template || null,
      zones: Array.isArray(payload.zones) ? payload.zones.map(normalizeZone) : [],
    };
  }

  function listAssetsForSelection(catalog = {}, selection = {}, assetTypes = []) {
    const assets = Array.isArray(catalog.assets) ? catalog.assets : [];
    const productTypeId = selection.productTypeId ?? selection.product_type_id ?? null;
    const templateId = selection.templateId ?? selection.template_id ?? null;
    const allowedTypes = Array.isArray(assetTypes) && assetTypes.length
      ? assetTypes.map((type) => String(type))
      : null;

    return assets.filter((asset) => {
      const assetProductTypeId = asset.product_type_id ?? asset.productTypeId ?? null;
      const assetTemplateId = asset.template_id ?? asset.templateId ?? null;
      const assetType = String(asset.asset_type || asset.assetType || '');

      if (allowedTypes && !allowedTypes.includes(assetType)) return false;
      if (productTypeId && assetProductTypeId && String(assetProductTypeId) !== String(productTypeId)) return false;
      if (templateId && assetTemplateId && String(assetTemplateId) !== String(templateId)) return false;
      return true;
    });
  }

  global.CustomizerCatalog = {
    normalizeCatalogPayload,
    normalizeTemplateDetail,
    findDefaultProductType,
    findDefaultTemplate,
    listAssetsForSelection,
  };
})(window);
