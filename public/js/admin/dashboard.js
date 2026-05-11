(async function() {
  const pre = document.getElementById('admin-data');
  try {
    const data = await window.AdminCommon.adminApiGet('/api/admin/dashboard');
    window.AdminCommon.adminRenderJson(pre, data);
  } catch (e) {
    pre.textContent = String(e && e.message ? e.message : e);
  }
})();

