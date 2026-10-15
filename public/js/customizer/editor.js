(function attachCustomizerEditor(global, document) {
  const FALLBACK_SWATCHES = ['#f4f4f5', '#d4af37', '#7f1d45', '#111827', '#2563eb', '#16a34a'];

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

  function getSelection(state) {
    return {
      productTypeId: state.selectedProductType ? state.selectedProductType.id : null,
      templateId: state.selectedTemplate ? state.selectedTemplate.id : null,
    };
  }

  function listSelectionAssets(state, assetTypes) {
    if (!global.CustomizerCatalog || typeof global.CustomizerCatalog.listAssetsForSelection !== 'function') {
      return [];
    }
    return global.CustomizerCatalog.listAssetsForSelection(state.catalog, getSelection(state), assetTypes);
  }

  function getZoneDesign(state, zoneKey) {
    return (state.design && Array.isArray(state.design.zones) ? state.design.zones : [])
      .find((zone) => String(zone.zoneKey) === String(zoneKey)) || {};
  }

  function buildTextFields(state) {
    const textZones = (Array.isArray(state.zones) ? state.zones : []).filter((zone) => zone.allowText);
    const fields = [];
    const seen = new Set();

    textZones.forEach((zone) => {
      const keySource = String(zone.zoneKey || '').toLowerCase();
      let key = zone.zoneKey;
      if (keySource.includes('number')) key = 'playerNumber';
      else if (keySource.includes('name')) key = keySource.includes('team') ? 'teamName' : 'playerName';
      else if (keySource.includes('front')) key = 'teamName';

      if (seen.has(key)) return;
      seen.add(key);
      fields.push({
        key,
        label: zone.zoneName || key,
      });
    });

    if (!fields.length) {
      return [
        { key: 'teamName', label: '隊名' },
        { key: 'playerName', label: '球員名' },
        { key: 'playerNumber', label: '號碼' },
      ];
    }

    return fields.slice(0, 3);
  }

  function buildPalette(state) {
    const assetColors = listSelectionAssets(state, ['color', 'palette']).flatMap((asset) => {
      const meta = asset.meta_json && typeof asset.meta_json === 'object'
        ? asset.meta_json
        : asset.meta && typeof asset.meta === 'object'
          ? asset.meta
          : {};

      if (Array.isArray(meta.colors)) return meta.colors;
      if (typeof meta.color === 'string') return [meta.color];
      return [];
    });

    const defaultZoneColors = (Array.isArray(state.design && state.design.zones) ? state.design.zones : [])
      .map((zone) => zone.color)
      .filter(Boolean);

    return Array.from(new Set([...assetColors, ...defaultZoneColors, ...FALLBACK_SWATCHES])).slice(0, 8);
  }

  function renderZoneControls(state) {
    const colorZones = (Array.isArray(state.zones) ? state.zones : []).filter((zone) => zone.allowColor);
    if (!colorZones.length) {
      return '<div class="customizer-empty">呢個模板暫時未定義可改色區域。</div>';
    }

    const palette = buildPalette(state);

    return colorZones.map((zone) => {
      const zoneDesign = getZoneDesign(state, zone.zoneKey);
      const value = zoneDesign.color || '#f4f4f5';

      return `
        <div class="customizer-control-card">
          <div class="customizer-control-card__header">
            <div class="customizer-control-card__title">${escapeHtml(zone.zoneName || zone.zoneKey)}</div>
            <div class="customizer-control-card__value">${escapeHtml(value)}</div>
          </div>
          <input
            class="customizer-color-input"
            type="color"
            value="${escapeHtml(value)}"
            data-role="zone-color"
            data-zone-key="${escapeHtml(zone.zoneKey)}"
          >
          <div class="customizer-swatch-row">
            ${palette.map((color) => `
              <button
                type="button"
                class="customizer-swatch${String(color).toLowerCase() === String(value).toLowerCase() ? ' is-selected' : ''}"
                style="--swatch:${escapeHtml(color)}"
                data-role="zone-swatch"
                data-zone-key="${escapeHtml(zone.zoneKey)}"
                data-color="${escapeHtml(color)}"
                aria-label="選擇 ${escapeHtml(color)}"
              ></button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTextControls(state) {
    return buildTextFields(state).map((field) => `
      <label class="customizer-field customizer-field--dense">
        <span class="customizer-field__label">${escapeHtml(field.label)}</span>
        <input
          type="text"
          class="customizer-field__control"
          value="${escapeHtml(state.design && state.design.texts ? state.design.texts[field.key] || '' : '')}"
          placeholder="輸入${escapeHtml(field.label)}"
          data-role="text-input"
          data-text-key="${escapeHtml(field.key)}"
        >
      </label>
    `).join('');
  }

  function renderLogoControls(state) {
    const assets = listSelectionAssets(state, ['logo', 'graphic', 'badge']).slice(0, 6);
    const selectedLogoId = state.design && Array.isArray(state.design.logos) && state.design.logos[0]
      ? state.design.logos[0].assetId
      : null;

    if (!assets.length) {
      return '<div class="customizer-empty">未有官方 logo 素材，可之後再接客戶上傳。</div>';
    }

    return `
      <div class="customizer-logo-grid">
        <button
          type="button"
          class="customizer-logo-card${selectedLogoId ? '' : ' is-selected'}"
          data-role="logo-asset"
          data-asset-id=""
        >
          <span class="customizer-logo-card__badge">NONE</span>
          <span class="customizer-logo-card__name">不使用</span>
        </button>
        ${assets.map((asset) => `
          <button
            type="button"
            class="customizer-logo-card${String(selectedLogoId) === String(asset.id) ? ' is-selected' : ''}"
            data-role="logo-asset"
            data-asset-id="${escapeHtml(asset.id)}"
          >
            <span class="customizer-logo-card__badge">${escapeHtml(String(asset.name || '').slice(0, 3).toUpperCase())}</span>
            <span class="customizer-logo-card__name">${escapeHtml(asset.name)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderSummary(state) {
    const productType = state.selectedProductType ? state.selectedProductType.name : '未選擇';
    const template = state.selectedTemplate ? state.selectedTemplate.name : '未選擇';
    const sessionId = state.session && state.session.id ? state.session.id : '未建立';
    const activeSide = state.previews.activeSide || 'front';
    const totalQuantity = state.roster && Number.isFinite(Number(state.roster.totalQuantity))
      ? state.roster.totalQuantity
      : 0;
    const activeLogo = state.design && Array.isArray(state.design.logos) && state.design.logos[0]
      ? state.design.logos[0].name || state.design.logos[0].slug || '已選擇'
      : '未選擇';

    return `
      <div class="customizer-summary-card">
        <div><span class="customizer-summary-card__label">Session</span><span class="customizer-summary-card__value">${escapeHtml(sessionId)}</span></div>
        <div><span class="customizer-summary-card__label">品類</span><span class="customizer-summary-card__value">${escapeHtml(productType)}</span></div>
        <div><span class="customizer-summary-card__label">模板</span><span class="customizer-summary-card__value">${escapeHtml(template)}</span></div>
        <div><span class="customizer-summary-card__label">預覽面</span><span class="customizer-summary-card__value">${escapeHtml(activeSide)}</span></div>
        <div><span class="customizer-summary-card__label">Logo</span><span class="customizer-summary-card__value">${escapeHtml(activeLogo)}</span></div>
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

          <div class="customizer-section">
            <div class="customizer-section__title">顏色區域</div>
            <div class="customizer-control-stack">
              ${renderZoneControls(state)}
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

          <div class="customizer-section">
            <div class="customizer-section__title">文字</div>
            <div class="customizer-control-stack">
              ${renderTextControls(state)}
            </div>
          </div>

          <div class="customizer-section">
            <div class="customizer-section__title">Logo</div>
            ${renderLogoControls(state)}
          </div>
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

      root.querySelectorAll('[data-role="zone-color"]').forEach((input) => {
        input.addEventListener('input', (event) => {
          actions.updateZoneColor(input.getAttribute('data-zone-key'), event.target.value);
        });
      });

      root.querySelectorAll('[data-role="zone-swatch"]').forEach((button) => {
        button.addEventListener('click', () => {
          actions.updateZoneColor(button.getAttribute('data-zone-key'), button.getAttribute('data-color'));
        });
      });

      root.querySelectorAll('[data-role="text-input"]').forEach((input) => {
        input.addEventListener('input', (event) => {
          actions.updateTextField(input.getAttribute('data-text-key'), event.target.value);
        });
      });

      root.querySelectorAll('[data-role="logo-asset"]').forEach((button) => {
        button.addEventListener('click', () => {
          actions.selectLogoAsset(button.getAttribute('data-asset-id'));
        });
      });
    }

    return { render };
  }

  global.CustomizerEditor = {
    createEditorRenderer,
  };
})(window, document);
