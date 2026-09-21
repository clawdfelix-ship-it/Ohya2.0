(async function () {
  const { $, adminEscapeHtml: esc, adminApiGet } = window.AdminCommon;

  const STATUS_LABEL = {
    pending: '待付款',
    paid: '已付款',
    shipping: '派送中',
    completed: '已完成',
    cancelled: '已取消',
  };
  const STATUS_BADGE = {
    pending: 'badge-pending',
    paid: 'badge-paid',
    shipping: 'badge-shipping',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
  };

  const money = (n) => 'HK$ ' + Number(n || 0).toLocaleString('zh-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function showError(message) {
    const box = $('#dashboard-error');
    if (!box) return;
    if (!message) {
      box.classList.add('hidden');
      box.textContent = '';
    } else {
      box.classList.remove('hidden');
      box.textContent = message;
    }
  }

  function renderKpis(stats) {
    const s = stats || {};
    setText('#kpi-today-revenue', money(s.today_revenue));
    setText('#kpi-today-orders', `今日 ${s.today_orders || 0} 單`);
    setText('#kpi-week-revenue', money(s.week_revenue));
    setText('#kpi-week-orders', `近 7 日 ${s.week_orders || 0} 單`);
    setText('#kpi-actionable', String(s.actionable_orders ?? s.pending_orders ?? 0));
    setText('#kpi-products', String(s.products || 0));
    setText('#kpi-lowstock', `低庫存 ${s.low_stock || 0} 款`);
    setText('#kpi-users', String(s.users || 0));
    setText('#kpi-categories', `分類 ${s.categories || 0} 個`);

    const low = $('#qa-lowstock');
    if (low && (s.low_stock || 0) > 0) {
      low.classList.add('!border-red-300', '!text-red-700');
      low.textContent = `低庫存預警（${s.low_stock}）`;
    }
  }

  function renderRecentOrders(orders) {
    const tbody = $('#recent-orders-tbody');
    if (!tbody) return;
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-sm text-gray-400">暫時未有訂單</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map((o) => {
        const status = STATUS_LABEL[o.status] ? esc(STATUS_LABEL[o.status]) : esc(o.status || '');
        const badge = STATUS_BADGE[o.status] || 'badge-inactive';
        const who = esc(o.username || o.contact_name || '—');
        return `
          <tr>
            <td class="font-semibold"><a class="admin-link-btn" href="/admin/orders">#${esc(o.id)}</a></td>
            <td>${who}</td>
            <td class="font-semibold tabular-nums">${money(o.total_amount)}</td>
            <td><span class="admin-badge ${badge}">${status}</span></td>
            <td class="text-gray-500 tabular-nums">${fmtTime(o.created_at)}</td>
          </tr>`;
      })
      .join('');
  }

  async function load() {
    try {
      showError('');
      const data = await adminApiGet('/api/admin/dashboard');
      renderKpis(data.stats);
      renderRecentOrders(data.recent_orders);
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }

  await load();
  setInterval(load, 5 * 60 * 1000);
})();
