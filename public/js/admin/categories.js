(async function () {
  const { $, el, adminApiRequest } = window.AdminCommon;

  const els = {
    refresh: $('#categories-refresh'),
    newBtn: $('#categories-new'),
    error: $('#categories-error'),
    tbody: $('#categories-tbody'),

    form: $('#category-form'),
    id: $('#category-id'),
    parent: $('#category-parent'),
    name: $('#category-name'),
    slug: $('#category-slug'),
    sort: $('#category-sort'),
    status: $('#category-status'),
    reset: $('#category-reset'),
    save: $('#category-save'),
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
  let state = { roots: [], childrenByParentId: {}, byId: {} };
  const collapsedRootIds = new Set();

  function fillForm(c) {
    els.id.value = c && c.id ? String(c.id) : '';
    els.parent.value = c && c.parent_id ? String(c.parent_id) : '';
    els.name.value = c && (c.name_zh_hk || c.name) ? (c.name_zh_hk || c.name) : '';
    els.slug.value = c && c.slug ? c.slug : '';
    els.sort.value = c && c.sort_order !== undefined ? String(c.sort_order) : '0';
    els.status.value = c && c.status ? c.status : 'active';
  }

  function clearForm() {
    fillForm({ id: '', name: '', slug: '', sort_order: 0, status: 'active' });
  }

  function buildTreeIndex(categories) {
    const roots = [];
    const childrenByParentId = {};
    const byId = {};

    for (const c of categories) byId[c.id] = c;
    for (const c of categories) {
      if (c.parent_id == null) roots.push(c);
      else {
        if (!childrenByParentId[c.parent_id]) childrenByParentId[c.parent_id] = [];
        childrenByParentId[c.parent_id].push(c);
      }
    }

    const nameOf = (c) => (c.name_zh_hk || c.name || '').toString();
    const sortFn = (a, b) => {
      const sa = Number.isFinite(a.sort_order) ? a.sort_order : 0;
      const sb = Number.isFinite(b.sort_order) ? b.sort_order : 0;
      if (sa !== sb) return sa - sb;
      return nameOf(a).localeCompare(nameOf(b));
    };

    roots.sort(sortFn);
    for (const k of Object.keys(childrenByParentId)) childrenByParentId[k].sort(sortFn);

    return { roots, childrenByParentId, byId };
  }

  function rootTotalCount(root, childrenByParentId) {
    const selfCount = Number(root.product_count || 0);
    const children = childrenByParentId[root.id] || [];
    const childCount = children.reduce((acc, c) => acc + Number(c.product_count || 0), 0);
    return selfCount + childCount;
  }

  function setParentOptions(roots) {
    if (!els.parent) return;
    const keepValue = els.parent.value;
    els.parent.innerHTML = '';
    els.parent.appendChild(el('option', { value: '', text: '（無，上級＝大分類）' }));
    for (const r of roots) {
      els.parent.appendChild(
        el('option', { value: String(r.id), text: r.name_zh_hk || r.name || '' })
      );
    }
    els.parent.value = keepValue;
  }

  function startNewChild(parent) {
    clearForm();
    els.parent.value = String(parent.id);
    els.name.focus();
  }

  function renderRow(c, opts) {
    const isRoot = opts.isRoot;
    const hasChildren = opts.hasChildren;
    const isCollapsed = opts.isCollapsed;
    const displayCount = opts.displayCount;

    const nameCell = (() => {
      if (isRoot) {
        const toggleBtn = hasChildren
          ? el('button', {
              class: 'admin-link-btn',
              text: isCollapsed ? '▸' : '▾',
              onclick: () => {
                if (collapsedRootIds.has(c.id)) collapsedRootIds.delete(c.id);
                else collapsedRootIds.add(c.id);
                renderCategoryRows();
              },
            })
          : el('span', { text: '' });
        return el('div', { class: 'flex items-center gap-2' }, [
          toggleBtn,
          el('span', { class: 'font-bold', text: c.name_zh_hk || c.name || '' }),
        ]);
      }

      return el('div', { class: 'pl-6' }, [el('span', { text: c.name_zh_hk || c.name || '' })]);
    })();

    const actions = [];
    if (isRoot) {
      actions.push(
        el('button', {
          class: 'admin-link-btn',
          text: '新增子分類',
          onclick: () => startNewChild(c),
        }),
        el('span', { text: ' ' })
      );
    }
    actions.push(
      el('button', { class: 'admin-link-btn', text: '編輯', onclick: () => fillForm(c) }),
      el('span', { text: ' ' }),
      el('button', {
        class: 'admin-link-btn',
        text: '刪除',
        onclick: async () => {
          if (!confirm('確定刪除？（分類底下有商品會刪唔到）')) return;
          try {
            await adminApiRequest('/api/admin/categories/' + encodeURIComponent(c.id), { method: 'DELETE' });
            await loadCategories();
            clearForm();
          } catch (e) {
            setError(e && e.message ? e.message : String(e));
          }
        },
      })
    );

    return el('tr', {}, [
      el('td', { text: String(c.id) }),
      el('td', {}, [nameCell]),
      el('td', { text: c.slug || '' }),
      el('td', { text: String(c.sort_order ?? 0) }),
      el('td', { text: c.status === 'active' ? '啟用' : '停用' }),
      el('td', { text: String(displayCount ?? '') }),
      el('td', {}, actions),
    ]);
  }

  function renderCategoryRows() {
    els.tbody.textContent = '';
    for (const root of state.roots) {
      const children = state.childrenByParentId[root.id] || [];
      const isCollapsed = collapsedRootIds.has(root.id);

      els.tbody.appendChild(
        renderRow(root, {
          isRoot: true,
          hasChildren: children.length > 0,
          isCollapsed,
          displayCount: rootTotalCount(root, state.childrenByParentId),
        })
      );

      if (!isCollapsed) {
        for (const child of children) {
          els.tbody.appendChild(
            renderRow(child, {
              isRoot: false,
              hasChildren: false,
              isCollapsed: false,
              displayCount: Number(child.product_count || 0),
            })
          );
        }
      }
    }
  }

  async function loadCategories() {
    setError('');
    els.tbody.textContent = '';
    const data = await adminApiRequest('/api/admin/categories');
    categories = data.categories || [];
    state = buildTreeIndex(categories);
    setParentOptions(state.roots);
    renderCategoryRows();
  }

  els.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setError('');
    els.save.disabled = true;
    try {
      const payload = {
        name: els.name.value.trim(),
        slug: (els.slug.value || '').trim() || undefined,
        parent_id: els.parent && els.parent.value ? parseInt(els.parent.value, 10) : null,
        sort_order: parseInt(els.sort.value || '0', 10),
        status: els.status.value,
      };
      const id = (els.id.value || '').trim();
      if (id) {
        await adminApiRequest('/api/admin/categories/' + encodeURIComponent(id), { method: 'PUT', json: payload });
      } else {
        await adminApiRequest('/api/admin/categories', { method: 'POST', json: payload });
      }
      await loadCategories();
      clearForm();
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      els.save.disabled = false;
    }
  });

  els.reset.addEventListener('click', () => clearForm());
  els.refresh.addEventListener('click', () => loadCategories().catch((e) => setError(e.message)));
  els.newBtn.addEventListener('click', () => clearForm());

  try {
    await loadCategories();
    clearForm();
  } catch (e) {
    setError(e && e.message ? e.message : String(e));
  }
})();
