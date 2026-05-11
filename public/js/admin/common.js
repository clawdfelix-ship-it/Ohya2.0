function adminEscapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function adminRenderJson(el, data) {
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

async function adminApiRequest(path, { method = 'GET', json, formData } = {}) {
  const init = { method, headers: { Accept: 'application/json' } };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  if (formData) {
    init.body = formData;
  }

  const r = await fetch(path, init);
  const isJson = (r.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = typeof body === 'string' ? body : (body && body.error ? body.error : JSON.stringify(body));
    const e = new Error(`HTTP ${r.status}: ${msg}`);
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return body;
}

async function adminApiGet(path) {
  return adminApiRequest(path, { method: 'GET' });
}

function $(sel) {
  return document.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

window.AdminCommon = {
  $,
  el,
  adminEscapeHtml,
  adminRenderJson,
  adminApiGet,
  adminApiRequest,
};
