(async function () {
  const { $, el, adminApiRequest } = window.AdminCommon;

  const els = {
    search: $('#wm-search'),
    refresh: $('#wm-refresh'),
    error: $('#wm-error'),
    tbody: $('#wm-tbody'),
    prev: $('#wm-prev'),
    next: $('#wm-next'),
    page: $('#wm-page'),
  };

  let currentPage = 1;
  let totalPages = 1;
  let total = 0;
  let busy = false;

  function setError(msg) {
    if (!els.error) return;
    if (!msg) { els.error.classList.add('hidden'); els.error.textContent = ''; return; }
    els.error.classList.remove('hidden');
    els.error.textContent = msg;
  }

  function simCell(sim) {
    const n = Number(sim);
    const pct = n ? Math.round(n * 100) + '%' : '—';
    const cls = n >= 0.6 ? 'text-amber-700' : 'text-gray-500';
    return el('span', { class: 'tabular-nums ' + cls, text: pct });
  }

  function renderRows(items) {
    els.tbody.textContent = '';
    for (const r of items || []) {
      const act = async (kind) => {
        if (busy) return;
        busy = true;
        try {
          await adminApiRequest(`/api/admin/wholesale-match/${r.sku_id}/${kind}`, { method: 'POST' });
          await load();
        } catch (e) {
          setError(e.message);
        } finally {
          busy = false;
        }
      };

      const tr = el('tr', {}, [
        el('td', {}, [
          r.product_slug
            ? el('a', { class: 'admin-link-btn', href: `/product/${r.product_id}`, target: '_blank', text: r.product_name || '' })
            : el('span', { text: r.product_name || '' }),
        ]),
        el('td', { class: 'text-gray-500', text: r.sku || `#${r.sku_id}` }),
        el('td', { class: 'tabular-nums', text: r.barcode || '' }),
        el('td', { class: 'tabular-nums', text: r.match_source_jan || '' }),
        el('td', {}, [simCell(r.match_sim)]),
        el('td', { class: 'tabular-nums', text: r.cost_price_jpy != null ? '¥' + Number(r.cost_price_jpy).toFixed(0) : '' }),
        el('td', { class: 'tabular-nums text-amber-700', text: r.wholesale_price_hkd != null ? 'HK$' + Number(r.wholesale_price_hkd).toFixed(2) : '' }),
        el('td', { class: 'whitespace-nowrap' }, [
          el('button', { class: 'admin-link-btn', type: 'button', text: '確認', onclick: () => act('confirm') }),
          el('span', { text: ' ' }),
          el('button', { class: 'admin-link-btn text-red-600', type: 'button', text: '駁回', onclick: () => act('reject') }),
        ]),
      ]);
      els.tbody.appendChild(tr);
    }
  }

  async function load() {
    setError('');
    const params = new URLSearchParams({ page: String(currentPage), page_size: '50' });
    const s = (els.search.value || '').trim();
    if (s) params.set('search', s);
    const data = await adminApiRequest('/api/admin/wholesale-match/unverified?' + params.toString());
    total = data.pagination.total;
    totalPages = data.pagination.total_pages;
    currentPage = data.pagination.page;
    els.page.textContent = `第 ${currentPage} / ${totalPages} 頁（共 ${total} 項）`;
    renderRows(data.items);
  }

  els.refresh.addEventListener('click', () => { currentPage = 1; load().catch((e) => setError(e.message)); });
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); currentPage = 1; load().catch((x) => setError(x.message)); }
  });
  els.prev.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; load().catch((e) => setError(e.message)); }
  });
  els.next.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; load().catch((e) => setError(e.message)); }
  });

  try { await load(); } catch (e) { setError(e && e.message ? e.message : String(e)); }
})();
