(async function () {
  const { $, el, adminApiRequest } = window.AdminCommon;

  const els = {
    search: $('#products-search'),
    categoryFilter: $('#products-category'),
    refresh: $('#products-refresh'),
    newBtn: $('#products-new'),
    error: $('#products-error'),
    tbody: $('#products-tbody'),

    form: $('#product-form'),
    id: $('#product-id'),
    name: $('#product-name'),
    slug: $('#product-slug'),
    parentCategory: $('#product-parent-category'),
    category: $('#product-category'),
    price: $('#product-price'),
    originalPrice: $('#product-original-price'),
    totalStock: $('#product-total-stock'),
    status: $('#product-status'),
    imageUrl: $('#product-image-url'),
    imageFile: $('#product-image-file'),
    shortDesc: $('#product-short-desc'),
    desc: $('#product-desc'),
    skuAdd: $('#sku-add'),
    skuEmptyHint: $('#sku-empty-hint'),
    skuTbody: $('#sku-tbody'),
    skuAdjustModal: $('#sku-adjust-modal'),
    skuAdjustSkuId: $('#sku-adjust-sku-id'),
    skuAdjustDelta: $('#sku-adjust-delta'),
    skuAdjustNote: $('#sku-adjust-note'),
    skuAdjustConfirm: $('#sku-adjust-confirm'),
    skuAdjustCancel: $('#sku-adjust-cancel'),
    reset: $('#product-reset'),
    save: $('#product-save'),
  };

  function setError(msg) {
    if (!msg) {
      els.error.classList.add('hidden');
      els.error.textContent = '';
      return;
    }
    els.error.classList.remove('hidden');
    els.error.textContent = msg;
  }

  let categories = [];
  let categoriesById = new Map();
  let rootCategories = [];
  let childrenByParentId = new Map();
  let isLeafById = new Map();
  let currentSkus = [];
  let adjustingSkuId = null;

  function categoryName(c) {
    return (c && (c.name_zh_hk || c.name)) || '';
  }

  function buildOptions(select, options, includeAll) {
    select.textContent = '';
    if (includeAll) select.appendChild(el('option', { value: '', text: '全部' }));
    for (const o of options) {
      select.appendChild(el('option', { value: String(o.value), text: o.text }));
    }
  }

  function rebuildChildOptions(parentId, selectedChildId) {
    const kids = childrenByParentId.get(Number(parentId)) || [];
    const leafKids = kids.filter((c) => isLeafById.get(c.id));
    const options = leafKids.map((c) => ({ value: c.id, text: categoryName(c) }));
    buildOptions(els.category, options, false);

    if (selectedChildId && options.some((o) => String(o.value) === String(selectedChildId))) {
      els.category.value = String(selectedChildId);
      return;
    }
    if (options[0]) els.category.value = String(options[0].value);
  }

  function rebuildParentOptions(selectedParentId) {
    const options = rootCategories.map((c) => ({ value: c.id, text: categoryName(c) }));
    buildOptions(els.parentCategory, options, false);
    if (selectedParentId && options.some((o) => String(o.value) === String(selectedParentId))) {
      els.parentCategory.value = String(selectedParentId);
      return;
    }
    if (options[0]) els.parentCategory.value = String(options[0].value);
  }

  async function loadCategories() {
    const data = await adminApiRequest('/api/admin/categories');
    categories = data.categories || [];

    categoriesById = new Map(categories.map((c) => [Number(c.id), c]));
    rootCategories = categories.filter((c) => !c.parent_id);
    childrenByParentId = new Map();
    const childCountById = new Map();

    for (const c of categories) {
      if (c.parent_id) {
        const pid = Number(c.parent_id);
        const arr = childrenByParentId.get(pid) || [];
        arr.push(c);
        childrenByParentId.set(pid, arr);
      }
      if (c.parent_id) {
        const pid = Number(c.parent_id);
        childCountById.set(pid, (childCountById.get(pid) || 0) + 1);
      }
    }

    isLeafById = new Map();
    for (const c of categories) {
      const hasChildren = (childCountById.get(Number(c.id)) || 0) > 0;
      isLeafById.set(Number(c.id), Boolean(c.parent_id) && !hasChildren);
    }

    const leafCategories = categories.filter((c) => isLeafById.get(Number(c.id)));
    const leafOptions = leafCategories
      .map((c) => {
        const parent = c.parent_id ? categoriesById.get(Number(c.parent_id)) : null;
        const label = parent ? `${categoryName(parent)} / ${categoryName(c)}` : categoryName(c);
        return { value: c.id, text: label };
      })
      .sort((a, b) => a.text.localeCompare(b.text, 'zh-HK'));

    buildOptions(els.categoryFilter, leafOptions, true);
    rebuildParentOptions(null);
    rebuildChildOptions(els.parentCategory.value, null);
  }

  async function loadProducts() {
    setError('');
    els.tbody.textContent = '';

    const params = new URLSearchParams();
    const search = (els.search.value || '').trim();
    const categoryId = els.categoryFilter.value;
    if (search) params.set('search', search);
    if (categoryId) params.set('category_id', categoryId);

    const data = await adminApiRequest('/api/admin/products?' + params.toString());
    const products = data.products || [];

    for (const p of products) {
      const child = p.category_id ? categoriesById.get(Number(p.category_id)) : null;
      const parent = child && child.parent_id ? categoriesById.get(Number(child.parent_id)) : null;
      const categoryLabel = parent && child ? `${categoryName(parent)} / ${categoryName(child)}` : (p.category_name || '');
      const activeSkuCount = Number(p.active_sku_count || 0);
      const totalStock = Number(p.total_stock || 0);
      const stockLabel = activeSkuCount > 0 ? String(totalStock) : '—';

      const tr = el('tr', {}, [
        el('td', { text: String(p.id) }),
        el('td', { text: p.name_zh_hk || p.name || '' }),
        el('td', { text: categoryLabel }),
        el('td', { text: stockLabel }),
        el('td', { text: p.status === 'active' ? '上架' : '下架' }),
        el('td', {}, [
          el('button', { class: 'admin-link-btn', text: '編輯', onclick: () => loadProductForEdit(p.id) }),
        ]),
      ]);
      els.tbody.appendChild(tr);
    }
  }

  function updateTotalStockDisplay() {
    if (!els.totalStock) return;
    if (!currentSkus || currentSkus.length === 0) {
      els.totalStock.textContent = '—';
      return;
    }
    const total = currentSkus
      .filter((s) => s && s.is_active !== false && Number.isInteger(Number(s.stock)))
      .reduce((acc, s) => acc + Number(s.stock || 0), 0);
    els.totalStock.textContent = String(total);
  }

  function closeSkuAdjustModal() {
    adjustingSkuId = null;
    if (els.skuAdjustSkuId) els.skuAdjustSkuId.value = '';
    if (els.skuAdjustDelta) els.skuAdjustDelta.value = '';
    if (els.skuAdjustNote) els.skuAdjustNote.value = '';
    if (els.skuAdjustModal) els.skuAdjustModal.classList.add('hidden');
  }

  function openSkuAdjustModal(skuId) {
    if (!els.skuAdjustModal || !els.skuAdjustSkuId || !els.skuAdjustDelta) return;
    adjustingSkuId = Number(skuId);
    els.skuAdjustSkuId.value = String(adjustingSkuId);
    els.skuAdjustDelta.value = '';
    if (els.skuAdjustNote) els.skuAdjustNote.value = '';
    els.skuAdjustModal.classList.remove('hidden');
    els.skuAdjustDelta.focus();
  }

  async function confirmSkuAdjust() {
    if (!adjustingSkuId) return;
    const deltaRaw = els.skuAdjustDelta ? String(els.skuAdjustDelta.value || '').trim() : '';
    const delta = parseInt(deltaRaw, 10);
    if (!Number.isInteger(delta) || delta === 0) {
      setError('delta 不正確');
      return;
    }
    const note = els.skuAdjustNote ? (String(els.skuAdjustNote.value || '').trim() || null) : null;
    try {
      setError('');
      const out = await adminApiRequest('/api/admin/inventory/adjust', {
        method: 'POST',
        json: { sku_id: adjustingSkuId, delta, note }
      });
      if (out && out.sku && typeof out.sku.stock !== 'undefined') {
        const updated = currentSkus.find((s) => s && Number(s.id) === Number(adjustingSkuId));
        if (updated) updated.stock = Number(out.sku.stock);
        closeSkuAdjustModal();
        updateTotalStockDisplay();
        renderSkus();
      }
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
  }

  function renderSkus() {
    if (!els.skuTbody) return;
    els.skuTbody.textContent = '';
    if (els.skuEmptyHint) {
      if (!currentSkus || currentSkus.length === 0) els.skuEmptyHint.classList.remove('hidden');
      else els.skuEmptyHint.classList.add('hidden');
    }

    for (let i = 0; i < currentSkus.length; i++) {
      const sku = currentSkus[i];
      const isActive = sku.is_active !== false;

      const skuInput = el('input', {
        class: 'admin-input w-full',
        value: sku.sku || '',
        oninput: (e) => { sku.sku = e.target.value; }
      });
      const barcodeInput = el('input', {
        class: 'admin-input w-full',
        value: sku.barcode || '',
        oninput: (e) => { sku.barcode = e.target.value; }
      });
      const costInput = el('input', {
        class: 'admin-input w-full',
        type: 'number',
        step: '0.01',
        value: sku.cost_price ?? '',
        oninput: (e) => { sku.cost_price = e.target.value === '' ? null : Number(e.target.value); }
      });
      const priceInput = el('input', {
        class: 'admin-input w-full',
        type: 'number',
        step: '0.01',
        value: sku.price ?? '',
        oninput: (e) => { sku.price = e.target.value === '' ? null : Number(e.target.value); }
      });

      const activeCheckbox = el('input', {
        type: 'checkbox',
        onchange: (e) => {
          sku.is_active = Boolean(e.target.checked);
          updateTotalStockDisplay();
        }
      });
      activeCheckbox.checked = isActive;

      const adjustBtn = el('button', {
        class: 'admin-link-btn',
        type: 'button',
        text: '調整庫存',
        onclick: () => {
          if (!sku.id) return;
          openSkuAdjustModal(sku.id);
        }
      });
      adjustBtn.disabled = !sku.id;

      const removeBtn = el('button', {
        class: 'admin-link-btn',
        type: 'button',
        text: '移除',
        onclick: () => {
          currentSkus.splice(i, 1);
          renderSkus();
          updateTotalStockDisplay();
        }
      });

      const tr = el('tr', {}, [
        el('td', {}, [skuInput]),
        el('td', {}, [barcodeInput]),
        el('td', {}, [costInput]),
        el('td', {}, [priceInput]),
        el('td', { text: sku.id ? String(sku.stock ?? 0) : '—' }),
        el('td', {}, [activeCheckbox]),
        el('td', {}, [adjustBtn, el('span', { text: ' ' }), removeBtn]),
      ]);
      els.skuTbody.appendChild(tr);
    }
  }

  async function loadProductForEdit(id) {
    setError('');
    const data = await adminApiRequest('/api/admin/products/' + encodeURIComponent(id));
    fillForm(data.product, data.skus || []);
  }

  function fillForm(p, skus) {
    const childId = p.category_id ? Number(p.category_id) : null;
    const child = childId ? categoriesById.get(childId) : null;
    const parentId = child && child.parent_id ? Number(child.parent_id) : (rootCategories[0] ? Number(rootCategories[0].id) : null);

    els.id.value = p.id ? String(p.id) : '';
    els.name.value = p.name_zh_hk || p.name || '';
    els.slug.value = p.slug || '';
    if (parentId) {
      rebuildParentOptions(parentId);
      rebuildChildOptions(parentId, childId);
    } else {
      els.parentCategory.textContent = '';
      els.category.textContent = '';
    }
    els.price.value = p.price ?? '';
    els.originalPrice.value = p.original_price ?? '';
    els.status.value = p.status || 'active';
    els.imageUrl.value = p.image_url || '';
    els.imageFile.value = '';
    els.shortDesc.value = p.short_description_zh_hk || '';
    els.desc.value = p.description_zh_hk || p.description || '';

    currentSkus = Array.isArray(skus)
      ? skus.map((s) => ({
          id: s.id ? Number(s.id) : null,
          sku: s.sku || '',
          barcode: s.barcode || '',
          attributes: s.attributes || {},
          price: s.price,
          cost_price: s.cost_price,
          original_price: s.original_price,
          stock: s.stock,
          weight: s.weight,
          weight_unit: s.weight_unit,
          is_active: s.is_active !== false,
        }))
      : [];

    closeSkuAdjustModal();
    renderSkus();
    updateTotalStockDisplay();
  }

  function clearForm() {
    fillForm({
      id: '',
      name: '',
      slug: '',
      category_id: '',
      price: '',
      original_price: '',
      status: 'active',
      image_url: '',
      short_description_zh_hk: '',
      description_zh_hk: '',
    }, []);
  }

  async function uploadImageIfNeeded() {
    const file = els.imageFile.files && els.imageFile.files[0];
    if (!file) return null;
    const fd = new FormData();
    fd.append('image', file);
    const out = await adminApiRequest('/api/admin/upload', { method: 'POST', formData: fd });
    return out && out.url ? out.url : null;
  }

  els.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setError('');
    els.save.disabled = true;
    try {
      const uploadedUrl = await uploadImageIfNeeded();
      const image_url = uploadedUrl || (els.imageUrl.value || '').trim() || null;

      const payload = {
        name: els.name.value.trim(),
        name_zh_hk: els.name.value.trim(),
        slug: (els.slug.value || '').trim() || undefined,
        description: null,
        description_zh_hk: els.desc.value || null,
        short_description: null,
        short_description_zh_hk: els.shortDesc.value || null,
        price: els.price.value,
        original_price: els.originalPrice.value || null,
        category_id: els.category.value ? Number(els.category.value) : null,
        image_url,
        gallery_images: null,
        status: els.status.value,
        skus: (currentSkus || []).map((s) => ({
          id: s.id || undefined,
          sku: s.sku || null,
          barcode: s.barcode || null,
          attributes: s.attributes || {},
          price: s.price === '' ? null : (s.price ?? null),
          cost_price: s.cost_price === '' ? null : (s.cost_price ?? null),
          original_price: s.original_price === '' ? null : (s.original_price ?? null),
          stock: s.stock ?? 0,
          weight: s.weight ?? null,
          weight_unit: s.weight_unit || 'g',
          is_active: s.is_active !== false,
        })),
      };

      const id = (els.id.value || '').trim();
      if (id) {
        await adminApiRequest('/api/admin/products/' + encodeURIComponent(id), { method: 'PUT', json: payload });
      } else {
        await adminApiRequest('/api/admin/products', { method: 'POST', json: payload });
      }

      await loadProducts();
      clearForm();
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      els.save.disabled = false;
    }
  });

  els.reset.addEventListener('click', () => clearForm());
  els.refresh.addEventListener('click', () => loadProducts().catch((e) => setError(e.message)));
  els.newBtn.addEventListener('click', () => clearForm());
  els.search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') loadProducts().catch((e) => setError(e.message));
  });
  els.categoryFilter.addEventListener('change', () => loadProducts().catch((e) => setError(e.message)));
  els.parentCategory.addEventListener('change', () => {
    rebuildChildOptions(els.parentCategory.value, null);
  });
  if (els.skuAdjustCancel) {
    els.skuAdjustCancel.addEventListener('click', () => closeSkuAdjustModal());
  }
  if (els.skuAdjustConfirm) {
    els.skuAdjustConfirm.addEventListener('click', () => confirmSkuAdjust());
  }
  if (els.skuAdd) {
    els.skuAdd.addEventListener('click', () => {
      currentSkus.push({
        id: null,
        sku: '',
        barcode: '',
        attributes: {},
        price: null,
        cost_price: null,
        original_price: null,
        stock: 0,
        weight: null,
        weight_unit: 'g',
        is_active: true,
      });
      closeSkuAdjustModal();
      renderSkus();
      updateTotalStockDisplay();
    });
  }

  try {
    await loadCategories();
    await loadProducts();
    clearForm();
  } catch (e) {
    setError(e && e.message ? e.message : String(e));
  }
})();
