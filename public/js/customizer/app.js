(function bootCustomizer(global, document) {
  const root = document.getElementById('customizer-app');
  if (!root) return;
  const DEBOUNCE_MS = 220;

  const bootstrapNode = document.getElementById('customizer-bootstrap');
  let bootstrap = {};
  if (bootstrapNode && bootstrapNode.textContent) {
    try {
      bootstrap = JSON.parse(bootstrapNode.textContent);
    } catch (error) {
      bootstrap = {};
    }
  }

  const { CustomizerApi, CustomizerState, CustomizerCatalog, CustomizerEditor, CustomizerCompositor } = global;
  const store = CustomizerState.createCustomizerStore({
    submission: {
      phase: 'booting',
      error: null,
    },
  });
  let persistTimer = null;
  const startMode = bootstrap.startMode || 'template';

  function sumRosterQuantity(items = []) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const quantity = Number(item.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
  }

  function findZoneDesignEntry(designZones, zoneKey) {
    return (Array.isArray(designZones) ? designZones : []).find((zone) => String(zone.zoneKey) === String(zoneKey)) || null;
  }

  function defaultZoneColor(zone) {
    const defaults = zone && zone.defaultValues && typeof zone.defaultValues === 'object' ? zone.defaultValues : {};
    if (typeof defaults.color === 'string' && defaults.color) return defaults.color;

    const key = String(zone && zone.zoneKey ? zone.zoneKey : '').toLowerCase();
    if (key.includes('collar')) return '#7f1d45';
    if (key.includes('sleeve')) return '#d4af37';
    if (key.includes('trim')) return '#111827';
    return '#f4f4f5';
  }

  function alignDesignWithZones(design, zones) {
    const currentZones = Array.isArray(design && design.zones) ? design.zones : [];
    const nextZones = (Array.isArray(zones) ? zones : []).map((zone) => {
      const existing = findZoneDesignEntry(currentZones, zone.zoneKey);
      return {
        zoneKey: zone.zoneKey,
        label: zone.zoneName,
        side: String(zone.zoneKey || '').includes('back') ? 'back' : 'front',
        color: existing && existing.color ? existing.color : defaultZoneColor(zone),
      };
    });

    return {
      zones: nextZones,
      texts: design && design.texts && typeof design.texts === 'object' ? { ...design.texts } : {},
      logos: Array.isArray(design && design.logos) ? design.logos : [],
      notes: design && typeof design.notes === 'string' ? design.notes : '',
    };
  }

  function setSubmissionPhase(phase, error = null) {
    store.update((state) => ({
      ...state,
      submission: { phase, error },
    }));
  }

  async function loadTemplateDetail(templateId) {
    if (!templateId) {
      store.update((state) => ({
        ...state,
        zones: [],
      }));
      return null;
    }

    const payload = await CustomizerApi.fetchTemplate(templateId);
    const detail = CustomizerCatalog.normalizeTemplateDetail(payload);
    store.update((state) => ({
      ...state,
      selectedTemplate: detail.template || state.selectedTemplate,
      zones: detail.zones,
      design: alignDesignWithZones(state.design, detail.zones),
    }));
    return detail;
  }

  async function persistDesignSelection(nextState) {
    if (!nextState.session || !nextState.session.id) return;
    const response = await CustomizerApi.saveDesign(nextState.session.id, nextState.design, {
      productTypeId: nextState.selectedProductType ? nextState.selectedProductType.id : null,
      templateId: nextState.selectedTemplate ? nextState.selectedTemplate.id : null,
    });
    store.update((state) => ({
      ...state,
      session: response.session || state.session,
    }));
  }

  function scheduleDesignPersist() {
    if (persistTimer) global.clearTimeout(persistTimer);
    persistTimer = global.setTimeout(async () => {
      persistTimer = null;
      try {
        await persistDesignSelection(store.getState());
      } catch (error) {
        setSubmissionPhase('error', error.message || 'Unable to save design');
      }
    }, DEBOUNCE_MS);
  }

  function updateNotes(value) {
    store.update((state) => ({
      ...state,
      design: {
        ...state.design,
        notes: value,
      },
      submission: {
        ...state.submission,
        phase: 'ready',
        error: null,
      },
    }));
    scheduleDesignPersist();
  }

  function addRosterItem() {
    store.update((state) => {
      const items = Array.isArray(state.roster.items) ? state.roster.items : [];
      const nextItems = items.concat({
        playerName: '',
        playerNumber: '',
        sizeCode: '',
        quantity: 1,
        sortOrder: items.length,
      });
      return {
        ...state,
        roster: {
          items: nextItems,
          totalQuantity: sumRosterQuantity(nextItems),
        },
      };
    });
  }

  function updateRosterItem(index, field, value) {
    store.update((state) => {
      const nextItems = (Array.isArray(state.roster.items) ? state.roster.items : []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return {
          ...item,
          [field]: field === 'quantity' ? value : value,
        };
      });

      return {
        ...state,
        roster: {
          items: nextItems,
          totalQuantity: sumRosterQuantity(nextItems.map((item) => ({
            ...item,
            quantity: Number(item.quantity) || 0,
          }))),
        },
      };
    });
  }

  function removeRosterItem(index) {
    store.update((state) => {
      const nextItems = (Array.isArray(state.roster.items) ? state.roster.items : [])
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          sortOrder: itemIndex,
        }));
      return {
        ...state,
        roster: {
          items: nextItems,
          totalQuantity: sumRosterQuantity(nextItems),
        },
      };
    });
  }

  function buildPreviewPayload(state) {
    const sessionId = state.session && state.session.id ? state.session.id : 'draft';
    const timestamp = Date.now();
    const sides = ['front', 'back'];

    return sides.reduce((accumulator, side) => {
      accumulator[side] = {
        storageKey: `customizer/session-${sessionId}/${side}-${timestamp}.json`,
        mimeType: 'image/png',
        meta: {
          side,
          selectedTemplateId: state.selectedTemplate ? state.selectedTemplate.id : null,
          selectedProductTypeId: state.selectedProductType ? state.selectedProductType.id : null,
          texts: state.design.texts || {},
          logoCount: Array.isArray(state.design.logos) ? state.design.logos.length : 0,
          zoneColors: (Array.isArray(state.design.zones) ? state.design.zones : [])
            .filter((zone) => String(zone.side || 'front') === side || String(zone.zoneKey || '').includes(side))
            .map((zone) => ({
              zoneKey: zone.zoneKey,
              color: zone.color || null,
            })),
        },
      };
      return accumulator;
    }, {});
  }

  async function submitSession(mode) {
    const current = store.getState();
    if (!current.session || !current.session.id) return;

    try {
      setSubmissionPhase(mode === 'quote' ? 'submitting-quote' : 'submitting-order');

      await persistDesignSelection(current);
      await CustomizerApi.saveRoster(current.session.id, current.roster.items || []);
      const previewsResponse = await CustomizerApi.savePreviews(current.session.id, buildPreviewPayload(store.getState()));
      const response = await CustomizerApi.submitSession(current.session.id, {
        mode,
        note: current.design.notes || '',
      });

      store.update((state) => ({
        ...state,
        previews: {
          ...state.previews,
          ...(previewsResponse.previews || {}),
        },
        pricing: response.pricing || state.pricing,
        deliverable: response.deliverable || state.deliverable,
        session: response.session || state.session,
        submission: {
          phase: 'submitted',
          error: null,
        },
      }));

      if (response.mode === 'direct_order' && response.orderDraft) {
        global.location.href = `/customizer/order-success?draftId=${encodeURIComponent(response.orderDraft.id)}`;
        return;
      }

      if (response.quoteRequest) {
        global.location.href = `/customizer/quote-success?quoteId=${encodeURIComponent(response.quoteRequest.id)}`;
      }
    } catch (error) {
      setSubmissionPhase('error', error.message || 'Submit failed');
    }
  }

  async function selectProductType(productTypeId) {
    const current = store.getState();
    const nextProductType = current.catalog.productTypes.find((item) => String(item.id) === String(productTypeId)) || null;
    const nextTemplate = nextProductType
      ? CustomizerCatalog.findTemplateForStartMode(current.catalog, nextProductType.id, startMode, null)
      : null;

    store.update((state) => ({
      ...state,
      selectedProductType: nextProductType,
      selectedTemplate: nextTemplate,
      session: state.session ? {
        ...state.session,
        product_type_id: nextProductType ? nextProductType.id : null,
        template_id: nextTemplate ? nextTemplate.id : null,
      } : state.session,
    }));

    if (nextTemplate && nextTemplate.id) {
      await loadTemplateDetail(nextTemplate.id);
    } else {
      store.update((state) => ({
        ...state,
        zones: [],
      }));
    }

    const nextState = store.getState();
    await persistDesignSelection(nextState);
  }

  async function selectTemplate(templateId) {
    store.update((state) => ({
      ...state,
      selectedTemplate: state.catalog.templates.find((item) => String(item.id) === String(templateId)) || null,
      session: state.session ? {
        ...state.session,
        template_id: templateId ? Number(templateId) : null,
      } : state.session,
    }));

    await loadTemplateDetail(templateId ? Number(templateId) : null);

    const nextState = store.getState();
    await persistDesignSelection(nextState);
  }

  function setPreviewSide(side) {
    store.update((state) => ({
      ...state,
      previews: {
        ...state.previews,
        activeSide: side === 'back' ? 'back' : 'front',
      },
    }));
  }

  function updateZoneColor(zoneKey, color) {
    store.update((state) => ({
      ...state,
      design: {
        ...state.design,
        zones: state.design.zones.map((zone) => (
          String(zone.zoneKey) === String(zoneKey)
            ? { ...zone, color: color || zone.color }
            : zone
        )),
      },
      submission: {
        ...state.submission,
        phase: 'ready',
        error: null,
      },
    }));
    scheduleDesignPersist();
  }

  function updateTextField(fieldKey, value) {
    store.update((state) => ({
      ...state,
      design: {
        ...state.design,
        texts: {
          ...state.design.texts,
          [fieldKey]: value,
        },
      },
      submission: {
        ...state.submission,
        phase: 'ready',
        error: null,
      },
    }));
    scheduleDesignPersist();
  }

  function selectLogoAsset(assetId) {
    const current = store.getState();
    const asset = current.catalog.assets.find((item) => String(item.id) === String(assetId));

    store.update((state) => ({
      ...state,
      design: {
        ...state.design,
        logos: asset ? [{
          assetId: asset.id,
          slug: asset.slug || null,
          name: asset.name || '',
          previewUrl: asset.preview_url || asset.previewUrl || null,
        }] : [],
      },
      submission: {
        ...state.submission,
        phase: 'ready',
        error: null,
      },
    }));
    scheduleDesignPersist();
  }

  const renderer = CustomizerEditor.createEditorRenderer(root, store, {
    selectProductType,
    selectTemplate,
    setPreviewSide,
    updateZoneColor,
    updateTextField,
    selectLogoAsset,
    updateNotes,
    addRosterItem,
    updateRosterItem,
    removeRosterItem,
    submitQuote() {
      return submitSession('quote');
    },
    submitOrder() {
      return submitSession('direct_order');
    },
  });
  const compositor = CustomizerCompositor && typeof CustomizerCompositor.createPreviewCompositor === 'function'
    ? CustomizerCompositor.createPreviewCompositor(root)
    : null;

  store.subscribe((state) => {
    renderer.render(state);
    if (compositor) compositor.render(state);
    root.dataset.startMode = startMode;
    root.dataset.phase = state.submission.phase || 'idle';
  });

  async function init() {
    try {
      setSubmissionPhase('loading-catalog');
      const catalogPayload = await CustomizerApi.fetchCatalog();
      const catalog = CustomizerCatalog.normalizeCatalogPayload(catalogPayload);

      const selectedProductType = CustomizerCatalog.findDefaultProductType(catalog, bootstrap.productTypeId);
      const selectedTemplate = selectedProductType
        ? CustomizerCatalog.findTemplateForStartMode(catalog, selectedProductType.id, startMode, bootstrap.templateId)
        : null;

      store.update((state) => ({
        ...state,
        catalog,
        selectedProductType,
        selectedTemplate,
      }));

      if (selectedTemplate && selectedTemplate.id) {
        await loadTemplateDetail(selectedTemplate.id);
      }

      setSubmissionPhase('creating-session');
      const sessionPayload = {
        productTypeId: selectedProductType ? selectedProductType.id : null,
        templateId: selectedTemplate ? selectedTemplate.id : null,
        design: store.getState().design,
      };
      const sessionResponse = await CustomizerApi.createSession(sessionPayload);

      store.update((state) => ({
        ...state,
        session: sessionResponse.session,
        design: sessionResponse.design || state.design,
        submission: {
          phase: 'ready',
          error: null,
        },
      }));
    } catch (error) {
      setSubmissionPhase('error', error.message || 'Customizer init failed');
      store.update((state) => ({
        ...state,
        submission: {
          phase: 'error',
          error: error.message || 'Customizer init failed',
        },
      }));
    }
  }

  renderer.render(store.getState());
  init();
})(window, document);
