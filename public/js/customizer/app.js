(function bootCustomizer(global, document) {
  const root = document.getElementById('customizer-app');
  if (!root) return;

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
    store.update((state) => ({
      ...state,
      selectedTemplate: payload.template || state.selectedTemplate,
      zones: Array.isArray(payload.zones) ? payload.zones : [],
    }));
    return payload;
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

  async function selectProductType(productTypeId) {
    const current = store.getState();
    const nextProductType = current.catalog.productTypes.find((item) => String(item.id) === String(productTypeId)) || null;
    const nextTemplate = nextProductType
      ? CustomizerCatalog.findDefaultTemplate(current.catalog, nextProductType.id, null)
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

  const renderer = CustomizerEditor.createEditorRenderer(root, store, {
    selectProductType,
    selectTemplate,
    setPreviewSide,
  });
  const compositor = CustomizerCompositor && typeof CustomizerCompositor.createPreviewCompositor === 'function'
    ? CustomizerCompositor.createPreviewCompositor(root)
    : null;

  store.subscribe((state) => {
    renderer.render(state);
    if (compositor) compositor.render(state);
    root.dataset.startMode = bootstrap.startMode || 'template';
    root.dataset.phase = state.submission.phase || 'idle';
  });

  async function init() {
    try {
      setSubmissionPhase('loading-catalog');
      const catalogPayload = await CustomizerApi.fetchCatalog();
      const catalog = CustomizerCatalog.normalizeCatalogPayload(catalogPayload);

      const selectedProductType = CustomizerCatalog.findDefaultProductType(catalog, bootstrap.productTypeId);
      const selectedTemplate = selectedProductType
        ? CustomizerCatalog.findDefaultTemplate(catalog, selectedProductType.id, bootstrap.templateId)
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
