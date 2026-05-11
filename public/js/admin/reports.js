(async function () {
  const { $, el, adminApiRequest } = window.AdminCommon;

  const els = {
    start: $('#rp-start'),
    end: $('#rp-end'),
    group: $('#rp-group'),
    last7: $('#rp-last-7'),
    last30: $('#rp-last-30'),
    last90: $('#rp-last-90'),
    refresh: $('#rp-refresh'),
    exportBtn: $('#rp-export'),
    error: $('#rp-error'),
    overview: $('#rp-overview'),
    salesChart: $('#rp-sales-chart'),
    salesTbody: $('#rp-sales-tbody'),
    topTbody: $('#rp-top-tbody'),
  };

  function setError(msg) {
    if (!els.error) return;
    if (!msg) {
      els.error.classList.add('hidden');
      els.error.textContent = '';
      return;
    }
    els.error.classList.remove('hidden');
    els.error.textContent = msg;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toYmd(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }

  function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + Number(days || 0));
    return x;
  }

  function parseGroupBy(raw) {
    const v = String(raw || '').trim();
    if (v === 'day' || v === 'week' || v === 'month') return v;
    return 'day';
  }

  function getRangeFromInputs() {
    const now = new Date();
    const defaultEnd = toYmd(now);
    const defaultStart = toYmd(addDays(now, -29));

    let start = (els.start && els.start.value) ? String(els.start.value) : '';
    let end = (els.end && els.end.value) ? String(els.end.value) : '';
    if (!start) start = defaultStart;
    if (!end) end = defaultEnd;

    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s.getTime() > e.getTime()) {
        const tmp = start;
        start = end;
        end = tmp;
      }
    }
    if (els.start) els.start.value = start;
    if (els.end) els.end.value = end;
    return { start, end };
  }

  function setRangeLastDays(days) {
    const now = new Date();
    const end = toYmd(now);
    const start = toYmd(addDays(now, -(Number(days) - 1)));
    if (els.start) els.start.value = start;
    if (els.end) els.end.value = end;
  }

  function moneyHKD(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 'HK$ 0.00';
    return 'HK$ ' + x.toFixed(2);
  }

  function numberInt(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 0;
    return Math.trunc(x);
  }

  function renderOverviewCard(title, value) {
    return el('div', { class: 'border border-gray-200 rounded p-2 bg-white' }, [
      el('div', { class: 'text-xs text-gray-500', text: title }),
      el('div', { class: 'font-black', text: value }),
    ]);
  }

  function renderOverview(data) {
    if (!els.overview) return;
    els.overview.textContent = '';
    const d = data || {};
    const items = [
      { title: '今日訂單', value: String(numberInt(d.today && d.today.orders)) },
      { title: '今日銷售額', value: moneyHKD(d.today && d.today.sales) },
      { title: '昨日訂單', value: String(numberInt(d.yesterday && d.yesterday.orders)) },
      { title: '昨日銷售額', value: moneyHKD(d.yesterday && d.yesterday.sales) },
      { title: '7日訂單', value: String(numberInt(d.seven_days && d.seven_days.orders)) },
      { title: '7日銷售額', value: moneyHKD(d.seven_days && d.seven_days.sales) },
      { title: '客戶數', value: String(numberInt(d.total && d.total.customers)) },
      { title: '活躍商品', value: String(numberInt(d.total && d.total.active_products)) },
    ];
    for (const it of items) {
      els.overview.appendChild(renderOverviewCard(it.title, it.value));
    }
  }

  function renderSalesTable(rows) {
    if (!els.salesTbody) return;
    els.salesTbody.textContent = '';
    for (const r of rows || []) {
      const dateGroup = r.date_group !== undefined ? String(r.date_group) : '';
      const orderCount = r.order_count !== undefined ? String(r.order_count) : '';
      const sales = moneyHKD(r.total_sales);
      const customers = r.customer_count !== undefined ? String(r.customer_count) : '';
      const aov = moneyHKD(r.avg_order_value);
      els.salesTbody.appendChild(el('tr', {}, [
        el('td', { text: dateGroup }),
        el('td', { text: orderCount }),
        el('td', { text: sales }),
        el('td', { text: customers }),
        el('td', { text: aov }),
      ]));
    }
  }

  function renderSalesChart(rows) {
    if (!els.salesChart) return;
    els.salesChart.textContent = '';
    const points = (rows || [])
      .map((r) => ({ x: String(r.date_group ?? ''), y: Number(r.total_sales) }))
      .filter((p) => p.x && !Number.isNaN(p.y));
    if (points.length < 2) return;

    const width = 720;
    const height = 180;
    const pad = 12;
    const ys = points.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(1e-9, maxY - minY);

    const coords = points
      .slice()
      .reverse()
      .map((p, idx, arr) => {
        const x = pad + (idx * (width - pad * 2)) / Math.max(1, arr.length - 1);
        const y = pad + ((maxY - p.y) * (height - pad * 2)) / span;
        return { x, y, label: p.x, value: p.y };
      });

    const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const svgNS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs = {}, children = []) {
      const node = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      for (const c of children) {
        if (c === null || c === undefined) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
      return node;
    }

    const svg = svgEl('svg', { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}` }, [
      svgEl('rect', { x: '0', y: '0', width: String(width), height: String(height), fill: '#fff' }),
      svgEl('polyline', { fill: 'none', stroke: '#111', 'stroke-width': '2', points: poly }),
      svgEl('circle', { cx: String(coords[0].x), cy: String(coords[0].y), r: '3', fill: '#111' }),
      svgEl('circle', { cx: String(coords[coords.length - 1].x), cy: String(coords[coords.length - 1].y), r: '3', fill: '#111' }),
    ]);
    els.salesChart.appendChild(svg);
  }

  function renderTopProducts(rows) {
    if (!els.topTbody) return;
    els.topTbody.textContent = '';
    for (const r of rows || []) {
      const name = r.name ? String(r.name) : (r.id ? `#${r.id}` : '');
      const qty = r.total_quantity !== undefined ? String(r.total_quantity) : '';
      const revenue = moneyHKD(r.total_revenue);
      els.topTbody.appendChild(el('tr', {}, [
        el('td', { text: name }),
        el('td', { text: qty }),
        el('td', { text: revenue }),
      ]));
    }
  }

  async function loadAll() {
    setError('');
    const { start, end } = getRangeFromInputs();
    const groupBy = parseGroupBy(els.group ? els.group.value : 'day');
    if (els.group) els.group.value = groupBy;

    const salesParams = new URLSearchParams({ start_date: start, end_date: end, group_by: groupBy });
    const topParams = new URLSearchParams({ start_date: start, end_date: end, limit: '20' });

    const p1 = adminApiRequest('/api/admin/dashboard/overview');
    const p2 = adminApiRequest('/api/admin/reports/sales-by-date?' + salesParams.toString());
    const p3 = adminApiRequest('/api/admin/reports/top-products?' + topParams.toString());

    const [overview, sales, top] = await Promise.allSettled([p1, p2, p3]);

    if (overview.status === 'fulfilled') {
      renderOverview(overview.value);
    } else {
      setError(overview.reason && overview.reason.message ? overview.reason.message : String(overview.reason));
    }

    if (sales.status === 'fulfilled') {
      const rows = (sales.value && sales.value.data) ? sales.value.data : [];
      renderSalesChart(rows);
      renderSalesTable(rows);
    } else {
      setError(sales.reason && sales.reason.message ? sales.reason.message : String(sales.reason));
    }

    if (top.status === 'fulfilled') {
      renderTopProducts((top.value && top.value.products) ? top.value.products : []);
    } else {
      setError(top.reason && top.reason.message ? top.reason.message : String(top.reason));
    }
  }

  function exportOrdersCsv() {
    const { start, end } = getRangeFromInputs();
    const params = new URLSearchParams({ start_date: start, end_date: end });
    window.location.href = '/api/admin/reports/export-orders/csv?' + params.toString();
  }

  if (els.last7) els.last7.addEventListener('click', () => { setRangeLastDays(7); loadAll().catch((e) => setError(e.message)); });
  if (els.last30) els.last30.addEventListener('click', () => { setRangeLastDays(30); loadAll().catch((e) => setError(e.message)); });
  if (els.last90) els.last90.addEventListener('click', () => { setRangeLastDays(90); loadAll().catch((e) => setError(e.message)); });
  if (els.refresh) els.refresh.addEventListener('click', () => loadAll().catch((e) => setError(e.message)));
  if (els.exportBtn) els.exportBtn.addEventListener('click', () => exportOrdersCsv());

  try {
    setRangeLastDays(30);
    await loadAll();
  } catch (e) {
    setError(e && e.message ? e.message : String(e));
  }
})();
