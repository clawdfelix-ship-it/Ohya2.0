(function attachCustomizerEditor(global, document) {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderProductTypeOptions(state) {
    if (!state.catalog.productTypes.length) {
      return '<option value="">未有品類資料</option>';
    }

    return state.catalog.productTypes.map((productType) => {
      const selected = state.selectedProductType && String(productType.id) === String(state.selectedProductType.id)
        ? ' selected'
        : '';
      return `<option value="${escapeHtml(productType.id)}"${selected}>${escapeHtml(productType.name)}</option>`;
    }).join('');
  }

  function renderTemplateCards(state) {
    if (!state.selectedProductType) {
      return '<div class="customizer-empty">請先選擇品類。</div>';
    }

    const templates = state.catalog.templatesByProductType[String(state.selectedProductType.id)] || [];
    if (!templates.length) {
      return '<div class="customizer-empty">呢個品類仲未有模板資料。</div>';
    }

    return templates.map((template) => {
      const selected = state.selectedTemplate && String(template.id) === String(state.selectedTemplate.id);
      const className = selected ? 'customizer-template-card is-selected' : 'customizer-template-card';
      return `
        <button type="button" class="${className}" data-template-id="${escapeHtml(template.id)}">
          <span class="customizer-template-card__name">${escapeHtml(template.name)}</span>
          <span class="customizer-template-card__meta">${template.is_blank ? '空白款' : '模板'}</span>
        </button>
      `;
    }).join('');
  }

  function renderSummary(state) {
    const productType = state.selectedProductType ? state.selectedProductType.name : '未選擇';
    const template = state.selectedTemplate ? state.selectedTemplate.name : '未選擇';
    const sessionId = state.session && state.session.id ? state.session.id : '未建立';
    const activeSide = state.previews.activeSide || 'front';
    const totalQuantity = state.roster && Number.isFinite(Number(state.roster.totalQuantity))
      ? state.roster.totalQuantity
      : 0;

    return `
      <div class="customizer-summary-card">
        <div><span class="customizer-summary-card__label">Session</span><span class="customizer-summary-card__value">${escapeHtml(sessionId)}</span></div>
        <div><span class="customizer-summary-card__label">品類</span><span class="customizer-summary-card__value">${escapeHtml(productType)}</span></div>
        <div><span class="customizer-summary-card__label">模板</span><span class="customizer-summary-card__value">${escapeHtml(template)}</span></div>
        <div><span class="customizer-summary-card__label">預覽面</span><span class="customizer-summary-card__value">${escapeHtml(activeSide)}</span></div>
        <div><span class="customizer-summary-card__label">總數量</span><span class="customizer-summary-card__value">${escapeHtml(totalQuantity)}</span></div>
      </div>
    `;
  }

  function renderPreview(state) {
    const activeSide = state.previews.activeSide || 'front';
    const title = activeSide === 'back' ? '後幅 Preview' : '前幅 Preview';
    const productType = state.selectedProductType ? state.selectedProductType.name : '未選擇品類';
    const template = state.selectedTemplate ? state.selectedTemplate.name : '未選擇模板';
    const zoneCount = Array.isArray(state.zones) ? state.zones.length : 0;

    return `
      <div class="customizer-preview__toolbar">
        <div class="customizer-preview__status">
          <span class="customizer-preview__status-label">Template Zones</span>
          <span class="customizer-preview__status-value">${escapeHtml(zoneCount)}</span>
        </div>
        <div class="customizer-preview__toggle-group">
          <button type="button" class="customizer-preview__toggle${activeSide === 'front' ? ' is-active' : ''}" data-side="front">前幅</button>
          <button type="button" class="customizer-preview__toggle${activeSide === 'back' ? ' is-active' : ''}" data-side="back">後幅</button>
        </div>
      </div>
      <div class="customizer-preview__stage">
        <canvas class="customizer-preview__canvas" data-role="preview-canvas" aria-label="${escapeHtml(title)}"></canvas>
        <div class="customizer-preview__overlay">
          <div class="customizer-preview__title">${escapeHtml(title)}</div>
          <div class="customizer-preview__meta">${escapeHtml(productType)} / ${escapeHtml(template)}</div>
          <div class="customizer-preview__hint">而家已經有 preview foundation，下一步會再接真實 layers 同 snapshots。</div>
        </div>
      </div>
    `;
  }

  function createEditorRenderer(root, store, actions) {
    function render(state) {
      root.innerHTML = `
        <aside class="customizer-panel">
          <div class="text-xs font-bold uppercase tracking-[0.18em] text-gold">Style</div>
          <h1 class="mt-2 text-xl font-black text-white">編輯設計</h1>
          <p class="mt-2 text-sm text-gray-400">第一步先鎖定品類、模板同 session，之後再接上 zone 面板同 preview compositing。</p>

          <label class="customizer-field">
            <span class="customizer-field__label">品類</span>
            <select class="customizer-field__control" data-role="product-type-select">
              ${renderProductTypeOptions(state)}
            </select>
          </label>

          <div class="customizer-section">
            <div class="customizer-section__title">模板</div>
            <div class="customizer-template-list">
              ${renderTemplateCards(state)}
            </div>
          </div>
        </aside>

        <section class="customizer-preview">
          ${renderPreview(state)}
        </section>

        <aside class="customizer-panel">
          <div class="text-xs font-bold uppercase tracking-[0.18em] text-gold">Summary</div>
          <div class="mt-3 text-sm text-gray-400">呢度會顯示今次 session、template 同 roster 狀態。</div>
          <div class="mt-4">${renderSummary(state)}</div>
        </aside>
      `;

      const productTypeSelect = root.querySelector('[data-role="product-type-select"]');
      if (productTypeSelect) {
        productTypeSelect.addEventListener('change', (event) => {
          actions.selectProductType(event.target.value);
        });
      }

      root.querySelectorAll('[data-template-id]').forEach((button) => {
        button.addEventListener('click', () => {
          actions.selectTemplate(button.getAttribute('data-template-id'));
        });
      });

      root.querySelectorAll('[data-side]').forEach((button) => {
        button.addEventListener('click', () => {
          actions.setPreviewSide(button.getAttribute('data-side'));
        });
      });
    }

    return { render };
  }

  global.CustomizerEditor = {
    createEditorRenderer,
  };
})(window, document);
